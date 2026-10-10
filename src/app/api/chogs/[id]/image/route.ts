import sharp from "sharp";
import { getNftAdapter } from "@/nft";
import { mockSvg } from "@/nft/mockArt";

const SIZES = new Set([48, 128, 256, 512]);

/**
 * Chog artwork. Mock mode returns generated pixel art. Onchain mode proxies the
 * metadata's image field (resolved through IPFS gateways, cached on disk) and can
 * resize it with ?s=128|256|512 for grids.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const adapter = getNftAdapter();
  const cache = { "Cache-Control": "public, max-age=31536000, immutable" };

  try {
    if (!(await adapter.getChog(id))) return new Response("Not found", { status: 404 });
    if (adapter.mode === "mock") {
      return new Response(mockSvg(id), { headers: { "Content-Type": "image/svg+xml", ...cache } });
    }
    const img = await adapter.getImage?.(id);
    if (!img) return new Response("Not found", { status: 404 });
    const s = Number(new URL(req.url).searchParams.get("s"));
    const out = await sharp(img)
      .resize(SIZES.has(s) ? s : 1000)
      .webp({ quality: 82 })
      .toBuffer();
    return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/webp", ...cache } });
  } catch (e) {
    console.error(`image ${id}:`, e);
    return new Response("Image unavailable", { status: 502 });
  }
}
