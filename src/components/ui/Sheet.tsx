"use client";

import { useEffect, useRef } from "react";
import styles from "./ui.module.css";

/** Modal dialog or side drawer (bottom sheet on phones). Closes on Esc and backdrop click. */
export function Sheet({
  open,
  onClose,
  title,
  variant = "modal",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  variant?: "modal" | "drawer";
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.backdrop} data-variant={variant} onClick={onClose}>
      <div
        ref={panel}
        className={styles.sheet}
        data-variant={variant}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.sheetHead}>
          <h2>{title}</h2>
          <button className="btn icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </div>
  );
}
