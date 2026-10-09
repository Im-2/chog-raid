import { raidDeps, respond } from "@/server/deps";
import { currentRaider } from "@/server/identity";
import { getReplay } from "@/server/raids";

/** Full replay (moves + trap snapshot) of a finished raid, for allowed viewers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requester = (await currentRaider()) ?? "";
  return respond(await getReplay(raidDeps(), (await params).id, requester));
}
