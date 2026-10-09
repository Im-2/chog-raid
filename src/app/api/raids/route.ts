import { raidDeps, readJson, respond } from "@/server/deps";
import { currentRaider } from "@/server/identity";
import { startRaid } from "@/server/raids";

/** Start a raid: POST { tokenId }. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const tokenId = Number(body?.tokenId);
  if (!Number.isInteger(tokenId) || tokenId < 1) return Response.json({ error: "tokenId is required." }, { status: 400 });
  const raider = (await currentRaider(true))!;
  try {
    return respond(await startRaid(raidDeps(), tokenId, raider));
  } catch (e) {
    console.error("start raid:", e);
    return Response.json({ error: "Couldn't open this room right now." }, { status: 502 });
  }
}
