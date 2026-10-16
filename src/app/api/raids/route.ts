import { raidDeps, readJson, respond } from "@/server/deps";
import { currentRaider } from "@/server/identity";
import { startRaid, type RaidDeps } from "@/server/raids";
import { warm } from "@/server/warm";

/** Start a raid: POST { tokenId }. Sends a Server-Timing header so slow starts can be diagnosed. */
export async function POST(req: Request) {
  const t0 = performance.now();
  const body = await readJson(req);
  const tokenId = Number(body?.tokenId);
  if (!Number.isInteger(tokenId) || tokenId < 1) return Response.json({ error: "tokenId is required." }, { status: 400 });
  const raider = (await currentRaider(true))!;
  const timings: string[] = [];
  const timed = <A extends unknown[], R>(name: string, f: (...a: A) => Promise<R>) =>
    async (...a: A) => {
      const s = performance.now();
      try {
        return await f(...a);
      } finally {
        timings.push(`${name};dur=${(performance.now() - s).toFixed(1)}`);
      }
    };
  const base = raidDeps();
  const deps: RaidDeps = {
    ...base,
    getRoom: timed("room", base.getRoom),
    store: {
      ...base.store,
      getDefense: timed("defense", base.store.getDefense.bind(base.store)),
      abandonActive: timed("close", base.store.abandonActive.bind(base.store)),
      createRaid: timed("save", base.store.createRaid.bind(base.store)),
    },
  };
  try {
    const res = respond(await startRaid(deps, tokenId, raider));
    timings.push(`total;dur=${(performance.now() - t0).toFixed(1)}`);
    res.headers.set("Server-Timing", timings.join(", "));
    return res;
  } catch (e) {
    console.error("start raid:", e);
    return Response.json({ error: "Couldn't open this room right now." }, { status: 502 });
  }
}

/** Keep-warm ping (see src/server/warm.ts). */
export function GET() {
  return warm();
}
