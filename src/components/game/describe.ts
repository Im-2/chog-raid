import type { RaidEvent, RaidResult } from "@/engine";

export function describeEvent(e: RaidEvent): string {
  switch (e.kind) {
    case "damage":
      return `-${e.amount} HP from a ${e.source}`;
    case "teleport":
      return "A teleporter sent you back to the entrance";
    case "key":
      return "Picked up a key";
    case "door":
      return "Locked door. Find its key.";
    case "bump":
      return "Bumped into a wall";
    case "breach":
      return "Reached the exit";
    case "defeated":
      return "You died";
    case "out_of_moves":
      return "Out of moves";
  }
}

/** One line for the result card: what ended the raid. */
export function causeOfEnd(r: RaidResult): string {
  if (r.outcome === "breach") return `Breached with ${r.hp} HP to spare.`;
  if (r.outcome === "out_of_moves") return "Ran out of moves before reaching the exit.";
  const last = [...r.events].reverse().find((e) => e.kind === "damage");
  const what = last?.source === "spike" ? "a hidden spike" : last?.source === "guard" ? "a patrolling guard" : "a hazard";
  return `Killed by ${what}.`;
}
