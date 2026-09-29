"use client";

import { useAccount } from "wagmi";
import { LiveDivision, useDivisions } from "~~/hooks/useDivisions";
import { findDivisionForGN } from "~~/utils/gnDivision";

/**
 * "Which division am I the GN for?" — answered from the connected wallet: the
 * division whose on-chain `s_gnOfficer` equals the connected address.
 */

export interface GnDivisionState {
  division: LiveDivision | null;
  /** True while the on-chain division list is still resolving. */
  isLoading: boolean;
  /** Chain read failure, not an authorization failure. */
  error: string | null;
  /** Every division on chain — pages use it to explain who the registered officers are. */
  divisions: LiveDivision[];
  /** The connected address, used when telling the caller they are not authorized. */
  identity: string | null;
  /** No wallet connected, so the page should ask them to connect rather than say "not a GN". */
  needsSignIn: boolean;
  refetch: () => void;
}

export const useGnDivision = (): GnDivisionState => {
  const { address, isConnected } = useAccount();
  const { divisions, isLoading, error, refetch } = useDivisions();

  return {
    division: findDivisionForGN(divisions, address) ?? null,
    isLoading,
    error,
    divisions,
    identity: address ?? null,
    needsSignIn: !isConnected,
    refetch,
  };
};
