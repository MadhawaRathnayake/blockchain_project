import { Chain, defineChain } from "viem";

/**
 * Server-side chain configuration for the API routes.
 *
 * The routes under `app/api/` run on the Next.js server and talk to the local
 * Hardhat node. This module is the one place the chain id and RPC URL are
 * resolved, so they can be overridden from the environment without source edits.
 *
 * `RPC_URL` (server-only) wins over `NEXT_PUBLIC_RPC_URL` when both are set, so
 * the server can reach the node on an address the browser cannot (e.g. a
 * container hostname).
 */

export const DEFAULT_HARDHAT_CHAIN_ID = 31337;
export const DEFAULT_HARDHAT_RPC_URL = "http://127.0.0.1:8545";

/** Kept as aliases: what "no configuration at all" resolves to. */
export const DEFAULT_SERVER_CHAIN_ID = DEFAULT_HARDHAT_CHAIN_ID;
export const DEFAULT_SERVER_RPC_URL = DEFAULT_HARDHAT_RPC_URL;

/** Chain ids the dev faucet is willing to fund on. */
export const DEFAULT_FAUCET_CHAIN_IDS = "31337";

/**
 * Parses a chain id from an environment string.
 *
 * Anything that is not a positive integer (missing, blank, `"abc"`, `"0"`) falls
 * back rather than producing a `NaN` chain id, which viem would accept and every
 * subsequent RPC call would then fail on.
 */
export const parseChainId = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export interface ServerChainEnv {
  /** `NEXT_PUBLIC_CHAIN_ID` */
  chainId?: string;
  /** `RPC_URL` — server-only override. */
  rpcUrl?: string;
  /** `NEXT_PUBLIC_RPC_URL` — used when `RPC_URL` is unset. */
  publicRpcUrl?: string;
}

export interface ServerChainConfig {
  chainId: number;
  rpcUrl: string;
}

/** Resolves the server's chain id and RPC URL from explicit env values. Pure — unit tested. */
export const resolveServerChainConfig = (env: ServerChainEnv = {}): ServerChainConfig => {
  return {
    chainId: parseChainId(env.chainId, DEFAULT_HARDHAT_CHAIN_ID),
    rpcUrl: env.rpcUrl?.trim() || env.publicRpcUrl?.trim() || DEFAULT_HARDHAT_RPC_URL,
  };
};

/**
 * Parses `FAUCET_CHAIN_IDS` into a set of chain ids.
 *
 * Malformed entries are dropped rather than silently widening the allowlist to
 * `NaN` (which compares false against everything and would disable the faucet)
 * or throwing at import time (which would take down the whole route).
 */
export const resolveFaucetChainIds = (raw: string | undefined): Set<number> => {
  const source = raw?.trim() ? raw : DEFAULT_FAUCET_CHAIN_IDS;
  const ids = source
    .split(",")
    .map(part => Number(part.trim()))
    .filter(id => Number.isInteger(id) && id > 0);
  return new Set(ids);
};

/** The configured chain id / RPC URL for this server process. */
export const serverChainConfig: ServerChainConfig = resolveServerChainConfig({
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  rpcUrl: process.env.RPC_URL,
  publicRpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
});

/**
 * A minimal viem `Chain` for the configured server chain.
 *
 * Only the write paths need it (viem requires a chain to sign a transaction);
 * reads go through a chainless `createPublicClient`, exactly as before.
 */
export const serverChain: Chain = defineChain({
  id: serverChainConfig.chainId,
  name: `Chain ${serverChainConfig.chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [serverChainConfig.rpcUrl] } },
  testnet: true,
});
