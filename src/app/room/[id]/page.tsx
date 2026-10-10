import { chogName } from "@/lib/names";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidScreen } from "@/components/game/RaidScreen";
import { loadRoom } from "@/lib/rooms";
import { getNftAdapter } from "@/nft";
import { badgesOf, snapshot } from "@/server/progress";
import { dailyTokenId, dayKey } from "@/server/retention";
import { getStore } from "@/server/store";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Raid ${chogName(Number((await params).id))} · Chog Raid` };
}

export default async function RoomPage({ params }: Props) {
  const loaded = await loadRoom(Number((await params).id));
  if (!loaded) notFound();
  const { chog, room } = loaded;
  // Traps stay on the server: the raid is resolved there move by move.
  const isDaily = dailyTokenId(dayKey(new Date()), await getNftAdapter().totalSupply()) === room.tokenId;
  // Season badges of the room's defender, shown next to the room name.
  const [snap, defense] = await Promise.all([snapshot(), getStore().getDefense(room.tokenId)]);
  return (
    <RaidScreen
      room={room}
      chog={{ tokenId: chog.tokenId, name: chog.name, image: chog.image, traits: chog.traits }}
      daily={isDaily}
      defenderBadges={defense ? badgesOf(snap, defense.owner) : []}
    />
  );
}
