import type { Metadata } from "next";
import { AtlasView } from "@/components/atlas/AtlasView";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteNav } from "@/components/ui/SiteNav";

export const metadata: Metadata = { title: "Atlas · Chog Raid" };

export default function AtlasPage() {
  return (
    <>
      <SiteNav />
      <AtlasView />
      <SiteFooter />
    </>
  );
}
