"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RETENTION } from "@/config/retention";
import { usePlayer } from "./bits";
import styles from "./progress.module.css";

/** Once per season: how you finished last season, and whether you earned a badge. */
export function SeasonRecap() {
  const me = usePlayer();
  const last = me?.player?.lastSeason;
  const key = last ? `chograid:recap:${last.index}` : null;
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!key) return;
    try {
      setHidden(!!localStorage.getItem(key));
    } catch {
      setHidden(false);
    }
  }, [key]);

  if (!last || hidden || (!last.raider && !last.warden)) return null;
  const place = (r: { place: number; points: number; of: number } | null, role: string) =>
    r ? (
      <>
        #{r.place} {role} of {r.of} with <b className="num">{r.points}</b> pts
        {r.place <= RETENTION.season.badgePlaces ? " · badge earned!" : ""}
      </>
    ) : null;

  return (
    <div className={styles.recap} role="status">
      <p>
        <b>Season {last.index + 1} is over.</b> You finished {place(last.raider, "Raider")}
        {last.raider && last.warden ? " and " : ""}
        {place(last.warden, "Warden")}. A new season has started.
      </p>
      <span style={{ display: "flex", gap: 8 }}>
        <Link className="btn" href={`/u/${encodeURIComponent(me!.player!.id)}`}>
          My profile
        </Link>
        <button
          className="btn"
          onClick={() => {
            setHidden(true);
            try {
              if (key) localStorage.setItem(key, "1");
            } catch {}
          }}
        >
          Got it
        </button>
      </span>
    </div>
  );
}
