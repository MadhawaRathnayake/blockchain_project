import type { LiveDivision } from "~~/hooks/useDivisions";

/**
 * "Which division does this officer run?", as a pure function.
 *
 * It lives outside `hooks/useDivisions.ts` because that module pulls in the
 * whole wagmi/scaffold read stack, and the identity rule deserves to be
 * testable without it.
 */

/** The division whose on-chain GN officers include this wallet address. */
export const findDivisionForGN = (divisions: readonly LiveDivision[], address?: string): LiveDivision | undefined => {
  if (!address) return undefined;
  return divisions.find(division => division.gnOfficers.some(gn => gn.toLowerCase() === address.toLowerCase()));
};
