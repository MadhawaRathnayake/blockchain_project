import { useElectionWriter } from "./useElectionWriter";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The write seam: every admin and GN transaction is signed by the connected
 * wallet (MetaMask) and awaited until mined.
 */

const VOTING_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const TX_HASH = "0xabc0000000000000000000000000000000000000000000000000000000000001" as const;

const VOTING_ABI = [
  {
    name: "startVoting",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "duration", type: "uint256" }],
    outputs: [],
  },
] as const;

const writeContract = vi.fn();
const waitForTransactionReceipt = vi.fn();
const getWalletClientMock = vi.fn();

vi.mock("wagmi/actions", () => ({ getWalletClient: (...args: unknown[]) => getWalletClientMock(...args) }));
vi.mock("~~/services/web3/wagmiConfig", () => ({ wagmiConfig: { mock: true } }));
vi.mock("~~/hooks/scaffold-eth/useTargetNetwork", () => ({
  useTargetNetwork: () => ({
    targetNetwork: { id: 31337, name: "Hardhat", rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } },
  }),
}));
vi.mock("viem", async importOriginal => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, createPublicClient: () => ({ waitForTransactionReceipt }), http: () => ({}) };
});

const request = (args: unknown[] = [3600n]) => ({
  address: VOTING_CONTRACT,
  abi: VOTING_ABI as unknown as import("viem").Abi,
  functionName: "startVoting",
  args,
});

beforeEach(() => {
  writeContract.mockReset().mockResolvedValue(TX_HASH);
  waitForTransactionReceipt.mockReset().mockResolvedValue({ status: "success" });
  getWalletClientMock.mockReset().mockResolvedValue({ writeContract });
});

describe("useElectionWriter", () => {
  it("signs with the connected wallet and waits for the receipt", async () => {
    const { result } = renderHook(() => useElectionWriter());

    const hash = await result.current.write(request());

    expect(hash).toBe(TX_HASH);
    expect(writeContract).toHaveBeenCalledWith({
      address: VOTING_CONTRACT,
      abi: VOTING_ABI,
      functionName: "startVoting",
      args: [3600n],
    });
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
  });

  it("passes bigints through untouched", async () => {
    const { result } = renderHook(() => useElectionWriter());

    await result.current.write(request([3600n]));

    expect(writeContract.mock.calls[0][0].args).toEqual([3600n]);
  });

  it("explains a missing wallet the way the pages already expect", async () => {
    getWalletClientMock.mockResolvedValue(null);
    const { result } = renderHook(() => useElectionWriter());

    await expect(result.current.write(request())).rejects.toThrow("No wallet connected");
  });

  it("lets a viem revert propagate unchanged, so custom-error matching still works", async () => {
    writeContract.mockRejectedValue(Object.assign(new Error("x"), { shortMessage: "Voting__WrongPhase" }));
    const { result } = renderHook(() => useElectionWriter());

    await expect(result.current.write(request())).rejects.toMatchObject({ shortMessage: "Voting__WrongPhase" });
  });
});
