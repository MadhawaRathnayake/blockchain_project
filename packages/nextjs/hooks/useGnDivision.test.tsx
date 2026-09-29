import { useGnDivision } from "./useGnDivision";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Which division am I the GN for?" answered from the connected wallet.
 */

const KADUWELA_GN = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const COLOMBO_GN = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const DIVISIONS = [
  {
    id: 0,
    name: "Kaduwela",
    votingContract: "0x0000000000000000000000000000000000000aa1",
    gnOfficers: [KADUWELA_GN],
    active: true,
    phase: 1,
    treeSize: 3,
    root: 0n,
  },
  {
    id: 1,
    name: "Colombo",
    votingContract: "0x0000000000000000000000000000000000000aa2",
    gnOfficers: [COLOMBO_GN],
    active: true,
    phase: 0,
    treeSize: 0,
    root: 0n,
  },
];

const mocks = vi.hoisted(() => ({
  account: { address: undefined as string | undefined, isConnected: false },
  divisions: { divisions: [] as unknown[], isLoading: false, error: null as string | null, refetch: vi.fn() },
}));

vi.mock("wagmi", () => ({ useAccount: () => mocks.account }));
// Mocked wholesale: the real module pulls in the wagmi/scaffold read stack,
// which this hook's logic does not need. The pure lookups it uses live in
// `utils/gnDivision` and run for real.
vi.mock("~~/hooks/useDivisions", () => ({ useDivisions: () => mocks.divisions }));

beforeEach(() => {
  mocks.account = { address: undefined, isConnected: false };
  mocks.divisions = { divisions: DIVISIONS, isLoading: false, error: null, refetch: vi.fn() };
});

describe("useGnDivision", () => {
  it("resolves the division from the connected wallet", () => {
    mocks.account = { address: KADUWELA_GN, isConnected: true };

    const { result } = renderHook(() => useGnDivision());

    expect(result.current.division?.name).toBe("Kaduwela");
    expect(result.current.identity).toBe(KADUWELA_GN);
  });

  it("matches the on-chain officer case-insensitively", () => {
    mocks.account = { address: KADUWELA_GN.toLowerCase(), isConnected: true };

    const { result } = renderHook(() => useGnDivision());

    expect(result.current.division?.name).toBe("Kaduwela");
  });

  it("asks for a wallet when disconnected", () => {
    const { result } = renderHook(() => useGnDivision());

    expect(result.current.needsSignIn).toBe(true);
  });

  it("reports no division for a connected wallet that is nobody's GN", () => {
    mocks.account = { address: "0x000000000000000000000000000000000000dEaD", isConnected: true };

    const { result } = renderHook(() => useGnDivision());

    expect(result.current.division).toBeNull();
    expect(result.current.needsSignIn).toBe(false);
  });

  it("passes a chain read failure through untouched", () => {
    mocks.divisions = {
      divisions: [],
      isLoading: false,
      error: "Could not read the ElectionRegistry.",
      refetch: vi.fn(),
    };

    const { result } = renderHook(() => useGnDivision());

    expect(result.current.error).toContain("ElectionRegistry");
  });
});
