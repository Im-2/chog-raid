import styles from "./game.module.css";

export function Hearts({ hp, max }: { hp: number; max: number }) {
  return (
    <span className={styles.hearts} aria-label={`${hp} of ${max} HP`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 7 6" className={i < hp ? styles.heart : styles.heartLost} aria-hidden>
          <path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" />
        </svg>
      ))}
    </span>
  );
}

export function Hud({ hp, maxHp, movesLeft, maxMoves, keys }: { hp: number; maxHp: number; movesLeft: number; maxMoves: number; keys: number }) {
  const pct = Math.max(0, Math.min(100, (movesLeft / maxMoves) * 100));
  return (
    <div className={styles.hud}>
      <div className={styles.hudItem}>
        <span className={styles.hudLabel}>HP</span>
        <Hearts hp={hp} max={maxHp} />
      </div>
      <div className={styles.hudItem} style={{ flex: 1 }}>
        <span className={styles.hudLabel}>Moves</span>
        <div className={styles.movesBar} aria-hidden>
          <div className={styles.movesFill} style={{ width: `${pct}%` }} data-low={pct < 25 || undefined} />
        </div>
        <b className={styles.hudValue}>{movesLeft}</b>
      </div>
      {keys > 0 && (
        <div className={styles.hudItem}>
          <span className={styles.hudLabel}>Keys</span>
          <b className={styles.hudValue} style={{ color: "var(--gold)" }}>
            {keys}
          </b>
        </div>
      )}
    </div>
  );
}
