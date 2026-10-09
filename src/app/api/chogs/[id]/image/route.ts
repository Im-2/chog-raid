import { env } from "@/lib/env";
import { mockSvg } from "@/nft/mockArt";

/** Mock-mode Chog image. In onchain mode, Chog.image points at the real artwork instead. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (env.nftAdapter !== "mock" || !Number.isInteger(id) || id < 1 || id > env.mockSupply) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(mockSvg(id), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
