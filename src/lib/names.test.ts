import { describe, expect, it } from "vitest";
import index from "@/data/chog-names.json";
import { chogName, chogNumber, chogTitle, tokenIdForNumber } from "./names";

describe("official Chog names (Chog Genesis index)", () => {
  it("covers the whole collection with unique name numbers", () => {
    const names = Object.values((index as { names: Record<string, string> }).names);
    expect(names).toHaveLength(1969);
    expect(new Set(names.map((n) => /#(\d+)/.exec(n)![1])).size).toBe(1969);
  });

  it("shows the metadata name, not the token id (OpenSea: token 53 is CHOG #1514)", () => {
    expect(chogName(53)).toBe("CHOG #1514");
    expect(chogNumber(53)).toBe("#1514");
  });

  it("finds Blaze by its name number", () => {
    const id = tokenIdForNumber("#53");
    expect(id).toBe(561);
    expect(chogName(id!)).toBe("CHOG #53 — Blaze");
    expect(chogTitle(id!)).toBe("Blaze");
  });

  it("rejects junk", () => {
    expect(tokenIdForNumber("abc")).toBeNull();
    expect(tokenIdForNumber("99999")).toBeNull();
  });
});
