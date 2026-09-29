import ResultsDashboard from "./page";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /results with web votes merged in.
 *
 * Web votes (cast on /vote, held by `WebVoting`) count toward the division they
 * were cast against and toward the national totals, but not toward turnout —
 * web voters never register a commitment.
 */

const DIV_A = "0x0000000000000000000000000000000000000aa1";
const DIV_B = "0x0000000000000000000000000000000000000aa2";
const WEB_VOTING = "0x0000000000000000000000000000000000000ee1";

const DIVISIONS = [
  { id: 0, name: "Kaduwela", votingContract: DIV_A, phase: 2, treeSize: 4 },
  { id: 1, name: "Colombo", votingContract: DIV_B, phase: 2, treeSize: 4 },
];

const mocks = vi.hoisted(() => ({
  readContract: vi.fn(),
  webVotingAddress: undefined as string | undefined,
}));

vi.mock("wagmi", () => ({ usePublicClient: () => ({ readContract: mocks.readContract }) }));
vi.mock("~~/hooks/scaffold-eth", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 31337 } }) }));
vi.mock("~~/hooks/useDivisions", () => ({
  PHASE_LABELS: ["Setup", "Registration", "Voting", "Ended"],
  useDivisions: () => ({ divisions: DIVISIONS, isLoading: false, error: null }),
}));
vi.mock("~~/utils/deployedAddress", () => ({ getDeployedAddress: () => mocks.webVotingAddress }));

/** App (ZK) tallies: Kaduwela 2/0, Colombo 1/1 — 4 app votes over 8 registered. */
const stubReads = (webBallot: (() => Promise<unknown>) | null) =>
  mocks.readContract.mockImplementation(({ address, functionName }: { address: string; functionName: string }) => {
    if (functionName === "getBallot") return webBallot ? webBallot() : Promise.reject(new Error("no WebVoting"));
    if (functionName === "getCandidates") return Promise.resolve(["Alice", "Bob"]);
    if (functionName === "getVoteCounts") return Promise.resolve(address === DIV_A ? [2n, 0n] : [1n, 1n]);
    return Promise.resolve(undefined);
  });

/** Three web votes for Bob, cast against Kaduwela. */
const webBallot = () =>
  Promise.resolve([DIV_A, "Kaduwela", "Q", ["Alice", "Bob"], 2, 0n, 0n, [0n, 3n], false] as const);

beforeEach(() => {
  mocks.readContract.mockReset();
  mocks.webVotingAddress = WEB_VOTING;
});

describe("results page — web votes", () => {
  it("adds web votes to the national totals and shows the split", async () => {
    stubReads(webBallot);

    render(<ResultsDashboard />);

    // 4 app + 3 web.
    expect(await screen.findByText("4 app · 3 web")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    // Bob: 1 app (Colombo) + 3 web.
    expect(screen.getByText("4", { selector: "span" })).toBeDefined();
  });

  it("attributes web votes to the division they were cast against", async () => {
    stubReads(webBallot);

    render(<ResultsDashboard />);

    expect(await screen.findByText(/5 votes\s*\(3 web\)/)).toBeDefined();
    // Colombo received no web votes.
    expect(screen.getByText(/^\s*2 votes\s*$/)).toBeDefined();
  });

  it("keeps turnout based on app votes only", async () => {
    stubReads(webBallot);

    render(<ResultsDashboard />);

    await screen.findByText("4 app · 3 web");
    // 4 app votes / 8 registered, not 7 / 8.
    expect(screen.getByText("50.0%")).toBeDefined();
  });

  it("shows app-only results when the web ballot cannot be read", async () => {
    stubReads(null);

    render(<ResultsDashboard />);

    // Both divisions have 2 app votes and nothing is added.
    expect(await screen.findAllByText(/^\s*2 votes\s*$/)).toHaveLength(2);
    expect(screen.queryByText(/web/)).toBeNull();
    expect(screen.getByText("50.0%")).toBeDefined();
  });

  it("does not ask for web votes when WebVoting is not deployed", async () => {
    mocks.webVotingAddress = undefined;
    stubReads(webBallot);

    render(<ResultsDashboard />);

    await screen.findAllByText(/^\s*2 votes\s*$/);
    expect(mocks.readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "getBallot" }));
    expect(screen.queryByText(/web/)).toBeNull();
  });
});
