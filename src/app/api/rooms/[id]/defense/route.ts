import { getDefenseView, saveDefense } from "@/server/defense";
import { raidDeps, readJson, respond } from "@/server/deps";
import { sessionAddress } from "@/server/session";

type Ctx = { params: Promise<{ id: string }> };

const tokenOf = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** Who holds this Chog, whether it's defended, and (for the holder only) the saved traps. */
export async function GET(_req: Request, ctx: Ctx) {
  const id = await tokenOf(ctx);
  if (!id) return Response.json({ error: "Bad token id." }, { status: 400 });
  try {
    return respond(await getDefenseView(raidDeps(), id, await sessionAddress()));
  } catch (e) {
    console.error("defense get:", e);
    return Response.json({ error: "Couldn't check ownership right now." }, { status: 502 });
  }
}

/** Save traps: PUT { traps }. Signed-in holder only; ownership is checked onchain right now. */
export async function PUT(req: Request, ctx: Ctx) {
  const id = await tokenOf(ctx);
  if (!id) return Response.json({ error: "Bad token id." }, { status: 400 });
  const body = await readJson(req);
  try {
    return respond(await saveDefense(raidDeps(), id, await sessionAddress(), body?.traps));
  } catch (e) {
    console.error("defense save:", e);
    return Response.json({ error: "Couldn't save right now. Try again." }, { status: 502 });
  }
}
