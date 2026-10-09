import "server-only";
import { createFileStore } from "./file";
import { createSupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | undefined;

/** Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, otherwise a local JSON file (DATA_DIR). */
export function getStore(): Store {
  if (store) return store;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  store = url && key ? createSupabaseStore(url, key) : createFileStore(process.env.DATA_DIR?.trim() || ".data");
  return store;
}

export type { DefenseRecord, RaidRecord, RaidStatus, Store } from "./types";
