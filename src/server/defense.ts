// Owner-only trap saving. Ownership is re-checked onchain (ownerOf) on every read and save,
// so when a Chog is transferred the new holder takes over the room immediately.

import { GAME, validateTraps, type Trap } from "@/engine";
import { sameAddress } from "./auth";
import type { RaidDeps, Result } from "./raids";

/** Rebuild traps from untrusted JSON: known fields only, right types, bounded size. */
export function parseTraps(input: unknown): Trap[] | null {
  if (!Array.isArray(input) || input.length > GAME.maxTrapSlots) return null;
  const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);
  const out: Trap[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const t = raw as Record<string, unknown>;
    const x = int(t.x);
    const y = int(t.y);
    if (x === null || y === null) return null;
    switch (t.type) {
      case "spike":
      case "teleporter":
        out.push({ type: t.type, x, y });
        break;
      case "guard":
        if (t.axis !== "h" && t.axis !== "v") return null;
        out.push({ type: "guard", x, y, axis: t.axis });
        break;
      case "lockdoor": {
        const k = t.key as Record<string, unknown> | undefined;
        const kx = int(k?.x);
        const ky = int(k?.y);
        if (kx === null || ky === null) return null;
        out.push({ type: "lockdoor", x, y, key: { x: kx, y: ky } });
        break;
      }
      default:
        return null;
    }
  }
  return out;
}

export type DefenseView = {
  tokenId: number;
  /** Current holder onchain. */
  owner: string | null;
  isOwner: boolean;
  /** Saved traps; only sent to the owner. */
  traps: Trap[] | null;
  defended: boolean;
  updatedAt: string | null;
};

export async function getDefenseView(deps: RaidDeps, tokenId: number, viewer: string | null): Promise<Result<DefenseView>> {
  const [owner, defense] = await Promise.all([deps.ownerOf(tokenId), deps.store.getDefense(tokenId)]);
  if (!owner) return { ok: false, status: 404, error: "No such Chog." };
  const isOwner = sameAddress(owner, viewer);
  return {
    ok: true,
    value: {
      tokenId,
      owner,
      isOwner,
      traps: isOwner ? (defense?.traps ?? null) : null,
      defended: !!defense,
      updatedAt: defense?.updatedAt ?? null,
    },
  };
}

export async function saveDefense(deps: RaidDeps, tokenId: number, wallet: string | null, input: unknown): Promise<Result<DefenseView>> {
  if (!wallet) return { ok: false, status: 401, error: "Connect your wallet to save." };
  const traps = parseTraps(input);
  if (!traps) return { ok: false, status: 400, error: "Those traps don't look right." };
  const [room, owner] = await Promise.all([deps.getRoom(tokenId), deps.ownerOf(tokenId)]);
  if (!room || !owner) return { ok: false, status: 404, error: "No such Chog." };
  if (!sameAddress(owner, wallet)) return { ok: false, status: 403, error: `Only the holder of Chog #${tokenId} can defend it.` };
  const check = validateTraps(room, traps);
  if (!check.ok) return { ok: false, status: 422, error: check.error };
  const updatedAt = new Date().toISOString();
  await deps.store.saveDefense({ tokenId, owner, traps, updatedAt });
  return { ok: true, value: { tokenId, owner, isOwner: true, traps, defended: true, updatedAt } };
}
