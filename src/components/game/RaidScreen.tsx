"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Move, Room } from "@/engine";
import { loadSoundPref, saveSoundPref } from "@/lib/sound";
import { Board } from "../board/Board";
import { DifficultyBadge } from "../ui/DifficultyBadge";
import { Sheet } from "../ui/Sheet";
import { difficultyOfRoom } from "@/lib/difficulty";
import { DPad } from "./DPad";
import { describeEvent } from "./describe";
import { Hud } from "./Hud";
import { ResultCard } from "./ResultCard";
import { HowToPlay, RoomInfo, type ChogSummary } from "./RoomInfo";
import { useServerRaid } from "./useServerRaid";
import { LatencyReadout } from "./LatencyReadout";
import { Badges, type BadgeT } from "../progress/bits";
import styles from "./game.module.css";

const KEYS: Record<string, Move> = {
  ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R",
  w: "U", s: "D", a: "L", d: "R", W: "U", S: "D", A: "L", D: "R",
};
const HOWTO_SEEN = "chograid:howto-seen";

export function SoundToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className="btn icon"
      aria-pressed={on}
      aria-label={on ? "Sound on" : "Sound off"}
      title={on ? "Sound on" : "Sound off"}
      onClick={() => {
        onChange(!on);
        saveSoundPref(!on);
      }}
    >
      <span aria-hidden>♪</span>
      <span className="small">{on ? "On" : "Off"}</span>
    </button>
  );
}

/** The raid screen. Every move is resolved by the server; the client never sees hidden traps. */
export function RaidScreen({
  room,
  chog,
  daily = false,
  defenderBadges = [],
}: {
  room: Room;
  chog: ChogSummary;
  daily?: boolean;
  defenderBadges?: BadgeT[];
}) {
  const raid = useServerRaid(room);
  const { result } = raid;
  const practice = raid.practice === true;

  const [sound, setSound] = useState(false);
  const [panel, setPanel] = useState<"none" | "info" | "howto">("none");
  const [showResult, setShowResult] = useState(false);
  const [nativeLayer, setNativeLayer] = useState(false);

  useEffect(() => {
    setSound(loadSoundPref());
    try {
      if (!localStorage.getItem(HOWTO_SEEN)) {
        setPanel("howto");
        localStorage.setItem(HOWTO_SEEN, "1");
      }
    } catch {}
  }, []);

  // Let the victory / death animation play before the result card.
  useEffect(() => {
    if (!raid.over) return setShowResult(false);
    const t = setTimeout(() => setShowResult(true), 900);
    return () => clearTimeout(t);
  }, [raid.over]);

  const { move, reset } = raid;
  const again = useCallback(() => {
    setShowResult(false);
    reset();
  }, [reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panel !== "none" || e.metaKey || e.ctrlKey || e.altKey) return;
      const m = KEYS[e.key];
      if (m) {
        e.preventDefault();
        move(m);
      } else if ((e.key === "r" || e.key === "R") && raid.movesUsed) {
        again();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, again, panel, raid.movesUsed]);

  const last = result.events.at(-1);

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <Link href="/" className="btn icon" aria-label="All rooms">
          ←
        </Link>
        <button className={styles.chogChip} onClick={() => setPanel("info")} aria-label="Room info">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${chog.image}?s=48`} alt="" width={32} height={32} className="pixel" />
          <span>
            <span className="num">{chog.name}</span>
          </span>
          <DifficultyBadge d={difficultyOfRoom(room)} size="sm" />
          <Badges badges={defenderBadges} max={2} />
          {daily && <span className="tag">Daily</span>}
          {practice && <span className="tag">Practice</span>}
        </button>
        <div className={styles.topActions}>
          <button className="btn icon" onClick={() => setPanel("howto")} aria-label="How to play" title="How to play">
            ?
          </button>
          <button className="btn icon" onClick={() => setPanel("info")} aria-label="Room info" title="Room info">
            ☰
          </button>
          <SoundToggle on={sound} onChange={setSound} />
          <Link href={`/room/${room.tokenId}/defend`} className={`btn ${styles.defendBtn}`}>
            Defend
          </Link>
        </div>
      </header>

      <div className={styles.stage}>
        <div className={styles.boardCol}>
          <Hud
            hp={result.hp}
            maxHp={room.rules.raiderHp}
            movesLeft={result.movesLeft}
            maxMoves={room.rules.maxMoves}
            keys={result.keys.length}
          />
          <div className={styles.boardFrame}>
            <Board
              room={room}
              traps={raid.visibleTraps}
              keysHeld={raid.keysHeld}
              path={result.path}
              guards={result.guards}
              events={result.events}
              outcome={result.outcome}
              sound={sound}
              nativeLayer={nativeLayer}
              onSwipe={move}
            />
            {showResult && (
              <ResultCard
                result={result}
                movesUsed={raid.movesUsed}
                tokenId={room.tokenId}
                exit={room.exit}
                onAgain={again}
                practice={practice}
                raidId={raid.raidId}
              />
            )}
            {raid.phase === "starting" && (
              <div className={styles.boardState} role="status">
                Opening the room…
              </div>
            )}
            {raid.phase === "error" && (
              <div className={styles.boardState} role="alert">
                <p>{raid.error ?? "Connection lost."}</p>
                <button className="btn primary" onClick={raid.retry}>
                  Try again
                </button>
              </div>
            )}
          </div>
          <p className={styles.ticker} aria-live="polite">
            {last ? (
              describeEvent(last)
            ) : daily ? (
              <>
                <b>Today&apos;s daily raid.</b> Clear it for bonus points; fewest moves tops the daily board.
              </>
            ) : practice ? (
              <>No defender yet: you&apos;re raiding <b>practice traps</b>. Reach the glowing door.</>
            ) : (
              <>Reach the glowing door. Some traps are hidden.</>
            )}
          </p>
        </div>

        <div className={styles.controls}>
          <DPad onMove={move} disabled={raid.over || raid.phase !== "ready"} />
          <button className="btn" onClick={again} disabled={!raid.movesUsed || raid.phase === "starting"}>
            Restart <kbd>R</kbd>
          </button>
        </div>
      </div>

      <Sheet open={panel === "info"} onClose={() => setPanel("none")} title="Room info" variant="drawer">
        <RoomInfo chog={chog} room={room} nativeLayer={nativeLayer} onNativeLayer={setNativeLayer} />
      </Sheet>
      <Sheet open={panel === "howto"} onClose={() => setPanel("none")} title="How to play">
        <HowToPlay />
        <button className="btn primary" style={{ width: "100%", marginTop: 16 }} onClick={() => setPanel("none")}>
          Let me in
        </button>
      </Sheet>
      <LatencyReadout />
    </div>
  );
}
