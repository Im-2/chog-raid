"use client";

import { chogNumber, tokenIdForNumber } from "@/lib/names";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { RoomCard, RoomSort } from "@/lib/collection";
import { InlineState } from "../ui/StateScreen";
import styles from "./home.module.css";

type Resp = {
  items: RoomCard[];
  total: number;
  hasMore: boolean;
  reason?: "no-raid-data";
  indexing?: { done: number; total: number };
  error?: string;
};

const FILTERS: { id: RoomSort; label: string }[] = [
  { id: "id", label: "All rooms" },
  { id: "uncleared", label: "Not cleared yet" },
  { id: "raided", label: "Most raided" },
  { id: "undefended", label: "Least defended" },
  { id: "hardest", label: "Hardest" },
];

function Skulls({ n }: { n: number }) {
  return (
    <span className={styles.skulls} aria-label={`Difficulty ${n} of 5`} title={`Difficulty ${n}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} data-on={i < n || undefined} />
      ))}
    </span>
  );
}

export function RoomBrowser() {
  const router = useRouter();
  const [sort, setSort] = useState<RoomSort>("id");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<RoomCard[]>([]);
  const [page, setPage] = useState(0);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data?: Resp }>({ status: "loading" });
  const [progress, setProgress] = useState<{ cleared: Set<number>; total: number } | null>(null);

  useEffect(() => {
    fetch("/api/me/progress", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProgress({ cleared: new Set(j.cleared), total: j.total }))
      .catch(() => {});
  }, []);

  const q = /^\d+$/.test(query.trim()) ? query.trim() : "";

  const load = useCallback(
    async (nextPage: number, signal?: AbortSignal) => {
      setState((s) => ({ ...s, status: "loading" }));
      try {
        const params = new URLSearchParams({ sort, page: String(nextPage) });
        if (q) params.set("q", q);
        const res = await fetch(`/api/rooms?${params}`, { signal });
        const data = (await res.json()) as Resp;
        if (!res.ok) throw new Error(data.error);
        setItems((prev) => (nextPage === 0 ? data.items : [...prev, ...data.items]));
        setPage(nextPage);
        setState({ status: "ready", data });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState({ status: "error" });
      }
    },
    [sort, q],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => load(0, ctrl.signal), q ? 250 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [load, q]);

  // While the collection index builds, refresh "Hardest" every few seconds.
  const indexing = state.data?.indexing;
  useEffect(() => {
    if (!indexing || sort !== "hardest") return;
    const t = setTimeout(() => load(0), 4000);
    return () => clearTimeout(t);
  }, [indexing, sort, load]);

  const data = state.data;
  const firstLoad = state.status === "loading" && items.length === 0;

  return (
    <div className={styles.browser}>
      <div className={styles.toolbar}>
        <h2 className={styles.h2}>
          The dungeon{" "}
          {progress && (
            <span className={styles.progress} title="Rooms you have cleared">
              Cleared <b className="num">{progress.cleared.size}</b> / <span className="num">{progress.total.toLocaleString()}</span>
            </span>
          )}
        </h2>
        <form
          className={styles.search}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q) router.push(`/room/${tokenIdForNumber(q) ?? q}`);
          }}
        >
          <input
            type="search"
            inputMode="numeric"
            placeholder="Search CHOG #"
            aria-label="Search by CHOG number, as shown on OpenSea"
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/[^\d]/g, ""))}
          />
        </form>
      </div>

      <div className={styles.filters} role="tablist" aria-label="Sort rooms">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={sort === f.id}
            className={styles.filter}
            onClick={() => {
              setItems([]);
              setSort(f.id);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!q && (
        <p className={styles.filterNote}>
          {sort === "id"
            ? "Every Chog in the collection."
            : sort === "uncleared"
              ? "Rooms you haven't beaten yet."
            : sort === "raided"
              ? "Rooms with the most raids."
              : sort === "undefended"
                ? "Rooms raiders get through most often."
                : "Rooms whose traits give the defender the most to work with."}
        </p>
      )}

      {indexing && sort === "hardest" && !q && (
        <p className={styles.note} role="status">
          Mapping the whole dungeon: {indexing.done} / {indexing.total} rooms read so far…
        </p>
      )}

      <div className={styles.grid} aria-busy={state.status === "loading"}>
        {firstLoad &&
          Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`${styles.card} ${styles.cardSkeleton}`} aria-hidden>
              <div className="skeleton" />
              <span className="skeleton" />
            </div>
          ))}

        {state.status === "error" && items.length === 0 && (
          <InlineState
            kind="error"
            title="Couldn't reach the dungeon"
            body="Reading Chogs from Monad / IPFS failed. It's usually a slow gateway."
            action={
              <button className="btn" onClick={() => load(0)}>
                Retry
              </button>
            }
          />
        )}

        {state.status === "ready" && items.length === 0 && (
          <InlineState
            kind="empty"
            title={
              data?.reason === "no-raid-data"
                ? "No raids recorded yet"
                : q
                  ? `No CHOG #${q}`
                  : "No rooms here yet"
            }
            body={
              data?.reason === "no-raid-data"
                ? "This list fills up as raids are played. Be the first."
                : q
                  ? "CHOG numbers run from 1 to 1,969."
                  : undefined
            }
            action={
              data?.reason === "no-raid-data" ? (
                <Link className="btn primary" href="/raid" prefetch={false}>
                  Raid a random room
                </Link>
              ) : undefined
            }
          />
        )}

        {items.map((c) => (
          <Link key={c.tokenId} href={`/room/${c.tokenId}`} className={styles.card}>
            <div className={styles.art}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${c.image}?s=256`}
                alt={c.name}
                loading="lazy"
                className="pixel"
                onError={(e) => (e.currentTarget.dataset.failed = "")}
              />
              {c.tier && <span className={styles.tier}>{c.tier}</span>}
              {progress?.cleared.has(c.tokenId) && <span className={styles.cleared}>✓ Cleared</span>}
            </div>
            <div className={styles.cardFoot}>
              <b>{chogNumber(c.tokenId)}</b>
              {c.raids !== undefined ? (
                <span className="small muted">
                  {c.raids} raid{c.raids === 1 ? "" : "s"} · {Math.round((c.defenseRate ?? 0) * 100)}% held
                </span>
              ) : c.difficulty > 0 ? (
                <Skulls n={c.difficulty} />
              ) : (
                <span className="small muted">…</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {data?.hasMore && items.length > 0 && !q && (
        <div className={styles.more}>
          <button className="btn" onClick={() => load(page + 1)} disabled={state.status === "loading"}>
            {state.status === "loading" ? "Loading…" : "Load more rooms"}
          </button>
          {state.status === "error" && <p className="small" style={{ color: "var(--blood)" }}>That didn&apos;t load. Try again.</p>}
        </div>
      )}
    </div>
  );
}
