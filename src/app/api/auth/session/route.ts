import { env } from "@/lib/env";
import { endSession, sessionAddress } from "@/server/session";

/** Who is signed in, and whether the mock-mode demo sign-in is available. */
export async function GET() {
  return Response.json(
    { address: await sessionAddress(), demo: demoSignInEnabled() ? env.mockOwner : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Sign out. */
export async function DELETE() {
  await endSession();
  return Response.json({ address: null });
}

function demoSignInEnabled() {
  return process.env.NODE_ENV !== "production" && env.nftAdapter === "mock" && process.env.DEMO_SIGNIN === "1" && !!env.mockOwner;
}
