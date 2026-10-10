import "server-only";
import { createFileStore } from "./file";
import { createSupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | undefined;

/** Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, otherwise a local JSON file (DATA_DIR). */
export function getStore(): Store {
  if (store) return store;
  // Accept the dashboard's REST endpoint too (https://<ref>.supabase.co/rest/v1/): the client wants the base URL.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  store = url && key ? createSupabaseStore(url, key) : createFileStore(process.env.DATA_DIR?.trim() || ".data");
  return store;
}

export type { DefenseRecord, RaidRecord, RaidStatus, Store } from "./types";
