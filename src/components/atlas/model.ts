// Atlas data model and layout. Pure: no DOM.

export const COLS = 45;
export const CELL = 72; // world units per room cell
export const TILE = 64; // drawn room size inside a cell

export const RECENT_MS = 60 * 60 * 1000; // "recently raided" = within the last hour
export const PULSE_MS = 2600;

export type Category = "recent" | "heavy" | "open" | "cleared" | "defended";

export type AtlasData = {
  supply: number;
  now: number;
  rooms: [number, number, number, number][];
  defended: [number, string][];
  cleared: number[];
  recent: { tokenId: number; status: string; at: string; raider: string }[];
};

export type RoomState = { raids: number; breaches: number; last: number; defender: string | null; cleared: boolean };

export class Atlas {
  supply = 0;
  rows = 0;
  states = new Map<number, RoomState>();
  heavyAt = 5;

  update(d: AtlasData) {
    this.supply = d.supply;
    this.rows = Math.ceil(d.supply / COLS);
    const defended = new Map(d.defended);
    const cleared = new Set(d.cleared);
    const states = new Map<number, RoomState>();
    for (const [id, raids, breaches, last] of d.rooms) {
      states.set(id, { raids, breaches, last, defender: defended.get(id) ?? null, cleared: cleared.has(id) });
    }
    for (const [id, who] of defended) if (!states.has(id)) states.set(id, { raids: 0, breaches: 0, last: 0, defender: who, cleared: cleared.has(id) });
    for (const id of cleared) if (!states.has(id)) states.set(id, { raids: 0, breaches: 0, last: 0, defender: null, cleared: true });
    // "Heavily raided" = top tenth of raided rooms, and at least 5 raids.
    const counts = [...states.values()].map((s) => s.raids).filter((n) => n > 0).sort((a, b) => b - a);
    this.heavyAt = Math.max(5, counts[Math.floor(counts.length / 10)] ?? 5);
    this.states = states;
  }

  state(id: number): RoomState {
    return this.states.get(id) ?? { raids: 0, breaches: 0, last: 0, defender: null, cleared: false };
  }

  is(id: number, c: Category, now: number): boolean {
    const s = this.state(id);
    switch (c) {
      case "recent":
        return s.last > 0 && now - s.last < RECENT_MS;
      case "heavy":
        return s.raids >= this.heavyAt;
      case "open":
        return !s.defender;
      case "defended":
        return !!s.defender;
      case "cleared":
        return s.cleared;
    }
  }

  worldSize() {
    return { w: COLS * CELL, h: this.rows * CELL };
  }

  /** Top-left of a room's tile in world units. */
  pos(id: number) {
    const i = id - 1;
    return { x: (i % COLS) * CELL + (CELL - TILE) / 2, y: Math.floor(i / COLS) * CELL + (CELL - TILE) / 2 };
  }

  /** Room under a world point, if any. */
  at(wx: number, wy: number): number | null {
    const col = Math.floor(wx / CELL);
    const row = Math.floor(wy / CELL);
    if (col < 0 || col >= COLS || row < 0) return null;
    const id = row * COLS + col + 1;
    if (id > this.supply) return null;
    const p = this.pos(id);
    return wx >= p.x && wx < p.x + TILE && wy >= p.y && wy < p.y + TILE ? id : null;
  }
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
