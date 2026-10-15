import type { Metadata, Viewport } from "next";
import { Pixelify_Sans, Silkscreen } from "next/font/google";
import { FireCursor } from "@/components/ui/FireCursor";
import "./globals.css";

const pixelify = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixelify", display: "swap" });
// Blocky digits that never read as letters (Pixelify's 5/S and 2/8 are too close at small sizes).
const silkscreen = Silkscreen({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-silkscreen", display: "swap" });

export const metadata: Metadata = {
  title: "Chog Raid",
  description: "Every Chog becomes a room in one giant shared dungeon. Defend yours, raid others.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#120d0a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pixelify.variable} ${silkscreen.variable}`}>
      <body>
        {children}
        <FireCursor />
      </body>
    </html>
  );
}
