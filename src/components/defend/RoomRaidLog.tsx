"use client";

import { useCallback, useEffect, useState } from "react";
import type { RaidInput, Trap } from "@/engine";
import type { RaidSummary } from "@/server/raids";
import styles from "./defend.module.css";

type Row = Omit<RaidSummary, "raider"> & { raider: string; mine: boolean };

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/** Raids recorded on the server for this room, with replays where the viewer is allowed. */
export function RoomRaidLog({ tokenId, onReplay }: { tokenId: number; onReplay: (r: { traps: Trap[]; moves: RaidInput[]; native: boolean; engine: number }) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(`/api/rooms/${tokenId}/raids`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setRows(((await res.json()) as { raids: Row[] }).raids);
    } catch {
      setError(true);
    }
  }, [tokenId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replay = async (id: string) => {
    setReplayError(null);
    const res = await fetch(`/api/raids/${id}/replay`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setReplayError(data.error ?? "Replay unavailable.");
    onReplay({ traps: data.traps, moves: data.moves, native: !!data.native, engine: data.engine ?? (data.native ? 2 : 1) });
  };

  if (error)
    return (
      <p className="small" style={{ color: "var(--blood)", margin: 0 }}>
        Couldn&apos;t load raids.{" "}
        <button className="btn" onClick={load}>
          Retry
        </button>
      </p>
    );
  if (!rows) return <p className="small muted" style={{ margin: 0 }}>Loading raids…</p>;
  if (rows.length === 0)
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Nobody has raided this room yet.
      </p>
    );

  const done = rows.filter((r) => r.status !== "active");
  const breaches = done.filter((r) => r.status === "breach").length;
  return (
    <>
      <p className="small" style={{ margin: "0 0 8px" }}>
        Raided <b>{done.length}</b> time{done.length === 1 ? "" : "s"}, <b>{breaches}</b> got through.
      </p>
      {replayError && <p className="small" style={{ color: "var(--blood)" }}>{replayError}</p>}
      <ul className={styles.log}>
        {rows.map((r) => (
          <li key={r.id}>
            <span className={styles.outcome} data-won={r.status === "breach" || undefined} data-live={r.status === "active" || undefined}>
              {r.status === "breach" ? "Breached" : r.status === "defeated" ? "Died" : r.status === "active" ? "Live" : "No moves"}
            </span>
            <span className="small muted">
              {r.mine ? "You" : r.raider} · {r.moves} moves · {ago(r.createdAt)}
              {r.practice ? " · practice" : ""}
            </span>
            {r.status !== "active" ? (
              <button className="btn" onClick={() => replay(r.id)}>
                Replay
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
