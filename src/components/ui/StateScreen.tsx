import Link from "next/link";
import styles from "./state.module.css";

/** Full-screen loading / empty / error state in the dungeon style. */
export function StateScreen({
  kind,
  title,
  body,
  action,
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <main className={styles.wrap} aria-busy={kind === "loading" || undefined}>
      <div className={styles.torch} data-kind={kind} aria-hidden />
      <h1 className={styles.title}>{title}</h1>
      {body && <p className="muted">{body}</p>}
      <div className={styles.actions}>
        {action}
        {kind !== "loading" && (
          <Link href="/" className="btn">
            All rooms
          </Link>
        )}
      </div>
    </main>
  );
}

export function InlineState({ kind, title, body, action }: { kind: "loading" | "empty" | "error"; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className={styles.inline} data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      <b>{title}</b>
      {body && <p className="muted small">{body}</p>}
      {action}
    </div>
  );
}
