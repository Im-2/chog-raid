import { createClient } from "@supabase/supabase-js";
import type { DefenseRecord, RaidRecord, Store } from "./types";

type RaidRow = {
  id: string;
  token_id: number;
  raider: string;
  practice: boolean;
  defender: string | null;
  par: number | null;
  difficulty: number | null;
  traps: RaidRecord["traps"];
  moves: string;
  move_count: number;
  status: RaidRecord["status"];
  hp: number;
  moves_left: number;
  end_x: number;
  end_y: number;
  created_at: string;
  updated_at: string;
};

const toRow = (r: RaidRecord): RaidRow => ({
  id: r.id,
  token_id: r.tokenId,
  raider: r.raider,
  practice: r.practice,
  defender: r.defender,
  par: r.par ?? null,
  difficulty: r.difficulty ?? null,
  traps: r.traps,
  moves: r.moves,
  move_count: r.moves.length,
  status: r.status,
  hp: r.hp,
  moves_left: r.movesLeft,
  end_x: r.endX,
  end_y: r.endY,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
});

const fromRow = (r: RaidRow): RaidRecord => ({
  id: r.id,
  tokenId: r.token_id,
  raider: r.raider,
  practice: r.practice,
  defender: r.defender,
  par: r.par,
  difficulty: r.difficulty ?? undefined,
  traps: r.traps,
  moves: r.moves,
  status: r.status,
  hp: r.hp,
  movesLeft: r.moves_left,
  endX: r.end_x,
  endY: r.end_y,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Postgres via Supabase (schema: supabase/migrations). Server-side only: uses the service role key. */
export function createSupabaseStore(url: string, serviceKey: string): Store {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const check = <T,>({ data, error }: { data: T; error: { message: string } | null }): T => {
    if (error) throw new Error(`supabase: ${error.message}`);
    return data;
  };

  return {
    kind: "supabase",
    async createRaid(r) {
      check(await db.from("raids").insert(toRow(r)));
    },
    async getRaid(id) {
      const row = check(await db.from("raids").select("*").eq("id", id).maybeSingle());
      return row ? fromRow(row as RaidRow) : null;
    },
    async updateRaid(next, expectedMoves) {
      const rows = check(
        await db.from("raids").update(toRow(next)).eq("id", next.id).eq("move_count", expectedMoves).select("id"),
      );
      return (rows ?? []).length === 1;
    },
    async abandonActive(raider, tokenId) {
      check(await db.from("raids").delete().eq("raider", raider).eq("token_id", tokenId).eq("status", "active").eq("move_count", 0));
      check(
        await db
          .from("raids")
          .update({ status: "abandoned", updated_at: new Date().toISOString() })
          .eq("raider", raider)
          .eq("token_id", tokenId)
          .eq("status", "active"),
      );
    },
    async listRaids(tokenId, limit) {
      const rows = check(
        await db.from("raids").select("*").eq("token_id", tokenId).order("created_at", { ascending: false }).limit(limit),
      );
      return (rows as RaidRow[]).map(fromRow);
    },
    async listFinishedRaids(limit) {
      const rows = check(
        await db
          .from("raids")
          .select("id,token_id,raider,practice,defender,par,difficulty,moves,status,hp,moves_left,end_x,end_y,created_at,updated_at")
          .in("status", ["breach", "dead", "exhausted"])
          .order("created_at", { ascending: false })
          .limit(limit),
      );
      return (rows as RaidRow[]).map((r) => fromRow({ ...r, traps: [] }));
    },
    async getDefense(tokenId) {
      const row = check(await db.from("defenses").select("*").eq("token_id", tokenId).maybeSingle()) as {
        token_id: number;
        owner: string;
        traps: DefenseRecord["traps"];
        updated_at: string;
      } | null;
      return row ? { tokenId: row.token_id, owner: row.owner, traps: row.traps, updatedAt: row.updated_at } : null;
    },
    async getKv<T>(key: string) {
      const row = check(await db.from("kv").select("value").eq("key", key).maybeSingle()) as { value: T } | null;
      return row ? row.value : null;
    },
    async setKv(key, value) {
      check(await db.from("kv").upsert({ key, value, updated_at: new Date().toISOString() }));
    },
    async listDefenses() {
      const rows = check(await db.from("defenses").select("*")) as { token_id: number; owner: string; traps: DefenseRecord["traps"]; updated_at: string }[];
      return rows.map((r) => ({ tokenId: r.token_id, owner: r.owner, traps: r.traps, updatedAt: r.updated_at }));
    },
    async saveDefense(d) {
      check(await db.from("defenses").upsert({ token_id: d.tokenId, owner: d.owner, traps: d.traps, updated_at: d.updatedAt }));
    },
  };
}
