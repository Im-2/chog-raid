"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badges, type BadgeT } from "../progress/bits";
import styles from "./game.module.css";

type Rec = {
  defended: boolean;
  defender: string | null;
  defenderId: string | null;
  defenderBadges: BadgeT[];
  raids: number;
  breaches: number;
  defenseRate: number | null;
  fastestClear: { moves: number; raider: string } | null;
};

/** A room's raid record, for the info drawer. */
export function RoomRecord({ tokenId }: { tokenId: number }) {
  const [rec, setRec] = useState<Rec | null | "error">(null);
  useEffect(() => {
    fetch(`/api/rooms/${tokenId}/stats`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setRec)
      .catch(() => setRec("error"));
  }, [tokenId]);

  if (rec === "error") return <p className="small muted">Record unavailable right now.</p>;
  if (!rec) return <p className="small muted">Loading record…</p>;
  return (
    <>
      <p className="small" style={{ margin: "0 0 8px" }}>
        {rec.defended ? (
          <>
            Defended by{" "}
            <Link href={`/u/${encodeURIComponent(rec.defenderId ?? "")}`}>
              <b className="num">{rec.defender}</b>
            </Link>{" "}
            <Badges badges={rec.defenderBadges} />
          </>
        ) : (
          <>No defender yet: raiders face practice traps.</>
        )}
      </p>
      <dl className={styles.recordGrid}>
        <div>
          <dt>Raids</dt>
          <dd className="num">{rec.raids}</dd>
        </div>
        <div>
          <dt>Got through</dt>
          <dd className="num">{rec.breaches}</dd>
        </div>
        <div>
          <dt>Held</dt>
          <dd className="num">{rec.defenseRate === null ? "—" : `${Math.round(rec.defenseRate * 100)}%`}</dd>
        </div>
        <div>
          <dt>Fastest clear</dt>
          <dd className="num">{rec.fastestClear ? rec.fastestClear.moves : "—"}</dd>
        </div>
      </dl>
      {rec.fastestClear && <p className="small muted">Record held by {rec.fastestClear.raider}.</p>}
    </>
  );
}
