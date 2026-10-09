import "server-only";
import { raiderLabel } from "./identity";
import type { Snapshot } from "./progress";
import { getStore } from "./store";

const seenKey = (wallet: string) => `seen:${wallet.toLowerCase()}`;
const lc = (s: string) => s.toLowerCase();

/** Raids on rooms this wallet defended (newest first), excluding the holder's own test runs. */
function raidsOnMyRooms(snap: Snapshot, wallet: string) {
  return snap.raids
    .filter((r) => !r.practice && r.defender && lc(r.defender) === lc(wallet) && lc(r.raider) !== lc(wallet))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function unreadAlerts(snap: Snapshot, wallet: string): Promise<number> {
  const seen = (await getStore().getKv<string>(seenKey(wallet))) ?? "";
  return raidsOnMyRooms(snap, wallet).filter((r) => r.createdAt > seen).length;
}

export async function listAlerts(snap: Snapshot, wallet: string, limit = 30) {
  const seen = (await getStore().getKv<string>(seenKey(wallet))) ?? "";
  const awards = new Map(snap.awards.filter((a) => a.role === "warden").map((a) => [a.raidId, a.points]));
  return raidsOnMyRooms(snap, wallet)
    .slice(0, limit)
    .map((r) => ({
      raidId: r.id,
      tokenId: r.tokenId,
      raider: raiderLabel(r.raider),
      outcome: r.status,
      moves: r.moves.length,
      at: r.createdAt,
      unread: r.createdAt > seen,
      points: awards.get(r.id) ?? 0,
    }));
}

export async function markAlertsSeen(wallet: string) {
  await getStore().setKv(seenKey(wallet), new Date().toISOString());
}
