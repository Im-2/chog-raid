import fs from "node:fs";
import path from "node:path";
import { createMemoryStore, type MemoryState } from "./memory";
import type { Store } from "./types";

/**
 * Single-process JSON file store for local dev and single-server demos.
 * Not for serverless deploys (each instance would have its own file): use Supabase there.
 */
export function createFileStore(dir: string): Store {
  const file = path.join(dir, "store.json");
  let state: MemoryState = { raids: {}, defenses: {} };
  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {}

  let timer: NodeJS.Timeout | null = null;
  const persist = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(state));
        fs.renameSync(`${file}.tmp`, file);
      } catch (e) {
        console.error("file store write failed:", e);
      }
    }, 200);
  };
  return { ...createMemoryStore(state, persist), kind: "file" };
}
