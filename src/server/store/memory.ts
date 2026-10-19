import type { DefenseRecord, RaidRecord, Store } from "./types";

export type MemoryState = { raids: Record<string, RaidRecord>; defenses: Record<string, DefenseRecord>; kv?: Record<string, unknown> };

/** In-process store. Used by tests, and as the base of the file store. */
export function createMemoryStore(
  state: MemoryState = { raids: {}, defenses: {} },
  onChange: () => void = () => {},
): Store & { state: MemoryState } {
  const copy = <T,>(v: T): T => structuredClone(v);
  return {
    kind: "memory",
    state,
    async createRaid(r) {
      state.raids[r.id] = copy(r);
      onChange();
    },
    async getRaid(id) {
      const r = state.raids[id];
      return r ? copy(r) : null;
    },
    async updateRaid(next, expectedMoves) {
      const cur = state.raids[next.id];
      if (!cur || cur.moves.length !== expectedMoves) return false;
      state.raids[next.id] = copy(next);
      onChange();
      return true;
    },
    async abandonActive(raider, tokenId) {
      let changed = false;
      for (const r of Object.values(state.raids)) {
        if (r.raider === raider && r.tokenId === tokenId && r.status === "active") {
          changed = true;
          if (r.moves.length === 0) {
            delete state.raids[r.id]; // never played: nothing worth keeping
            continue;
          }
          r.status = "abandoned";
          r.updatedAt = new Date().toISOString();
          changed = true;
        }
      }
      if (changed) onChange();
    },
    async listRaids(tokenId, limit) {
      return Object.values(state.raids)
        .filter((r) => r.tokenId === tokenId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(copy);
    },
    async listFinishedRaids(limit) {
      return Object.values(state.raids)
        .filter((r) => r.status === "breach" || r.status === "defeated" || r.status === "out_of_moves")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(copy);
    },
    async getDefense(tokenId) {
      const d = state.defenses[String(tokenId)];
      return d ? copy(d) : null;
    },
    async getKv<T>(key: string) {
      const v = state.kv?.[key];
      return v === undefined ? null : (copy(v) as T);
    },
    async setKv(key, value) {
      state.kv ??= {};
      state.kv[key] = copy(value);
      onChange();
    },
    async insertKv(key, value) {
      // No await between the check and the write, so this is atomic within the process.
      state.kv ??= {};
      if (key in state.kv) return false;
      state.kv[key] = copy(value);
      onChange();
      return true;
    },
    async listDefenses() {
      return Object.values(state.defenses).map(copy);
    },
    async saveDefense(d) {
      state.defenses[String(d.tokenId)] = copy(d);
      onChange();
    },
  };
}
