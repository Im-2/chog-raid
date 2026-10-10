// Official Chog names. The metadata name (e.g. "CHOG #1514") is what players and OpenSea see;
// the token id (e.g. 53) is only used for routing and contract calls. They are different numbers.
// Works on server and client. Index: src/data/chog-names.json (scripts/build-name-index.mjs).

import index from "@/data/chog-names.json";

const NAMES = (index as { names: Record<string, string> }).names;
/** Set at build time in next.config.ts. Mock Chogs use their token id as their name number. */
const MOCK = process.env.NEXT_PUBLIC_NFT_MODE === "mock";

const byNumber = new Map<number, number>();
for (const [id, name] of Object.entries(NAMES)) {
  const n = Number(/#(\d+)/.exec(name)?.[1]);
  if (n) byNumber.set(n, Number(id));
}

/** Display name, e.g. "CHOG #1514" or "CHOG #53 — Blaze". */
export function chogName(tokenId: number): string {
  if (MOCK) return `Chog #${tokenId}`;
  return NAMES[tokenId] ?? `Chog #${tokenId}`;
}

/** Just the name number part, e.g. "#1514" (for tight spaces). */
export function chogNumber(tokenId: number): string {
  return /#\d+/.exec(chogName(tokenId))?.[0] ?? `#${tokenId}`;
}

/** The 1/1 title, e.g. "Blaze", if the Chog has one. */
export function chogTitle(tokenId: number): string | null {
  return /—\s*(.+)$/.exec(chogName(tokenId))?.[1] ?? null;
}

/** Token id for a name number as shown on OpenSea ("53" or "#53" -> Blaze's token id). */
export function tokenIdForNumber(input: string | number): number | null {
  const n = Number(String(input).replace(/[^\d]/g, ""));
  if (!Number.isInteger(n) || n < 1) return null;
  if (MOCK) return n;
  return byNumber.get(n) ?? null;
}
