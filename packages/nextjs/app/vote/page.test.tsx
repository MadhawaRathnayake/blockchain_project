import WebVotePage from "./page";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The web voting page, rendered for real against mocked chain reads.
 *
 * Checks that each election state gets the right screen and that a vote is
 * sent to `WebVoting.vote` with the chosen candidate's index.
 */

const VOTER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const DIVISION = "0x0000000000000000000000000000000000000aa1";

type Ballot = readonly [string, string, string, string[], number, bigint, bigint, bigint[], boolean];

const ballot = (overrides: { phase?: number; hasVoted?: boolean; votingEndTime?: bigint } = {}): Ballot => [
  DIVISION,
  "Kaduwela",
  "Who should be president?",
  ["Alice", "Bob"],
  overrides.phase ?? 2,
  overrides.votingEndTime ?? BigInt(Math.floor(Date.now() / 1000) + 3600),
  0n,
  [3n, 1n],
  overrides.hasVoted ?? false,
];

const mocks = vi.hoisted(() => ({
  account: { address: undefined as string | undefined, isConnected: false },
  read: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  writeContractAsync: vi.fn(),
}));

vi.mock("wagmi", () => ({ useAccount: () => mocks.account }));
vi.mock("~~/hooks/scaffold-eth", () => ({
  useScaffoldReadContract: () => mocks.read,
  useScaffoldWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync, isMining: false }),
}));

beforeEach(() => {
  mocks.account = { address: VOTER, isConnected: true };
  mocks.read = { data: ballot(), isLoading: false, isError: false, refetch: vi.fn() };
  mocks.writeContractAsync.mockReset().mockResolvedValue("0xdeadbeef");
});

describe("web voting page", () => {
  it("asks for a wallet when disconnected", () => {
    mocks.account = { address: undefined, isConnected: false };

    render(<WebVotePage />);

    expect(screen.getByText(/connect your metamask wallet/i)).toBeDefined();
  });

  it("explains that no election is available when the ballot cannot be read", () => {
    mocks.read = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };

    render(<WebVotePage />);

    expect(screen.getByText(/no election available/i)).toBeDefined();
  });

  it("says voting has not started during Setup or Registration", () => {
    mocks.read = { ...mocks.read, data: ballot({ phase: 1 }) };

    render(<WebVotePage />);

    expect(screen.getByText(/voting has not started yet/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /cast vote/i })).toBeNull();
  });

  it("says voting has ended once the election is over", () => {
    mocks.read = { ...mocks.read, data: ballot({ phase: 3 }) };

    render(<WebVotePage />);

    expect(screen.getByText(/voting has ended/i)).toBeDefined();
  });

  it("treats an expired voting window as ended even before the chain advances the phase", () => {
    mocks.read = { ...mocks.read, data: ballot({ phase: 2, votingEndTime: 1n }) };

    render(<WebVotePage />);

    expect(screen.getByText(/voting has ended/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /cast vote/i })).toBeNull();
  });

  it("casts a vote for the selected candidate", async () => {
    const user = userEvent.setup();
    render(<WebVotePage />);

    const button = screen.getByRole("button", { name: /cast vote/i });
    expect(button.hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByLabelText("Bob"));
    await user.click(button);

    await waitFor(() => expect(mocks.writeContractAsync).toHaveBeenCalledWith({ functionName: "vote", args: [1n] }));
    expect(mocks.read.refetch).toHaveBeenCalled();
  });

  it("confirms an existing vote instead of offering the ballot again", () => {
    mocks.read = { ...mocks.read, data: ballot({ hasVoted: true }) };

    render(<WebVotePage />);

    expect(screen.getByText(/your vote has been recorded/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /cast vote/i })).toBeNull();
  });

  it("shows the web tally", () => {
    render(<WebVotePage />);

    expect(screen.getByText(/4 votes cast from this page/i)).toBeDefined();
    expect(screen.getByText("3 (75%)")).toBeDefined();
  });
});
