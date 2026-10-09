import Link from "next/link";
import { notFound } from "next/navigation";
import { GAME, TRAP_INFO } from "@/engine";
import { RaidGame } from "@/components/RaidGame";
import { loadRoom } from "@/lib/rooms";
import styles from "./room.module.css";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const tokenId = Number((await params).id);
  const loaded = await loadRoom(tokenId);
  if (!loaded) notFound();
  const { chog, room } = loaded;

  return (
    <main className="container">
      <p className="small">
        <Link href="/">← All rooms</Link>
      </p>
      <div className={styles.layout}>
        <aside className={styles.info}>
          <div className="panel">
            <div className={styles.head}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chog.image} alt={chog.name} width={72} height={72} className="pixel" />
              <div>
                <h1 className={styles.title}>{chog.name}</h1>
                <p className="muted small">This room was built from this Chog.</p>
              </div>
            </div>
            <ul className={styles.traits}>
              {chog.traits.map((t) => (
                <li key={t.trait_type}>
                  <span className="muted">{t.trait_type}</span> {t.value}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h3 className={styles.h3}>Room rules</h3>
            <p className="small muted">
              {room.rules.trapSlots} trap slots · {room.rules.raiderHp} HP · {room.rules.maxMoves} moves
            </p>
            {room.rules.notes.length > 0 && (
              <ul className={styles.notes}>
                {room.rules.notes.map((n) => (
                  <li key={n} className="small">
                    {n}
                  </li>
                ))}
              </ul>
            )}
            <h3 className={styles.h3}>Defender can use</h3>
            <ul className={styles.notes}>
              {room.rules.allowedTraps.map((t) => (
                <li key={t} className="small">
                  <b>{TRAP_INFO[t].label}</b> <span className="muted">{TRAP_INFO[t].blurb}</span>
                </li>
              ))}
            </ul>
            <p className="small muted">Spikes and teleporters stay hidden until you step on them.</p>
          </div>

          <div className="panel small">
            <h3 className={styles.h3}>Tiles</h3>
            <ul className={styles.notes}>
              <li>Floor: walk freely</li>
              <li>Wall / dark void: blocked</li>
              <li>Water: costs {GAME.waterMoveCost} moves</li>
              <li>Hazard (dotted): -{GAME.hazardDamage} HP</li>
              <li>Cracked stone: carved so the room is always beatable</li>
            </ul>
          </div>
        </aside>

        <section>
          <RaidGame room={room} traps={[]} defended={false} />
        </section>
      </div>
    </main>
  );
}
