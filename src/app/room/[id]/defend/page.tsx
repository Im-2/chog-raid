import { chogName } from "@/lib/names";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DefendEditor } from "@/components/defend/DefendEditor";
import { getNftAdapter } from "@/nft";
import { loadRoom } from "@/lib/rooms";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Defend ${chogName(Number((await params).id))} · Chog Raid` };
}

export default async function DefendPage({ params }: Props) {
  const tokenId = Number((await params).id);
  const [loaded, owner] = await Promise.all([loadRoom(tokenId), getNftAdapter().ownerOf(tokenId).catch(() => null)]);
  if (!loaded) notFound();
  const { chog, room } = loaded;
  return (
    <DefendEditor
      room={room}
      chog={{ tokenId: chog.tokenId, name: chog.name, image: chog.image, traits: chog.traits }}
      owner={owner}
    />
  );
}
