"use client";

import { useCallback, useMemo } from "react";
import { createPublicClient, http } from "viem";
import type { Abi } from "viem";
import { getWalletClient } from "wagmi/actions";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

/**
 * The single write seam.
 *
 * Every admin and GN transaction in the app goes through `write()`: it fetches
 * the connected wallet from wagmi, calls `writeContract` (MetaMask signs), and
 * resolves once the transaction is mined.
 */

export interface ElectionWriteRequest {
  /** Contract to call. */
  address: `0x${string}`;
  /** ABI used to encode the calldata. */
  abi: Abi;
  functionName: string;
  args?: unknown[];
}

export interface ElectionWriter {
  /** Resolves once the transaction is mined, with its hash. Throws on failure. */
  write: (request: ElectionWriteRequest) => Promise<`0x${string}`>;
}

/**
 * A failed write, shaped so existing UI error handling keeps working.
 *
 * The admin and GN pages match on `e?.shortMessage || e?.message` and look for
 * Solidity custom-error names as substrings (`NicRegistry__AlreadyUsed`,
 * `WrongPhase`, …). Carrying `shortMessage` as well as `message` means those
 * checks behave identically whatever produced the error.
 */
export class ElectionWriteError extends Error {
  readonly shortMessage: string;
  readonly status?: number;
  readonly errorName?: string;

  constructor(message: string, options: { status?: number; errorName?: string } = {}) {
    super(message);
    this.name = "ElectionWriteError";
    this.shortMessage = message;
    this.status = options.status;
    this.errorName = options.errorName;
  }
}

export const useElectionWriter = (): ElectionWriter => {
  const { targetNetwork } = useTargetNetwork();

  // Bound to the configured target network rather than the wallet's connected
  // chain — the same reasoning as `useDivisions`.
  const publicClient = useMemo(
    () => createPublicClient({ chain: targetNetwork, transport: http(targetNetwork.rpcUrls.default.http[0]) }),
    [targetNetwork],
  );

  const writeViaWallet = useCallback(
    async ({ address, abi, functionName, args }: ElectionWriteRequest): Promise<`0x${string}`> => {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) throw new ElectionWriteError("No wallet connected");
      const hash = await walletClient.writeContract({
        address,
        abi,
        functionName,
        args: args ?? [],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [publicClient],
  );

  return { write: writeViaWallet };
};
