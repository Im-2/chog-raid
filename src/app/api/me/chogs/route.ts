import { getNftAdapter } from "@/nft";
import { sessionAddress } from "@/server/session";
import { getStore } from "@/server/store";

/** The signed-in wallet's Chogs, and whether each room is defended. */
export async function GET() {
  const address = await sessionAddress();
  if (!address) return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  try {
    const adapter = getNftAdapter();
    const ids = (await adapter.ownedBy(address)).slice(0, 60);
    const store = getStore();
    const chogs = await Promise.all(
      ids.map(async (tokenId) => {
        const [chog, defense] = await Promise.all([adapter.getChog(tokenId).catch(() => null), store.getDefense(tokenId)]);
        return {
          tokenId,
          image: chog?.image ?? `/api/chogs/${tokenId}/image`,
          tier: chog?.traits.find((t) => t.trait_type === "Tier")?.value ?? null,
          defended: !!defense,
          traps: defense?.traps.length ?? 0,
        };
      }),
    );
    return Response.json({ address, chogs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("me/chogs:", e);
    return Response.json({ error: "Couldn't read your Chogs from Monad right now." }, { status: 502 });
  }
}
