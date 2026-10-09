import type { RaidOutcome, Trap } from "@/engine";

/** "abandoned" = the raider started another raid on the same room before finishing this one. */
export type RaidStatus = "active" | "abandoned" | Exclude<RaidOutcome, "incomplete">;

/** One raid attempt. `moves` is the full move string (e.g. "RRUD"); it is the replay. */
export type RaidRecord = {
  id: string;
  tokenId: number;
  /** Guest id now; wallet address once sign-in exists (milestone 5). */
  raider: string;
  /** True when the room had no saved defense and practice traps were used. */
  practice: boolean;
  /** Who defended the room when the raid started (the defense's owner); null for practice. */
  defender: string | null;
  /** Traps as they were when the raid started, so replays stay exact after edits. */
  traps: Trap[];
  moves: string;
  status: RaidStatus;
  hp: number;
  movesLeft: number;
  endX: number;
  endY: number;
  createdAt: string;
  updatedAt: string;
};

export type DefenseRecord = { tokenId: number; owner: string; traps: Trap[]; updatedAt: string };

export interface Store {
  readonly kind: "file" | "supabase" | "memory";
  createRaid(r: RaidRecord): Promise<void>;
  getRaid(id: string): Promise<RaidRecord | null>;
  /**
   * Write a raid only if it still has `expectedMoves` moves (optimistic concurrency, so two
   * racing move requests can't both apply). Returns false if someone else got there first.
   */
  updateRaid(next: RaidRecord, expectedMoves: number): Promise<boolean>;
  /** Mark this raider's unfinished raids on a room as given up (raids with no moves are deleted). */
  abandonActive(raider: string, tokenId: number): Promise<void>;
  /** Newest first. */
  listRaids(tokenId: number, limit: number): Promise<RaidRecord[]>;
  /** Saved defense for a room. */
  getDefense(tokenId: number): Promise<DefenseRecord | null>;
  saveDefense(d: DefenseRecord): Promise<void>;
}
