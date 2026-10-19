import { SiteFooter } from "@/components/ui/SiteFooter";

export default function DefendLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
