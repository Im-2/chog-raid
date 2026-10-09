import "server-only";
import { loadRoom } from "@/lib/rooms";
import { getNftAdapter } from "@/nft";
import type { RaidDeps } from "./raids";
import { getStore } from "./store";

export function raidDeps(): RaidDeps {
  return {
    store: getStore(),
    getRoom: async (id) => (await loadRoom(id))?.room ?? null,
    ownerOf: (id) => getNftAdapter().ownerOf(id),
  };
}

/** Turn a service Result into a JSON response. */
export function respond<T>(r: { ok: true; value: T } | { ok: false; status: number; error: string; view?: unknown }) {
  return r.ok ? Response.json(r.value) : Response.json({ error: r.error, view: r.view }, { status: r.status });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
