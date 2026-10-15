import type { Difficulty } from "@/lib/difficulty";
import styles from "./difficulty.module.css";

/** Tier name + difficulty rating (5 pips) + score, on every room card, room page, Atlas preview and leaderboard row. */
export function DifficultyBadge({ d, size = "md", showScore = true }: { d: Difficulty | null; size?: "sm" | "md"; showScore?: boolean }) {
  if (!d) return null;
  return (
    <span
      className={styles.badge}
      data-tier={d.tier}
      data-size={size}
      title={`${d.tierName} (${d.label}) · difficulty ${d.score}/100, rating ${d.rating}/5`}
      aria-label={`${d.tierName} room, difficulty ${d.rating} of 5`}
    >
      <b className={styles.tier}>{d.tier === "legendary" ? "Boss" : d.tierName}</b>
      <span className={styles.pips} aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} data-on={i < d.rating || undefined} />
        ))}
      </span>
      {showScore && <span className={styles.score}>{d.score}</span>}
    </span>
  );
}
