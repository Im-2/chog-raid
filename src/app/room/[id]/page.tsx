import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidScreen } from "@/components/game/RaidScreen";
import { loadRoom } from "@/lib/rooms";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Raid Chog #${(await params).id} · Chog Raid` };
}

export default async function RoomPage({ params }: Props) {
  const loaded = await loadRoom(Number((await params).id));
  if (!loaded) notFound();
  const { chog, room } = loaded;
  // No saved defenses yet (milestone 5), so every room is raided with practice traps.
  return (
    <RaidScreen
      room={room}
      chog={{ tokenId: chog.tokenId, name: chog.name, image: chog.image, traits: chog.traits }}
      traps={null}
    />
  );
}
