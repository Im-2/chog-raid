"use client";

import { useSyncExternalStore } from "react";

/** A real mouse/trackpad: phones and tablets (touch, no hover) keep the on-screen d-pad layout. */
const QUERY = "(hover: hover) and (pointer: fine)";

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** true = desktop controls, false = touch device, null = not known yet (server render). */
export function useDesktopPointer(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => null,
  );
}
