import GNDashboard from "./page";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The GN portal, rendered for real.
 *
 * `useGnDivision` is unit-tested separately; what this file checks is that the
 * page *uses* it correctly — the wallet prompt, the "not a GN" screen, and the
 * dashboard itself.
 */

const DIVISION = {
  id: 0,
  name: "Kaduwela",
  votingContract: "0x0000000000000000000000000000000000000aa1",
  gnOfficers: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
  active: true,
  phase: 1,
  treeSize: 3,
  root: 0n,
};

const mocks = vi.hoisted(() => ({
  gn: {
    division: null as unknown,
    divisions: [] as unknown[],
    isLoading: false,
    error: null as string | null,
    identity: null as string | null,
    needsSignIn: false,
    refetch: vi.fn(),
  },
  getLogs: vi.fn(),
  readContract: vi.fn(),
}));

vi.mock("~~/hooks/useGnDivision", () => ({ useGnDivision: () => mocks.gn }));
vi.mock("~~/hooks/scaffold-eth/useTargetNetwork", () => ({
  useTargetNetwork: () => ({
    targetNetwork: { id: 31337, name: "Hardhat", rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } },
  }),
}));
// Mocked wholesale rather than with `importOriginal`: loading the real viem
// here costs seconds and this page only uses these three entry points.
vi.mock("viem", () => ({
  http: () => ({}),
  parseAbiItem: (signature: string) => ({ signature }),
  createPublicClient: () => ({ getLogs: mocks.getLogs, readContract: mocks.readContract }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  mocks.gn = {
    division: null,
    divisions: [],
    isLoading: false,
    error: null,
    identity: null,
    needsSignIn: false,
    refetch: vi.fn(),
  };
  mocks.getLogs.mockReset().mockResolvedValue([]);
  mocks.readContract.mockReset().mockResolvedValue([true, false]);
});

describe("GN portal — identity prompts", () => {
  it("asks for a wallet when disconnected", () => {
    mocks.gn = { ...mocks.gn, needsSignIn: true };

    render(<GNDashboard />);

    expect(screen.getByText(/connect your wallet/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /sign in/i })).toBeNull();
  });

  it("names the wallet address when the officer has no division", () => {
    mocks.gn = {
      ...mocks.gn,
      identity: DIVISION.gnOfficers[0],
      division: null,
      divisions: [DIVISION],
    };

    render(<GNDashboard />);

    expect(screen.getByText(/not assigned as GN for any division/i)).toBeDefined();
    expect(screen.getByText(DIVISION.gnOfficers[0])).toBeDefined();
  });
});

describe("GN portal — the dashboard itself", () => {
  it("renders the division it was given", async () => {
    mocks.gn = { ...mocks.gn, identity: DIVISION.gnOfficers[0], division: DIVISION, divisions: [DIVISION] };

    render(<GNDashboard />);

    expect(screen.getByText(/Kaduwela Division/)).toBeDefined();
    expect(screen.getByText(/authorized GN officer/i)).toBeDefined();
    await waitFor(() => expect(mocks.getLogs).toHaveBeenCalled());
  });

  it("surfaces a chain read failure instead of an empty dashboard", () => {
    mocks.gn = { ...mocks.gn, error: "Could not read the ElectionRegistry." };

    render(<GNDashboard />);

    expect(screen.getByText(/cannot reach the election chain/i)).toBeDefined();
  });

  it("shows a loading state while authorization is still resolving", () => {
    mocks.gn = { ...mocks.gn, isLoading: true };

    render(<GNDashboard />);

    expect(screen.getByText(/checking your GN authorization/i)).toBeDefined();
  });
});
