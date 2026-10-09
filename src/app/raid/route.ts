import { redirect } from "next/navigation";
import { getNftAdapter } from "@/nft";

export const dynamic = "force-dynamic";

/** "Raid a room": jump into a random Chog's room. */
export async function GET() {
  const total = await getNftAdapter().totalSupply();
  redirect(`/room/${1 + Math.floor(Math.random() * total)}`);
}
