// No-wallet demo: generated Chogs, and a "Demo owner" sign-in that holds Chogs 1-10.
// Runs on port 3001 with its own build dir and data, so it can sit next to the real dev server.
// usage: npm run dev:mock            (add -- --chog to turn on the simulated $CHOG prize pool)
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  NFT_ADAPTER: "mock",
  DEMO_SIGNIN: "1",
  MOCK_OWNER_ADDRESS: process.env.MOCK_OWNER_ADDRESS || "0x000000000000000000000000000000000000dE40",
  DATA_DIR: ".data-mock",
  // Never write mock raids into the real database: blank these so the file store is used.
  NEXT_PUBLIC_SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  NEXT_DIST_DIR: ".next-mock",
  ...(process.argv.includes("--chog") ? { NEXT_PUBLIC_FEATURE_CHOG_TOKEN: "true" } : {}),
};
const child = spawn("npx", ["next", "dev", "-p", "3001"], { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
