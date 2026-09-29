/**
 * App configuration.
 *
 * Every value here is read from `EXPO_PUBLIC_*` at build time. The fallbacks
 * below are only a convenience for a checkout with no env configured.
 *
 *   EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000    the Next.js app
 *   EXPO_PUBLIC_RPC_URL=http://<LAN-IP>:8545    the Hardhat node
 *   EXPO_PUBLIC_CHAIN_ID=31337
 *
 * `localhost` does not work from a physical phone or from the Android emulator —
 * both resolve it to the device itself. Use the dev machine's LAN IP (the same
 * one `expo start` prints) so the phone can reach the API and the node.
 */

// Dev fallbacks — set EXPO_PUBLIC_* env vars to your dev machine's LAN IP
const DEV_HOST = "http://10.40.252.216:3000";
const DEV_RPC = "http://10.40.252.216:8545";
const DEV_CHAIN_ID = 31337;

function envUrl(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function envChainId(value: string | undefined, fallback: number): number {
  const parsed = Number(value?.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const CONFIG = {
  /** Base URL of the Next.js web app (serves /api/election, /api/merkle-path, /api/faucet, /api/verify-vote). */
  apiBaseUrl: envUrl(process.env.EXPO_PUBLIC_API_URL, DEV_HOST),
  /** JSON-RPC endpoint of the Hardhat node. */
  rpcUrl: envUrl(process.env.EXPO_PUBLIC_RPC_URL, DEV_RPC),
  /** Chain id — Hardhat local = 31337. */
  chainId: envChainId(process.env.EXPO_PUBLIC_CHAIN_ID, DEV_CHAIN_ID),
};

/** Exported for tests: the resolution rules above, applied to an explicit env. */
export const __resolvers = { envUrl, envChainId, DEV_HOST, DEV_RPC, DEV_CHAIN_ID };

export const PHASE_LABELS = ["Setup", "Registration", "Voting", "Ended"] as const;
