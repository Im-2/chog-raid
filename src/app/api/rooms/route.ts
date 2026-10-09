import { listRooms, type RoomSort } from "@/lib/collection";

const SORTS: RoomSort[] = ["id", "hardest", "raided", "undefended"];

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const sort = (SORTS.includes(sp.get("sort") as RoomSort) ? sp.get("sort") : "id") as RoomSort;
  const page = Math.max(0, Number(sp.get("page")) || 0);
  const qRaw = sp.get("q");
  const q = qRaw && /^\d+$/.test(qRaw) ? Number(qRaw) : undefined;
  try {
    return Response.json(await listRooms({ sort, page, pageSize: 24, q }));
  } catch (e) {
    console.error("rooms:", e);
    return Response.json({ error: "Could not read the Chog collection right now." }, { status: 502 });
  }
}
