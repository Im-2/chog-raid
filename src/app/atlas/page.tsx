import type { Metadata } from "next";
import { AtlasView } from "@/components/atlas/AtlasView";
import { SiteNav } from "@/components/ui/SiteNav";

export const metadata: Metadata = { title: "Atlas · Chog Raid" };

export default function AtlasPage() {
  return (
    <>
      <SiteNav />
      <AtlasView />
    </>
  );
}
