"use client";

// Wallet connection: Reown AppKit (a full modal with the WalletConnect registry, EIP-6963 browser
// wallets, QR on desktop and deep links on phones) on top of wagmi. Loaded lazily (see session.ts)
// so visitors who never connect don't download it. Without NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID it
// falls back to a plain wagmi config that lists detected browser wallets only.

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain, type AppKitNetwork } from "@reown/appkit/networks";
import { createAppKit, type AppKit } from "@reown/appkit";
import {
  connect,
  createConfig,
  disconnect as wagmiDisconnect,
  getAccount,
  getConnectors,
  http,
  reconnect,
  switchChain,
  watchAccount,
  watchConnectors,
  type Config,
  type Connector,
} from "@wagmi/core";
import { CHAIN_ID, CHAIN_NAME, EXPLORER_URL, RPC_URL, verifyRpcChain, WALLETCONNECT_PROJECT_ID } from "./chain";

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
export type AccountInfo = { address: string | null; chainId: number | null; connected: boolean };

export type WalletApi = {
  mode: "appkit" | "injected";
  config: Config;
  /** Open the AppKit connect modal (injected mode: the UI shows its own list). */
  open: () => void;
  close: () => void;
  disconnect: () => Promise<void>;
  account: () => AccountInfo;
  /** The connected wallet's EIP-1193 provider, or null. */
  provider: () => Promise<Eip1193 | null>;
  switchToGameChain: () => Promise<void>;
  onAccount: (cb: (a: AccountInfo) => void) => () => void;
  /** Modal open/closed (AppKit only; the fallback list is driven by the UI). */
  onModal: (cb: (open: boolean) => void) => () => void;
  connectors: () => readonly Connector[];
  onConnectors: (cb: () => void) => () => void;
  connectWith: (c: Connector) => Promise<void>;
};

// Defined from env so the chain id / RPC / name / explorer are never hardcoded.
const monad = defineChain({
  id: CHAIN_ID,
  caipNetworkId: `eip155:${CHAIN_ID}`,
  chainNamespace: "eip155",
  name: CHAIN_NAME,
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: RPC_URL ? [RPC_URL] : [] } },
  blockExplorers: { default: { name: `${CHAIN_NAME} Explorer`, url: EXPLORER_URL } },
});

// WalletConnect Explorer ids (looked up in the registry): shown first in the modal.
const FEATURED = [
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  "18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1", // Rabby
  "d0ca99ff52b99abc48743dad0f7fc891e041be73574f7fac4afe5d4bb83845c8", // Coinbase Wallet
  "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369", // Rainbow
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
  "971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709", // OKX Wallet
  "2bd8c14e035c2d48f184aaa168559e86b0e3433228d3c4075900a221785019b0", // Backpack
  "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // Phantom
];

const read = (config: Config): AccountInfo => {
  const a = getAccount(config);
  return { address: a.address ?? null, chainId: a.chainId ?? null, connected: a.status === "connected" };
};

let api: WalletApi | null = null;

export function initWallet(): WalletApi {
  if (api) return api;
  void verifyRpcChain();

  let config: Config;
  let modal: AppKit | null = null;

  if (WALLETCONNECT_PROJECT_ID) {
    const adapter = new WagmiAdapter({ projectId: WALLETCONNECT_PROJECT_ID, networks: [monad as AppKitNetwork], ssr: false });
    config = adapter.wagmiConfig as Config;
    modal = createAppKit({
      adapters: [adapter],
      networks: [monad as AppKitNetwork],
      defaultNetwork: monad as AppKitNetwork,
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: "Chog Raid",
        description: "Every Chog is a dungeon room. Defend yours. Raid the rest.",
        url: window.location.origin,
        icons: [`${window.location.origin}/icon1.png`],
      },
      themeMode: "dark",
      themeVariables: {
        "--w3m-accent": "#ffb347",
        "--w3m-color-mix": "#120d0a",
        "--w3m-color-mix-strength": 25,
        "--w3m-border-radius-master": "1px",
        "--w3m-font-family": "var(--font-dm), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        "--w3m-z-index": 1000,
      },
      featuredWalletIds: FEATURED,
      // Featured wallets first, then the whole registry; browser wallets come from EIP-6963.
      enableEIP6963: true,
      allWallets: "SHOW",
      features: { analytics: false, email: false, socials: false, onramp: false, swaps: false, send: false, history: false },
    });
  } else {
    console.error(
      "[wallet] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. Falling back to the browser-wallet list only " +
        "(no WalletConnect QR, no mobile deep links, no wallet registry). Create a project at https://dashboard.reown.com and set the variable.",
    );
    config = createConfig({
      chains: [monad as never],
      transports: { [CHAIN_ID]: http(RPC_URL || undefined) },
      multiInjectedProviderDiscovery: true,
      ssr: false,
    }) as Config;
  }

  void reconnect(config);

  api = {
    mode: modal ? "appkit" : "injected",
    config,
    open: () => void modal?.open({ view: "Connect" }),
    close: () => void modal?.close(),
    disconnect: async () => {
      try {
        if (modal) await modal.disconnect();
        else await wagmiDisconnect(config);
      } catch {
        await wagmiDisconnect(config).catch(() => {});
      }
    },
    account: () => read(config),
    provider: async () => {
      const c = getAccount(config).connector;
      return c ? ((await c.getProvider()) as Eip1193) : null;
    },
    switchToGameChain: async () => {
      await switchChain(config, { chainId: CHAIN_ID as never });
    },
    onAccount: (cb) => watchAccount(config, { onChange: () => cb(read(config)) }),
    onModal: (cb) => (modal ? modal.subscribeState((s) => cb(!!s.open)) : () => {}),
    connectors: () => getConnectors(config),
    onConnectors: (cb) => watchConnectors(config, { onChange: cb }),
    connectWith: async (c) => {
      await connect(config, { connector: c, chainId: CHAIN_ID as never });
    },
  };
  return api;
}
