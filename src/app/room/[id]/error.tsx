"use client";

import { StateScreen } from "@/components/ui/StateScreen";

export default function RoomError({ reset }: { error: Error; reset: () => void }) {
  return (
    <StateScreen
      kind="error"
      title="The dungeon door is stuck"
      body="We couldn't load this Chog's art or metadata. The IPFS gateway may be slow; try again."
      action={
        <button className="btn primary" onClick={reset}>
          Try again
        </button>
      }
    />
  );
}
