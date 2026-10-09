import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidScreen } from "@/components/game/RaidScreen";
import { loadRoom } from "@/lib/rooms";
import { getNftAdapter } from "@/nft";
import { dailyTokenId, dayKey } from "@/server/retention";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Raid Chog #${(await params).id} · Chog Raid` };
}

export default async function RoomPage({ params }: Props) {
  const loaded = await loadRoom(Number((await params).id));
  if (!loaded) notFound();
  const { chog, room } = loaded;
  // Traps stay on the server: the raid is resolved there move by move.
  const isDaily = dailyTokenId(dayKey(new Date()), await getNftAdapter().totalSupply()) === room.tokenId;
  return (
    <RaidScreen room={room} chog={{ tokenId: chog.tokenId, name: chog.name, image: chog.image, traits: chog.traits }} daily={isDaily} />
  );
}
