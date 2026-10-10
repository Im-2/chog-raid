import { listRooms, type RoomSort } from "@/lib/collection";
import { currentRaider } from "@/server/identity";
import { myRooms, snapshot } from "@/server/progress";

const SORTS: RoomSort[] = ["id", "hardest", "raided", "undefended", "uncleared"];

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const sort = (SORTS.includes(sp.get("sort") as RoomSort) ? sp.get("sort") : "id") as RoomSort;
  const page = Math.max(0, Number(sp.get("page")) || 0);
  const qRaw = sp.get("q")?.replace(/^#/, "");
  const q = qRaw && /^\d+$/.test(qRaw) ? Number(qRaw) : undefined;
  try {
    if (sort === "uncleared") {
      const [snap, me] = await Promise.all([snapshot(), currentRaider()]);
      const cleared = new Set(me ? [...myRooms(snap, me)].filter(([, b]) => b.cleared).map(([id]) => id) : []);
      return Response.json(await listRooms({ sort: "id", page, pageSize: 24, q, exclude: cleared }));
    }
    return Response.json(await listRooms({ sort, page, pageSize: 24, q }));
  } catch (e) {
    console.error("rooms:", e);
    return Response.json({ error: "Could not read the Chog collection right now." }, { status: 502 });
  }
}
