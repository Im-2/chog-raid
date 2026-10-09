import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chog Raid",
  description: "Every Chog becomes a room in one giant shared dungeon. Defend yours, raid others.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mock = (process.env.NFT_ADAPTER ?? "mock") === "mock";
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">
            CHOG <span>RAID</span>
          </Link>
          {mock && <span className="pill">mock Chogs</span>}
        </nav>
        {children}
      </body>
    </html>
  );
}
