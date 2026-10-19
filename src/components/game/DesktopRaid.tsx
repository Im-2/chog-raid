"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Move, PublicRoom } from "@/engine";
import { difficultyOfRoom } from "@/lib/difficulty";
import type { useEffectsMode } from "@/lib/effects";
import { Board } from "../board/Board";
import { Minimap } from "../board/Minimap";
import { Badges, type BadgeT } from "../progress/bits";
import { DifficultyBadge } from "../ui/DifficultyBadge";
import { Sheet } from "../ui/Sheet";
import { describeEvent } from "./describe";
import { Hearts } from "./Hud";
import { ResultCard } from "./ResultCard";
import { HowToPlay, RoomInfo, type ChogSummary } from "./RoomInfo";
import type { ServerRaid } from "./useServerRaid";
import { LatencyReadout } from "./LatencyReadout";
import styles from "./desk.module.css";
import gameStyles from "./game.module.css";

const KEYS: Record<string, Move> = {
  ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R",
  w: "U", s: "D", a: "L", d: "R", W: "U", S: "D", A: "L", D: "R",
};
/** Holding a key: first repeat after this long, then one step every REPEAT_MS (a step takes ~110 ms to animate). */
const REPEAT_DELAY_MS = 170;
const REPEAT_MS = 115;
const HINT_MS = 9000;
const MENU_SEEN = "chograid:desk-menu-seen";
const MINI_KEY = "chograid:desk-minimap";
const ZOOM_KEY = "chograid:desk-zoom";
const ZOOM_RANGE = 3;

type Props = {
  room: PublicRoom;
  chog: ChogSummary;
  daily: boolean;
  defenderBadges: BadgeT[];
  raid: ServerRaid;
  effects: ReturnType<typeof useEffectsMode>;
  sound: boolean;
  setSound: (v: boolean) => void;
  showResult: boolean;
  again: () => void;
  /** Cosmetic torch color from a $CHOG perk. */
  torch?: string;
};

const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const load = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

function KeyIcon({ held }: { held: boolean }) {
  return (
    <svg viewBox="0 0 10 5" className={held ? styles.keyHeld : styles.keyEmpty} aria-hidden>
      <path d="M1 0h2v1h1v1h6v1H9v1H8V3H4v1H3v1H1V4H0V1h1zm0 2v1h2V2z" />
    </svg>
  );
}

/**
 * The raid screen for mouse-and-keyboard devices: the room fills the window, the HUD floats on top,
 * and everything is keyboard-driven. Movement is optimistic exactly like on phones (the shared
 * useServerRaid hook), so keys feel instant; the server still resolves every move.
 */
export function DesktopRaid({ room, chog, daily, defenderBadges, raid, effects, sound, setSound, showResult, again, torch }: Props) {
  const { result, sight } = raid;
  const practice = raid.practice === true;
  const screen = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [mini, setMini] = useState(true);
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState(true);
  const [nativeLayer, setNativeLayer] = useState(false);
  const [full, setFull] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHint = useCallback((ms = HINT_MS) => {
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), ms);
  }, []);

  // Saved preferences; the menu opens by itself on the very first visit only.
  useEffect(() => {
    if (load(MINI_KEY) === "off") setMini(false);
    const z = Number(load(ZOOM_KEY));
    if (Number.isInteger(z) && Math.abs(z) <= ZOOM_RANGE) setStep(z);
    if (!load(MENU_SEEN)) {
      setMenu(true);
      save(MENU_SEEN, "1");
    }
    flashHint();
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [flashHint]);

  // The page itself never scrolls while the game is up.
  useEffect(() => {
    document.documentElement.dataset.deskGame = "";
    return () => {
      delete document.documentElement.dataset.deskGame;
    };
  }, []);

  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const changeStep = useCallback((delta: number) => {
    setStep((s) => {
      const next = delta === 0 ? 0 : Math.max(-ZOOM_RANGE, Math.min(ZOOM_RANGE, s + delta));
      save(ZOOM_KEY, String(next));
      return next;
    });
  }, []);
  const toggleMini = useCallback(() => {
    setMini((m) => {
      save(MINI_KEY, m ? "off" : "on");
      return !m;
    });
  }, []);

  // ---- keyboard ----
  const blocked = menu || help || showResult;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const moveRef = useRef(raid.move);
  moveRef.current = raid.move;
  const live = useRef({ again, movesUsed: raid.movesUsed, toggleFullscreen, toggleMini, flashHint });
  live.current = { again, movesUsed: raid.movesUsed, toggleFullscreen, toggleMini, flashHint };

  useEffect(() => {
    let held: Move[] = [];
    let delay: ReturnType<typeof setTimeout> | null = null;
    let rep: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (delay) clearTimeout(delay);
      if (rep) clearInterval(rep);
      delay = rep = null;
    };
    const startRepeat = () => {
      stop();
      delay = setTimeout(() => {
        rep = setInterval(() => {
          const m = held[held.length - 1];
          if (m && !blockedRef.current) moveRef.current(m);
        }, REPEAT_MS);
      }, REPEAT_DELAY_MS);
    };

    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const m = KEYS[e.key];
      if (m) {
        e.preventDefault();
        if (e.repeat) return; // our own steady repeat below replaces the OS key repeat
        held = held.filter((x) => x !== m);
        held.push(m);
        if (!blockedRef.current) {
          moveRef.current(m); // instant: optimistic, the server confirms afterwards
          startRepeat();
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case "r":
          if (live.current.movesUsed) live.current.again();
          break;
        case "m":
          live.current.toggleMini();
          break;
        case "f":
          live.current.toggleFullscreen();
          break;
        case "escape":
          setMenu(true);
          break;
        case "?":
        case "/":
          if (e.key === "/" && !e.shiftKey) return;
          setHelp(true);
          live.current.flashHint();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const m = KEYS[e.key];
      if (!m) return;
      held = held.filter((x) => x !== m);
      if (held.length === 0) stop();
    };
    const release = () => {
      held = [];
      stop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      stop();
    };
  }, []);

  const wheelAt = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (blocked || Math.abs(e.deltaY) < 4) return;
    const now = performance.now();
    if (now - wheelAt.current < 140) return;
    wheelAt.current = now;
    changeStep(e.deltaY < 0 ? 1 : -1);
  };

  const last = result.events.at(-1);
  const moveFill = Math.max(0, Math.min(100, (result.movesLeft / room.rules.maxMoves) * 100));
  const doors = raid.visibleTraps.filter((t) => t.type === "lockdoor").length;
  const keySlots = Math.max(result.keys.length, doors);
  const diff = difficultyOfRoom(room);

  return (
    <div ref={screen} className={styles.screen} onWheel={onWheel}>
      <div className={styles.board}>
        <Board
          room={sight!.room}
          traps={raid.visibleTraps}
          keysHeld={raid.keysHeld}
          path={result.path}
          guards={sight!.guards}
          events={result.events}
          outcome={result.outcome}
          sound={sound}
          nativeLayer={nativeLayer}
          torch={torch}
          nativeGuards={raid.visibleTraps.slice(0, sight!.nativeTraps).filter((t) => t.type === "guard").length}
          fog={room.tier.fog ? { seen: sight!.seen, lit: sight!.lit } : undefined}
          pickedUp={result.pickedUp}
          known={sight!.seen}
          viewport={{ zoomStep: step, vignette: true }}
          reduced={effects.reduced}
          onSlow={effects.onSlow}
          threatRoutes={sight!.guardRoutes}
          turn={result.stepsProcessed}
          label={
            room.tier.fog
              ? `Boss raid on ${chog.name}, by torchlight. Move with the arrow keys or WASD.`
              : `Raid on ${chog.name}. Move with the arrow keys or WASD.`
          }
        />
      </div>

      <header className={styles.bar}>
        <div className={styles.left}>
          <Link href="/" className={styles.iconBtn} aria-label="All rooms" title="All rooms">
            ←
          </Link>
          <div className={styles.chog}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${chog.image}?s=48`} alt="" width={28} height={28} className="pixel" />
            <span className={`${styles.name} num`}>{chog.name}</span>
          </div>
          <span className={styles.tags} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {daily && <span className="tag">Daily</span>}
            {practice && <span className="tag">Practice</span>}
            <Badges badges={defenderBadges} max={2} />
          </span>
          <DifficultyBadge d={diff} size="sm" />
        </div>

        <div className={styles.right}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>HP</span>
              <Hearts hp={result.hp} max={room.rules.raiderHp} />
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Moves</span>
              <div className={styles.moves} aria-hidden>
                <div className={styles.movesFill} style={{ width: `${moveFill}%` }} data-low={moveFill < 25 || undefined} />
              </div>
              <b className={styles.num}>{result.movesLeft}</b>
            </div>
            {keySlots > 0 && (
              <div className={styles.stat} aria-label={`${result.keys.length} of ${keySlots} keys`}>
                <span className={styles.statLabel}>Keys</span>
                <span className={styles.keys}>
                  {Array.from({ length: keySlots }, (_, i) => (
                    <KeyIcon key={i} held={i < result.keys.length} />
                  ))}
                </span>
              </div>
            )}
          </div>
          <div className={styles.icons}>
            <button
              className={styles.iconBtn}
              aria-pressed={sound}
              aria-label={sound ? "Sound on" : "Sound off"}
              title={sound ? "Sound on" : "Sound off"}
              onClick={() => setSound(!sound)}
            >
              ♪
            </button>
            <button className={styles.iconBtn} aria-label="How to play (?)" title="How to play (?)" onClick={() => setHelp(true)}>
              ?
            </button>
            <button className={styles.iconBtn} aria-label="Menu (Esc)" title="Menu (Esc)" onClick={() => setMenu(true)}>
              ☰
            </button>
            <Link href={`/room/${room.tokenId}/defend`} className={styles.iconBtn} aria-label="Defend this Chog" title="Defend this Chog">
              <svg viewBox="0 0 12 12" aria-hidden>
                <path d="M2 1h8v1h1v5h-1v2H9v1H8v1H4v-1H3V9H2V7H1V2h1z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <p className={styles.ticker} aria-live="polite">
        {last ? describeEvent(last) : ""}
      </p>

      {mini && sight && (
        <Minimap
          // Opposite the exit door (which is on the right edge), so the goal is never covered.
          className={`${styles.mini} ${room.exit.y >= room.size / 2 ? styles.miniTop : ""}`}
          room={sight.room}
          seen={sight.seen}
          at={result.endAt}
          traps={raid.visibleTraps}
          keysHeld={raid.keysHeld}
          guards={sight.guards}
        />
      )}

      <div className={styles.hintZone} onMouseEnter={() => flashHint(4500)} />
      <div className={styles.hint} data-hide={hint ? undefined : ""} aria-hidden={!hint}>
        <span>
          <kbd>←</kbd>
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <kbd>→</kbd> / <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> Move (hold to keep going)
        </span>
        <span>
          <kbd>R</kbd> Restart
        </span>
        <span>
          <kbd>M</kbd> Map
        </span>
        <span>
          <kbd>F</kbd> Fullscreen
        </span>
        <span>
          <kbd>Esc</kbd> Menu
        </span>
        <span>
          <kbd>?</kbd> Help
        </span>
      </div>

      {showResult && (
        <div className={styles.overlay}>
        <ResultCard
          result={result}
          movesUsed={raid.movesUsed}
          tokenId={room.tokenId}
          exit={room.exit}
          onAgain={again}
          practice={practice}
          raidId={raid.raidId}
          onKeepGoing={raid.canKeepGoing ? raid.keepGoing : undefined}
          desk
        />
        </div>
      )}
      {raid.phase === "starting" && (
        <div className={`${gameStyles.boardState} ${styles.overlay}`} role="status">
          Opening the room…
        </div>
      )}
      {raid.phase === "error" && (
        <div className={`${gameStyles.boardState} ${styles.overlay}`} role="alert">
          <p>{raid.error ?? "Connection lost."}</p>
          <button className="btn primary" onClick={raid.retry}>
            Try again
          </button>
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu" variant="drawer">
        <div className={styles.menu}>
          <section>
            <h4>View</h4>
            <div className={styles.row}>
              <span>Effects</span>
              <span className={styles.seg} role="group" aria-label="Effects">
                {(["auto", "full", "reduced"] as const).map((m) => (
                  <button key={m} aria-pressed={effects.mode === m} onClick={() => effects.setMode(m)}>
                    {m === "auto" ? "Auto" : m === "full" ? "Full" : "Reduced"}
                  </button>
                ))}
              </span>
            </div>
            <div className={styles.row}>
              <span>Zoom (or mouse wheel)</span>
              <span className={styles.seg} role="group" aria-label="Zoom">
                <button onClick={() => changeStep(-1)} aria-label="Zoom out">
                  −
                </button>
                <button onClick={() => changeStep(0)} aria-pressed={step === 0}>
                  Auto
                </button>
                <button onClick={() => changeStep(1)} aria-label="Zoom in">
                  +
                </button>
              </span>
            </div>
            <div className={styles.row}>
              <span>Minimap (M)</span>
              <button className={styles.menuBtn} aria-pressed={mini} onClick={toggleMini}>
                {mini ? "On" : "Off"}
              </button>
            </div>
            <div className={styles.row}>
              <span>Sound</span>
              <button className={styles.menuBtn} aria-pressed={sound} onClick={() => setSound(!sound)}>
                {sound ? "On" : "Off"}
              </button>
            </div>
            <div className={styles.row}>
              <span>Fullscreen (F)</span>
              <button className={styles.menuBtn} onClick={toggleFullscreen}>
                {full ? "Exit" : "Enter"}
              </button>
            </div>
            <div className={styles.row}>
              <span>This raid</span>
              <span className={styles.seg}>
                <button
                  onClick={() => {
                    setMenu(false);
                    again();
                  }}
                  disabled={!raid.movesUsed}
                >
                  Restart (R)
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    setHelp(true);
                  }}
                >
                  How to play
                </button>
              </span>
            </div>
          </section>

          <section>
            <h4>Keys</h4>
            <dl className={styles.menuKeys}>
              <dt>
                <kbd>←</kbd>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>→</kbd>
                <kbd>WASD</kbd>
              </dt>
              <dd>Move (hold to keep going)</dd>
              <dt>
                <kbd>R</kbd>
              </dt>
              <dd>Restart the raid</dd>
              <dt>
                <kbd>M</kbd>
              </dt>
              <dd>Show or hide the minimap</dd>
              <dt>
                <kbd>F</kbd>
              </dt>
              <dd>Fullscreen</dd>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>This menu</dd>
              <dt>
                <kbd>?</kbd>
              </dt>
              <dd>How to play</dd>
              <dt>
                <kbd>Enter</kbd>
                <kbd>N</kbd>
              </dt>
              <dd>Try again / next room, after a raid</dd>
            </dl>
          </section>

          <hr className={styles.divider} />
          <RoomInfo chog={chog} room={room} nativeLayer={nativeLayer} onNativeLayer={setNativeLayer} />
        </div>
      </Sheet>
      <Sheet open={help} onClose={() => setHelp(false)} title="How to play">
        <HowToPlay />
        <button className="btn primary" style={{ width: "100%", marginTop: 16 }} onClick={() => setHelp(false)}>
          Let me in
        </button>
      </Sheet>
      <LatencyReadout />
    </div>
  );
}
