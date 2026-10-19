// Footer and site-level links. Every optional link is hidden when its value is empty, and nothing is
// invented: set a value in the environment to show it. Read on the server (the footer is a server component).

const clean = (v: string | undefined) => {
  const t = v?.trim();
  return t && /^https?:\/\//.test(t) ? t : undefined;
};

export const SITE = {
  github: "https://github.com/Im-2/chog-raid",
  githubProfile: "https://github.com/Im-2",
  /** The builder's X profile (override with SITE_X_URL). */
  x: () => clean(process.env.SITE_X_URL) ?? "https://x.com/nuelcrypt",
  /** The builder's Discord: no default, hidden unless SITE_DISCORD_URL is set. */
  discord: () => clean(process.env.SITE_DISCORD_URL),
  chog: {
    site: "https://chog.xyz",
    x: "https://x.com/ChogNFT",
    /** Hidden unless set (CHOG_DISCORD_URL / CHOG_OPENSEA_URL): we don't guess invite or collection links. */
    discord: () => clean(process.env.CHOG_DISCORD_URL),
    opensea: () => clean(process.env.CHOG_OPENSEA_URL),
  },
  explorer: () => (clean(process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL) ?? "https://monadscan.com").replace(/\/$/, ""),
} as const;
