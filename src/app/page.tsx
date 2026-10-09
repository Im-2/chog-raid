import Link from "next/link";
import { redirect } from "next/navigation";
import { getNftAdapter } from "@/nft";
import styles from "./home.module.css";

const FEATURED = 24;

async function openRoom(form: FormData) {
  "use server";
  const id = Number(form.get("tokenId"));
  if (Number.isInteger(id) && id > 0) redirect(`/room/${id}`);
}

export default async function Home() {
  const adapter = getNftAdapter();
  const supply = await adapter.totalSupply();
  const chogs = (
    await Promise.all(Array.from({ length: Math.min(FEATURED, supply) }, (_, i) => adapter.getChog(i + 1)))
  ).filter((c) => c !== null);

  return (
    <main className="container">
      <section className={styles.hero}>
        <h1>
          Defend your Chog. <span>Raid others.</span>
        </h1>
        <p className="muted">
          Every Chog is a room in one giant shared dungeon, built from its art and traits. Owners set traps that defend
          the room even while they're offline. Everyone else tries to reach the exit.
        </p>
        <ol className={styles.steps}>
          <li>
            <b>Pick a room.</b> <span className="muted">{supply.toLocaleString()} Chogs, one room each.</span>
          </li>
          <li>
            <b>Raid it.</b> <span className="muted">Reach the exit before your HP or moves run out.</span>
          </li>
          <li>
            <b>Hold a Chog?</b> <span className="muted">Set its traps and see who got through.</span>
          </li>
        </ol>
        <form action={openRoom} className={styles.jump}>
          <input type="number" name="tokenId" min={1} max={supply} placeholder={`Chog # (1-${supply})`} required />
          <button className="btn primary" type="submit">
            Raid
          </button>
        </form>
      </section>

      <h2 className={styles.h2}>Rooms</h2>
      <div className={styles.grid}>
        {chogs.map((c) => (
          <Link key={c.tokenId} href={`/room/${c.tokenId}`} className={styles.card}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.image} alt={c.name} className="pixel" loading="lazy" />
            <span>{c.name}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
