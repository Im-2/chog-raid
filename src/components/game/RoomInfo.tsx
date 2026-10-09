import { GAME, TRAP_INFO, type Room, type Trait, type TrapType } from "@/engine";
import { RoomRecord } from "./RoomRecord";
import { TrapIcon } from "./TrapIcon";
import styles from "./game.module.css";

export type ChogSummary = { tokenId: number; name: string; image: string; traits: Trait[] };

const ALL_TRAPS: TrapType[] = ["spike", "teleporter", "guard", "lockdoor"];

export function TileLegend() {
  const rows: [string, string, string][] = [
    ["var(--legend-floor)", "Floor", "Walk freely"],
    ["var(--legend-wall)", "Wall / void", "Blocked"],
    ["var(--legend-water)", "Water", `Costs ${GAME.waterMoveCost} moves`],
    ["var(--legend-hazard)", "Embers", `-${GAME.hazardDamage} HP`],
    ["var(--legend-carved)", "Cracked stone", "Carved so every room is beatable"],
  ];
  return (
    <ul className={styles.legend}>
      {rows.map(([color, name, note]) => (
        <li key={name}>
          <span className={styles.swatch} style={{ background: color }} />
          <b>{name}</b> <span className="muted">{note}</span>
        </li>
      ))}
    </ul>
  );
}

export function TrapLegend({ allowed }: { allowed?: TrapType[] }) {
  return (
    <ul className={styles.legend}>
      {ALL_TRAPS.map((t) => (
        <li key={t} data-locked={allowed && !allowed.includes(t) ? "" : undefined}>
          <TrapIcon type={t} size={28} />
          <span>
            <b>{TRAP_INFO[t].label}</b> <span className="muted">{TRAP_INFO[t].blurb}</span>
            {allowed && !allowed.includes(t) && <span className={styles.lockedTag}>Locked for this Chog</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RoomInfo({ chog, room }: { chog: ChogSummary; room: Room }) {
  return (
    <div className={styles.info}>
      <div className={styles.infoHead}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${chog.image}?s=256`} alt={chog.name} width={88} height={88} className="pixel" />
        <div>
          <h3 className={styles.infoTitle}>{chog.name}</h3>
          <p className="muted small">This room is built from this Chog: its art, colors and traits.</p>
        </div>
      </div>

      <section>
        <h4>Record</h4>
        <RoomRecord tokenId={room.tokenId} />
      </section>

      <section>
        <h4>Room rules</h4>
        <p className="small">
          <b>{room.rules.trapSlots}</b> trap slots · <b>{room.rules.raiderHp}</b> HP · <b>{room.rules.maxMoves}</b> moves
        </p>
        {room.rules.notes.length > 0 && (
          <ul className={styles.notes}>
            {room.rules.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4>Traps</h4>
        <TrapLegend allowed={room.rules.allowedTraps} />
        <p className="small muted">Spikes and teleporters stay hidden until someone steps on them.</p>
      </section>

      <section>
        <h4>Tiles</h4>
        <TileLegend />
      </section>

      <section>
        <h4>Traits</h4>
        <dl className={styles.traits}>
          {chog.traits.map((t) => (
            <div key={t.trait_type}>
              <dt>{t.trait_type}</dt>
              <dd>{t.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export function HowToPlay() {
  return (
    <div className={styles.info}>
      <ol className={styles.howto}>
        <li>
          <b>Every Chog is a room.</b> Its art becomes the walls, water and embers. Its traits decide how many traps
          the owner gets.
        </li>
        <li>
          <b>Raid:</b> walk from <span style={{ color: "var(--moss)" }}>IN</span> to{" "}
          <span style={{ color: "var(--gold)" }}>OUT</span> before your HP or moves run out. Arrow keys, WASD, swipe,
          or the d-pad.
        </li>
        <li>
          <b>Watch out:</b> spikes and teleporters are hidden. Guards patrol. Locked doors need their key.
        </li>
        <li>
          <b>Hold a Chog?</b> Defend its room with traps. It fights for you while you&apos;re offline.
        </li>
      </ol>
      <section>
        <h4>Traps</h4>
        <TrapLegend />
      </section>
    </div>
  );
}
