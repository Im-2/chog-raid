"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  findSafePath,
  guardRoute,
  DIRS,
  TRAP_INFO,
  validateTraps,
  withNative,
  legacyRoom,
  type Move,
  type Point,
  type RaidOutcome,
  type Room,
  type Trap,
  type TrapType,
} from "@/engine";
import { loadSoundPref, playSfx } from "@/lib/sound";
import { Board } from "../board/Board";
import { DPad } from "../game/DPad";
import { Hud } from "../game/Hud";
import { causeOfEnd } from "../game/describe";
import { RoomInfo, type ChogSummary } from "../game/RoomInfo";
import { SoundToggle } from "../game/RaidScreen";
import { isNativeAt, NativeDefensePanel } from "../game/NativeDefense";
import { TrapIcon } from "../game/TrapIcon";
import { useLocalRaid } from "../game/useLocalRaid";
import { SessionError, WalletButton } from "../wallet/WalletButton";
import { shortAddress, signIn, useSession } from "../wallet/session";
import { Sheet } from "../ui/Sheet";
import { ReplayPlayer } from "./ReplayPlayer";
import { RoomRaidLog } from "./RoomRaidLog";
import { NudgePanel, type NudgeT } from "./NudgePanel";
import styles from "./defend.module.css";
import gameStyles from "../game/game.module.css";

type DefenseState =
  | { status: "loading" | "error" }
  | { status: "ready"; owner: string | null; isOwner: boolean; traps: Trap[] | null; defended: boolean; updatedAt: string | null };

/** Save button plus a plain-language line about who can save and whether the room is live. */
function SaveBox({
  defense,
  signedIn,
  dirty,
  saving,
  onSave,
  fallbackOwner,
}: {
  defense: DefenseState;
  signedIn: boolean;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  fallbackOwner: string | null;
}) {
  const owner = defense.status === "ready" ? defense.owner : fallbackOwner;
  const isOwner = defense.status === "ready" && defense.isOwner;
  let note: React.ReactNode;
  if (defense.status === "loading") note = "Checking who holds this Chog…";
  else if (defense.status === "error") note = "Couldn't check ownership on Monad. Your draft is safe on this device.";
  else if (!signedIn) note = <>Draft saved on this device. Connect the holder&apos;s wallet to make it live.</>;
  else if (!isOwner) note = <>Only the holder{owner ? <> (<span className="num">{shortAddress(owner)}</span>)</> : null} can save this room. Your draft stays on this device.</>;
  else if (dirty)
    note = (
      <b style={{ color: "var(--torch)" }}>
        Unsaved changes. {defense.status === "ready" && defense.defended ? "Raiders still face your last saved defense." : "Until you save, raiders face practice traps."}
      </b>
    );
  else if (defense.status === "ready" && defense.defended) note = <>Live. Raiders face these traps{defense.updatedAt ? ` (saved ${new Date(defense.updatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })})` : ""}.</>;
  else note = "Not defended yet. Until you save, raiders face practice traps.";

  return (
    <>
      {signedIn || defense.status !== "ready" ? (
        <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={onSave} disabled={!isOwner || !dirty || saving}>
          {saving ? "Saving…" : isOwner && !dirty && defense.status === "ready" && defense.defended ? "Saved ✓" : "Save defense"}
        </button>
      ) : (
        <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => void signIn()}>
          Connect wallet to save
        </button>
      )}
      <SessionError />
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        {note}
      </p>
    </>
  );
}

/** `native` is false/missing for raids from before native defenses; those replay on legacyRoom. */
type LogEntry = { id: string; at: number; moves: Move[]; traps: Trap[]; outcome: RaidOutcome; hp: number; native?: boolean };
type Tool = TrapType | "erase";

const ALL: TrapType[] = ["spike", "teleporter", "guard", "lockdoor"];
const KEYS: Record<string, Move> = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", w: "U", s: "D", a: "L", d: "R" };

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
};

function TestRaid({ room, traps, sound, onDone, onExit }: { room: Room; traps: Trap[]; sound: boolean; onDone: (e: LogEntry) => void; onExit: () => void }) {
  const raid = useLocalRaid(room, traps); // traps here already include the room's native defenses
  const { move, reset, result, over, moves } = raid;

  useEffect(() => {
    if (over) onDone({ id: `${Date.now()}`, at: Date.now(), moves, traps, outcome: result.outcome, hp: result.hp, native: true });
    // only when the raid ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = KEYS[e.key];
      if (m) {
        e.preventDefault();
        move(m);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  return (
    <div className={styles.testRaid}>
      <Hud hp={result.hp} maxHp={room.rules.raiderHp} movesLeft={result.movesLeft} maxMoves={room.rules.maxMoves} keys={result.keys.length} />
      <div className={gameStyles.boardFrame}>
        <Board
          room={room}
          traps={raid.visibleTraps}
          keysHeld={raid.keysHeld}
          path={result.path}
          guards={result.guards}
          events={result.events}
          outcome={result.outcome}
          sound={sound}
          onSwipe={move}
        />
      </div>
      <p className={gameStyles.ticker}>{over ? causeOfEnd(result) : "Test raid: play your own room like a raider would. Hidden traps stay hidden."}</p>
      <div className={styles.testControls}>
        <DPad onMove={move} disabled={over} />
        <div className={styles.stack}>
          <button className="btn" onClick={reset}>
            Restart
          </button>
          <button className="btn primary" onClick={onExit}>
            Back to editor
          </button>
        </div>
      </div>
    </div>
  );
}

export function DefendEditor({ room, chog, owner }: { room: Room; chog: ChogSummary; owner: string | null }) {
  const draftKey = `chograid:draft:${room.tokenId}`;
  const logKey = `chograid:testlog:${room.tokenId}`;

  const [traps, setTraps] = useState<Trap[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showNative, setShowNative] = useState(true);
  const [tool, setTool] = useState<Tool | null>(room.rules.allowedTraps[0] ?? null);
  const [axis, setAxis] = useState<"h" | "v">("h");
  const [pendingDoor, setPendingDoor] = useState<Point | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [showPath, setShowPath] = useState(false);
  const [mode, setMode] = useState<"edit" | "test">("edit");
  const [sound, setSound] = useState(false);
  const [panel, setPanel] = useState<"none" | "info" | "replay">("none");
  const [replay, setReplay] = useState<LogEntry | null>(null);
  const [heat, setHeat] = useState<NudgeT | null>(null);
  const [focusNudge, setFocusNudge] = useState(false);

  // Deep links from raid alerts: ?replay=<raidId> opens that replay, ?nudge=1 opens the heatmap.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("nudge")) setFocusNudge(true);
    const id = q.get("replay");
    if (!id) return;
    fetch(`/api/raids/${encodeURIComponent(id)}/replay`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setReplay({ id: "server", at: 0, outcome: "incomplete", hp: 0, traps: j.traps, moves: j.moves, native: j.native });
        setPanel("replay");
      })
      .catch(() => {});
  }, []);

  const session = useSession();
  const [defense, setDefense] = useState<DefenseState>({ status: "loading" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const draft = load<Trap[]>(draftKey, []);
    setTraps(validateTraps(room, draft).ok ? draft : []);
    setLog(load<LogEntry[]>(logKey, []));
    setSound(loadSoundPref());
  }, [draftKey, logKey, room]);

  // Who holds this Chog, and (for the holder) the saved traps. Re-checked when the wallet changes.
  useEffect(() => {
    if (session.status === "loading") return;
    let cancelled = false;
    setDefense({ status: "loading" });
    fetch(`/api/rooms/${room.tokenId}/defense`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        if (cancelled) return;
        setDefense({ status: "ready", ...j });
        if (j.isOwner && j.traps) setTraps(j.traps);
      })
      .catch(() => !cancelled && setDefense({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [room.tokenId, session.address, session.status]);

  const savedTraps = defense.status === "ready" ? (defense.traps ?? []) : [];
  const dirty = JSON.stringify(traps) !== JSON.stringify(savedTraps);

  const saveDefense = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/rooms/${room.tokenId}/defense`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traps }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't save.");
      setDefense({ status: "ready", ...j });
      setMessage({ kind: "ok", text: "Saved. Your room is live and defends itself from now on." });
      if (sound) playSfx("key");
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const commit = useCallback(
    (next: Trap[], okText?: string): boolean => {
      const check = validateTraps(room, next);
      if (!check.ok) {
        setMessage({ kind: "error", text: check.error });
        if (sound) playSfx("bump");
        return false;
      }
      setTraps(next);
      save(draftKey, next);
      setMessage(okText ? { kind: "ok", text: okText } : null);
      if (sound) playSfx("place");
      return true;
    },
    [room, draftKey, sound],
  );

  const indexAt = (p: Point) => traps.findIndex((t) => same(t, p) || (t.type === "lockdoor" && same(t.key, p)));
  const slotsLeft = room.rules.trapSlots - traps.length;

  const onTap = (p: Point) => {
    if (pendingDoor) {
      if (commit([...traps, { type: "lockdoor", ...pendingDoor, key: p }], "Door and key placed.")) setPendingDoor(null);
      return;
    }
    if (isNativeAt(room, p)) {
      setSelected(null);
      return setMessage({ kind: "error", text: "That's a native defense: built into this room by its tier. It can't be moved or removed." });
    }
    const i = indexAt(p);
    if (i >= 0) {
      if (tool === "erase") {
        commit(traps.filter((_, j) => j !== i), "Removed.");
        setSelected(null);
      } else setSelected(i === selected ? null : i);
      return;
    }
    setSelected(null);
    if (!tool || tool === "erase") return;
    if (slotsLeft <= 0) return setMessage({ kind: "error", text: "No trap slots left. Remove one first." });
    if (tool === "lockdoor") {
      const tile = room.tiles[p.y * room.size + p.x];
      if (tile !== "floor" && tile !== "water") return setMessage({ kind: "error", text: "Lock door must go on floor or water." });
      setPendingDoor(p);
      setMessage({ kind: "ok", text: "Now tap where its key goes." });
      return;
    }
    const trap: Trap = tool === "guard" ? { type: "guard", ...p, axis } : { type: tool, ...p };
    commit([...traps, trap]);
  };

  const onDrag = (from: Point, to: Point) => {
    const i = indexAt(from);
    if (i < 0) return;
    const t = traps[i];
    const moved: Trap = t.type === "lockdoor" && same(t.key, from) ? { ...t, key: to } : { ...t, x: to.x, y: to.y };
    commit(traps.map((x, j) => (j === i ? moved : x)));
    setSelected(i);
  };

  const ghostPath = useMemo(() => {
    if (!showPath) return undefined;
    const moves = findSafePath(room, withNative(room, traps));
    if (!moves) return undefined;
    const pts: Point[] = [room.entrance];
    for (const m of moves) {
      const last = pts[pts.length - 1];
      pts.push({ x: last.x + DIRS[m].x, y: last.y + DIRS[m].y });
    }
    return pts;
  }, [showPath, room, traps]);

  // Native defenses are drawn first and can't be selected, moved or removed.
  const guardRoutes = useMemo(() => withNative(room, traps).flatMap((t) => (t.type === "guard" ? [guardRoute(room, t)] : [])), [traps, room]);
  const drawTraps = useMemo(
    () => withNative(room, pendingDoor ? [...traps, { type: "lockdoor" as const, ...pendingDoor, key: { x: -9, y: -9 } }] : traps),
    [room, traps, pendingDoor],
  );
  const sel = selected !== null ? traps[selected] : null;

  const addLog = useCallback(
    (e: LogEntry) =>
      setLog((l) => {
        const next = [e, ...l].slice(0, 20);
        save(logKey, next);
        return next;
      }),
    [logKey],
  );

  return (
    <div className={gameStyles.screen}>
      <header className={gameStyles.topbar}>
        <Link href={`/room/${room.tokenId}`} className="btn icon" aria-label="Back to raid">
          ←
        </Link>
        <button className={gameStyles.chogChip} onClick={() => setPanel("info")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${chog.image}?s=128`} alt="" width={32} height={32} className="pixel" />
          <span>
            Defend <span className="num">{chog.name}</span>
          </span>
        </button>
        <div className={gameStyles.topActions}>
          <button className="btn icon" onClick={() => setPanel("info")} aria-label="Room info">
            ☰
          </button>
          <SoundToggle on={sound} onChange={setSound} />
          <WalletButton compact />
        </div>
      </header>

      {mode === "test" ? (
        <div className={gameStyles.stage}>
          <div className={gameStyles.boardCol}>
            <TestRaid room={room} traps={withNative(room, traps)} sound={sound} onDone={addLog} onExit={() => setMode("edit")} />
          </div>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.boardCol}>
            <div className={styles.slots} aria-live="polite">
              <span>
                Trap slots <b>{slotsLeft}</b> / {room.rules.trapSlots} left
              </span>
              <span className={styles.slotPips} aria-hidden>
                {Array.from({ length: room.rules.trapSlots }, (_, i) => (
                  <i key={i} data-used={i < traps.length || undefined} />
                ))}
              </span>
            </div>
            <div className={gameStyles.boardFrame}>
              <Board
                room={room}
                traps={drawTraps}
                guards={drawTraps.flatMap((t) => (t.type === "guard" ? [{ x: t.x, y: t.y }] : []))}
                nativeLayer={showNative}
                guardRoutes={guardRoutes}
                ghostPath={ghostPath}
                heat={heat?.heat}
                deaths={heat?.deaths}
                highlight={pendingDoor ?? (sel ? { x: sel.x, y: sel.y } : null)}
                onTileTap={onTap}
                onTrapDrag={onDrag}
                label="Trap editor. Tap a tile to place the selected trap; drag a trap to move it."
              />
            </div>
            <p className={styles.message} data-kind={message?.kind} role="status">
              {message?.text ?? "Tap a tile to place. Drag a trap to move it. Tap a trap to select it."}
            </p>
          </div>

          <aside className={styles.side}>
            <NudgePanel
              tokenId={room.tokenId}
              enabled={defense.status === "ready" && defense.isOwner && defense.defended}
              focus={focusNudge}
              onHeat={setHeat}
              onApply={(next, at) => {
                if (commit(next, "Suggestion applied. Save to make it live.")) setSelected(next.findIndex((t) => t.x === at.x && t.y === at.y));
              }}
            />
            <NativeDefensePanel room={room} highlight={showNative} onHighlight={setShowNative} />
            <section className="panel">
              <h3 className={styles.h3}>Your traps</h3>
              <div className={styles.palette} role="radiogroup" aria-label="Trap to place">
                {ALL.map((t) => {
                  const locked = !room.rules.allowedTraps.includes(t);
                  return (
                    <button
                      key={t}
                      role="radio"
                      aria-checked={tool === t}
                      disabled={locked}
                      className={styles.tool}
                      onClick={() => {
                        setTool(t);
                        setPendingDoor(null);
                        setMessage({ kind: "ok", text: TRAP_INFO[t].blurb });
                      }}
                      title={locked ? "Locked: this Chog's traits don't unlock it" : TRAP_INFO[t].blurb}
                    >
                      <TrapIcon type={t} size={36} />
                      <span>{TRAP_INFO[t].label}</span>
                      {locked && <small>Locked</small>}
                    </button>
                  );
                })}
                <button role="radio" aria-checked={tool === "erase"} className={styles.tool} onClick={() => setTool("erase")}>
                  <span className={styles.eraseIcon} aria-hidden>
                    ✕
                  </span>
                  <span>Remove</span>
                </button>
              </div>
              {tool === "guard" && (
                <div className={styles.axis}>
                  <span className="small muted">Guard patrols</span>
                  <button className="btn" aria-pressed={axis === "h"} onClick={() => setAxis("h")}>
                    ↔ Across
                  </button>
                  <button className="btn" aria-pressed={axis === "v"} onClick={() => setAxis("v")}>
                    ↕ Down
                  </button>
                </div>
              )}
              {sel && (
                <div className={styles.selected}>
                  <b>{TRAP_INFO[sel.type].label}</b> at {sel.x},{sel.y}
                  <div className={styles.row}>
                    {sel.type === "guard" && (
                      <button
                        className="btn"
                        onClick={() => commit(traps.map((t, j) => (j === selected && t.type === "guard" ? { ...t, axis: t.axis === "h" ? "v" : "h" } : t)))}
                      >
                        Rotate
                      </button>
                    )}
                    <button
                      className="btn"
                      onClick={() => {
                        commit(traps.filter((_, j) => j !== selected), "Removed.");
                        setSelected(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
              <label className={styles.check}>
                <input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} /> Show a raider&apos;s
                safest path
              </label>
            </section>

            <section className="panel">
              <div className={styles.row}>
                <button className="btn primary" onClick={() => setMode("test")} style={{ flex: 1 }}>
                  Test raid
                </button>
                <button className="btn" onClick={() => commit([], "Cleared.")} disabled={!traps.length}>
                  Clear
                </button>
              </div>
              <SaveBox
                defense={defense}
                signedIn={!!session.address}
                dirty={dirty}
                saving={saving}
                onSave={saveDefense}
                fallbackOwner={owner}
              />
            </section>

            <section className="panel">
              <h3 className={styles.h3}>Raid log</h3>
              <RoomRaidLog
                tokenId={room.tokenId}
                onReplay={(r) => {
                  setReplay({ id: "server", at: 0, outcome: "incomplete", hp: 0, ...r });
                  setPanel("replay");
                }}
              />
              <h4 className={styles.subhead}>Your test raids</h4>
              {log.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>
                  None yet. Hit &quot;Test raid&quot; to play your own room like a raider would.
                </p>
              ) : (
                <ul className={styles.log}>
                  {log.map((e) => (
                    <li key={e.id}>
                      <span className={styles.outcome} data-won={e.outcome === "breach" || undefined}>
                        {e.outcome === "breach" ? "Breached" : e.outcome === "defeated" ? "Died" : "No moves"}
                      </span>
                      <span className="small muted">
                        Test · {e.moves.length} moves · {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <button
                        className="btn"
                        onClick={() => {
                          setReplay(e);
                          setPanel("replay");
                        }}
                      >
                        Replay
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      <Sheet open={panel === "info"} onClose={() => setPanel("none")} title="Room info" variant="drawer">
        <RoomInfo chog={chog} room={room} />
      </Sheet>
      <Sheet open={panel === "replay" && !!replay} onClose={() => setPanel("none")} title="Raid replay">
        {replay && <ReplayPlayer room={replay.native ? room : legacyRoom(room)} traps={replay.traps} moves={replay.moves} sound={sound} />}
      </Sheet>
    </div>
  );
}
