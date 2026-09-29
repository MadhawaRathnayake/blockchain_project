import { AdminElectionProvider } from "./_components/AdminElectionProvider";
import AdminBallotPage from "./ballot/page";
import AdminDivisionsPage from "./divisions/page";
import AdminOperationsPage from "./page";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin area, rendered for real.
 *
 * The risks are mechanical: an action targeting the wrong contract, or the
 * access gate admitting the wrong wallet. Each
 * of those is checked below by driving the actual buttons.
 *
 * The panel is now three routes (Operations, Ballot, Divisions) sharing
 * `AdminElectionProvider`, so each test mounts the provider around the page
 * that owns the control it drives — the same composition the real layout
 * produces.
 */

// Everything a `vi.mock` factory touches has to be hoisted with the mocks —
// the factories run before module-level constants are initialised.
const { DIVISION, OWNER, REGISTRY, VOTING_DATA, NIC_REGISTRY, NEW_DIVISION_ADDRESS, TARGET_NETWORK, mocks } =
  vi.hoisted(() => {
    const DIVISION = {
      id: 0,
      name: "Kaduwela",
      votingContract: "0x0000000000000000000000000000000000000aa1",
      gnOfficers: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
      active: true,
      phase: 0,
      treeSize: 0,
      root: 0n,
    };
    const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    return {
      DIVISION,
      OWNER,
      REGISTRY: "0x0000000000000000000000000000000000000cc1",
      /** The NicRegistry address the admin panel must authorise divisions against. */
      NIC_REGISTRY: "0x0000000000000000000000000000000000000dd1",
      /** The Voting contract `createDivision` deploys, read back from its receipt. */
      NEW_DIVISION_ADDRESS: "0x0000000000000000000000000000000000000ee1",
      /** `getVotingData()` in Setup phase: question, owner, phase, …, candidateCount. */
      VOTING_DATA: ["Who should represent Kaduwela?", OWNER, 0, 0, 0, 0, 0, 0n, 2],
      /**
       * One object, reused. The real `useTargetNetwork` memoises off a zustand
       * store, so its identity is stable across renders; a mock that rebuilt it
       * each call would invalidate the `publicClient` memo on every render and
       * manufacture churn the app does not have.
       */
      TARGET_NETWORK: {
        id: 31337,
        name: "Hardhat",
        rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
      },
      mocks: {
        account: { address: undefined as string | undefined },
        write: vi.fn(),
        readContract: vi.fn(),
        getLogs: vi.fn(),
        getTransactionReceipt: vi.fn(),
        refetch: vi.fn(),
        notifyError: vi.fn(),
        notifySuccess: vi.fn(),
        notifyWarning: vi.fn(),
      },
    };
  });

/** Also stable — `useTargetNetwork` wraps its return in a `useMemo`. */
const TARGET_NETWORK_RESULT = { targetNetwork: TARGET_NETWORK };

vi.mock("~~/hooks/useElectionWriter", () => ({ useElectionWriter: () => ({ write: mocks.write }) }));
// Fresh objects on every call, exactly like the real hook: it re-polls every 4s
// and rebuilds the array, so anything depending on a division's *identity*
// churns constantly. `AdminElectionProvider` must key off the contract address
// instead — see the "does not flicker" test at the bottom.
vi.mock("~~/hooks/useDivisions", () => ({
  useDivisions: () => ({
    divisions: [{ ...DIVISION }],
    isLoading: false,
    error: null,
    refetch: mocks.refetch,
  }),
}));
vi.mock("~~/hooks/scaffold-eth/useTargetNetwork", () => ({
  useTargetNetwork: () => TARGET_NETWORK_RESULT,
}));
vi.mock("wagmi", () => ({ useAccount: () => mocks.account }));
vi.mock("viem", () => ({
  http: () => ({}),
  createPublicClient: () => ({
    readContract: mocks.readContract,
    getLogs: mocks.getLogs,
    getTransactionReceipt: mocks.getTransactionReceipt,
  }),
  // Identity stubs: the real parsers need a full ABI/log encoding, and what
  // these tests care about is which calls the page makes, not viem's decoding.
  parseAbiItem: (signature: string) => ({ signature }),
  parseEventLogs: ({ logs }: { logs: unknown[] }) => logs,
}));
vi.mock("~~/contracts/deployedContracts", () => ({
  default: {
    31337: {
      Voting: { address: DIVISION.votingContract, abi: [] },
      ElectionRegistry: { address: REGISTRY, abi: [] },
      NicRegistry: { address: NIC_REGISTRY, abi: [] },
    },
  },
}));
vi.mock("~~/utils/scaffold-eth", () => ({
  notification: { error: mocks.notifyError, success: mocks.notifySuccess, warning: mocks.notifyWarning },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/voting/admin",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@scaffold-ui/components", () => ({
  AddressInput: ({ value, onChange, placeholder }: any) => (
    <input placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

/** `readContract` is called for getVotingData, getCandidates and owner. */
const stubReads = () =>
  mocks.readContract.mockImplementation(({ functionName }: { functionName: string }) => {
    if (functionName === "getVotingData") return Promise.resolve(VOTING_DATA);
    if (functionName === "getCandidates") return Promise.resolve(["Alice", "Bob"]);
    if (functionName === "owner") return Promise.resolve(OWNER);
    return Promise.resolve(undefined);
  });

/** Mount a route the way `layout.tsx` does. */
const renderAdmin = (ui: React.ReactNode) => render(<AdminElectionProvider>{ui}</AdminElectionProvider>);

beforeEach(() => {
  mocks.account = { address: OWNER };
  mocks.write.mockReset().mockResolvedValue("0xdeadbeef");
  mocks.readContract.mockReset();
  // Default: the sample division is already authorised, which is true of the
  // three the deploy script creates. Tests that care override this.
  mocks.getLogs
    .mockReset()
    .mockResolvedValue([{ args: { votingContract: DIVISION.votingContract, authorized: true } }]);
  mocks.getTransactionReceipt
    .mockReset()
    .mockResolvedValue({ logs: [{ args: { votingContract: NEW_DIVISION_ADDRESS } }] });
  mocks.notifyError.mockClear();
  mocks.notifySuccess.mockClear();
  mocks.notifyWarning.mockClear();
  stubReads();
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
});

afterEach(() => vi.unstubAllGlobals());

describe("admin area — access gate", () => {
  it("asks for a wallet when none is connected", () => {
    mocks.account = { address: undefined };

    renderAdmin(<AdminOperationsPage />);

    expect(screen.getByText(/connect a wallet/i)).toBeDefined();
  });

  it("blocks a connected wallet that is not the contract owner", async () => {
    mocks.account = { address: "0x000000000000000000000000000000000000dEaD" };

    renderAdmin(<AdminOperationsPage />);

    expect(await screen.findByText(/not the contract owner/i)).toBeDefined();
  });

  it("admits the owner", async () => {
    renderAdmin(<AdminBallotPage />);

    expect(await screen.findByText(/ballot question/i)).toBeDefined();
  });

  it("gates every route, not just the one that used to hold the controls", () => {
    mocks.account = { address: undefined };

    renderAdmin(<AdminDivisionsPage />);

    expect(screen.getByText(/connect a wallet/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /deploy & register division/i })).toBeNull();
  });
});

describe("admin area — write sites go through the seam", () => {
  /**
   * `ready` is matched against a heading, not any text: panels cross-reference
   * each other by name ("Uses the durations typed in Phase controls above"), so
   * a bare text query would match two nodes and throw.
   */
  const renderAsAdmin = async (ui: React.ReactNode, ready: RegExp) => {
    renderAdmin(ui);
    await screen.findByRole("heading", { name: ready });
    return userEvent.setup();
  };

  it("saves the question against the selected division", async () => {
    const user = await renderAsAdmin(<AdminBallotPage />, /ballot question/i);

    await user.click(screen.getByRole("button", { name: /save question/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0][0]).toMatchObject({
      address: DIVISION.votingContract,
      functionName: "setQuestion",
      args: ["Who should represent Kaduwela?"],
    });
  });

  it("sends durations as bigint seconds, parsed from hh:mm:ss", async () => {
    const user = await renderAsAdmin(<AdminOperationsPage />, /phase controls/i);

    // Named after the selected division, which is also what tells this button
    // apart from the "… on all N divisions" one in the same section.
    await user.click(screen.getByRole("button", { name: /start registration on kaduwela/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ functionName: "startRegistration", args: [3600n] });
  });

  it("applies an ALL-divisions action to every division contract", async () => {
    const user = await renderAsAdmin(<AdminOperationsPage />, /phase controls/i);

    await user.click(screen.getByRole("button", { name: /start registration on all/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0][0]).toMatchObject({
      address: DIVISION.votingContract,
      functionName: "startRegistration",
    });
    expect(mocks.notifySuccess).toHaveBeenCalledWith(expect.stringContaining("Registration started on 1 division"));
  });

  it("skips a division that reverts instead of aborting the whole run", async () => {
    const user = await renderAsAdmin(<AdminOperationsPage />, /phase controls/i);
    mocks.write.mockRejectedValue(new Error("Voting__WrongPhase"));

    await user.click(screen.getByRole("button", { name: /end election on all/i }));

    await waitFor(() => expect(mocks.notifySuccess).toHaveBeenCalledWith(expect.stringContaining("skipped")));
  });

  /**
   * A national phase change is a one-way door — `Voting` cannot go back without
   * a full reset — and it acts on divisions the operator cannot see from here.
   * The reversible ballot broadcasts already asked; these used to fire on the
   * first click.
   */
  it("does not run a national phase change when the operator cancels", async () => {
    const user = await renderAsAdmin(<AdminOperationsPage />, /phase controls/i);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    await user.click(screen.getByRole("button", { name: /end election on all/i }));

    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("creates a division on the registry, not on a division contract", async () => {
    const user = await renderAsAdmin(<AdminDivisionsPage />, /add new division/i);

    await user.type(screen.getByPlaceholderText(/Kandy, Matara/), "Galle");
    await user.click(screen.getByRole("button", { name: /deploy & register division/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0][0]).toMatchObject({
      address: REGISTRY,
      functionName: "createDivision",
      args: ["Galle"],
    });
  });

  /**
   * The regression tests for a real defect: the Add Division panel used to make
   * only the `createDivision` call and report success, leaving the division
   * unusable for GN enrolment because `NicRegistry.reserveNicHash` refuses any
   * contract that was never passed to `setVotingContract`. The contract
   * behaviour these rely on is pinned in
   * `packages/hardhat/test/DivisionEnrolment.ts`.
   */
  it("also authorises the new division for NIC enrolment", async () => {
    const user = await renderAsAdmin(<AdminDivisionsPage />, /add new division/i);

    await user.type(screen.getByPlaceholderText(/Kandy, Matara/), "Galle");
    await user.click(screen.getByRole("button", { name: /deploy & register division/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2));
    expect(mocks.write.mock.calls[1][0]).toMatchObject({
      address: NIC_REGISTRY,
      functionName: "setVotingContract",
      args: [NEW_DIVISION_ADDRESS, true],
    });
    expect(mocks.notifySuccess).toHaveBeenCalledWith(expect.stringContaining("authorised"));
  });

  it("warns rather than claiming success when authorisation fails", async () => {
    const user = await renderAsAdmin(<AdminDivisionsPage />, /add new division/i);
    // The division is created, then the second call fails. Reporting a plain
    // error would imply nothing happened, which is the opposite of the truth.
    mocks.write.mockResolvedValueOnce("0xdeadbeef").mockRejectedValueOnce(new Error("transaction refused"));

    await user.type(screen.getByPlaceholderText(/Kandy, Matara/), "Galle");
    await user.click(screen.getByRole("button", { name: /deploy & register division/i }));

    await waitFor(() => expect(mocks.notifyWarning).toHaveBeenCalled());
    const warning = mocks.notifyWarning.mock.calls[0][0] as string;
    expect(warning).toContain("was created");
    expect(warning).toContain("transaction refused");
    expect(mocks.notifySuccess).not.toHaveBeenCalledWith(expect.stringContaining("authorised"));
  });

  it("assigns a GN officer on the chosen division contract", async () => {
    const user = await renderAsAdmin(<AdminDivisionsPage />, /gn officer management/i);

    const addressInputs = screen.getAllByPlaceholderText("0x...");
    await user.type(addressInputs[addressInputs.length - 1], DIVISION.gnOfficers[0]);
    await user.click(screen.getByRole("button", { name: /assign GN to Kaduwela/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0][0]).toMatchObject({
      address: DIVISION.votingContract,
      functionName: "setGNOfficer",
      args: [DIVISION.gnOfficers[0], true],
    });
  });

  it("offers the voter allowlist, since the owner may call addVoters", async () => {
    renderAdmin(<AdminBallotPage />);
    await screen.findByText(/ballot question/i);

    expect(screen.getByRole("button", { name: /submit allowlist/i })).toBeDefined();
  });

  it("surfaces a revert through the existing error toast", async () => {
    const user = await renderAsAdmin(<AdminBallotPage />, /ballot question/i);
    mocks.write.mockRejectedValue(Object.assign(new Error("x"), { shortMessage: "Voting__WrongPhase" }));

    await user.click(screen.getByRole("button", { name: /save question/i }));

    await waitFor(() => expect(mocks.notifyError).toHaveBeenCalledWith("Voting__WrongPhase"));
  });

  /**
   * A per-division save used to report nothing at all: the button un-greyed and
   * that was the whole signal, which looks the same as a click that never
   * registered. The failure path always toasted — only success was silent.
   */
  it("confirms a per-division save, naming the division it landed on", async () => {
    const user = await renderAsAdmin(<AdminBallotPage />, /ballot question/i);

    await user.click(screen.getByRole("button", { name: /save question for/i }));

    await waitFor(() => expect(mocks.notifySuccess).toHaveBeenCalledWith(expect.stringContaining("Kaduwela")));
  });
});

describe("admin area — candidates, per division and across all of them", () => {
  const renderBallot = async () => {
    renderAdmin(<AdminBallotPage />);
    await screen.findByRole("heading", { name: /^candidates$/i });
    return userEvent.setup();
  };

  it("saves the slate to the selected division only", async () => {
    const user = await renderBallot();

    await user.click(screen.getByRole("button", { name: /save candidates for/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write.mock.calls[0][0]).toMatchObject({
      address: DIVISION.votingContract,
      functionName: "setCandidates",
      args: [["Alice", "Bob"]],
    });
  });

  it("confirms the save, without claiming the broadcast's division count", async () => {
    const user = await renderBallot();

    await user.click(screen.getByRole("button", { name: /save candidates for/i }));

    await waitFor(() => expect(mocks.notifySuccess).toHaveBeenCalledWith("2 candidates saved for Kaduwela"));
  });

  it("broadcasts the same slate to every division", async () => {
    const user = await renderBallot();

    await user.click(screen.getByRole("button", { name: /apply candidates to all/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0][0]).toMatchObject({
      address: DIVISION.votingContract,
      functionName: "setCandidates",
      args: [["Alice", "Bob"]],
    });
    expect(mocks.notifySuccess).toHaveBeenCalledWith(expect.stringContaining("Candidate list applied on 1 division"));
  });

  it("skips divisions past Setup rather than aborting the broadcast", async () => {
    const user = await renderBallot();
    mocks.write.mockRejectedValue(new Error("Voting__WrongPhase"));

    await user.click(screen.getByRole("button", { name: /apply candidates to all/i }));

    await waitFor(() => expect(mocks.notifySuccess).toHaveBeenCalledWith(expect.stringContaining("skipped")));
  });

  it("does not write anything when the operator cancels the broadcast", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const user = await renderBallot();

    await user.click(screen.getByRole("button", { name: /apply candidates to all/i }));

    expect(mocks.write).not.toHaveBeenCalled();
  });

  /**
   * Both paths run the same validation. A broadcast that accepted a list the
   * per-division save rejects would put a ballot on every contract that the UI
   * refuses to set on one.
   */
  it("refuses an empty slate from either path, without writing", async () => {
    // Nothing on chain to seed the drafts from, so they stay blank.
    mocks.readContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "getVotingData") return Promise.resolve(VOTING_DATA);
      if (functionName === "getCandidates") return Promise.resolve([]);
      if (functionName === "owner") return Promise.resolve(OWNER);
      return Promise.resolve(undefined);
    });
    const user = await renderBallot();

    await user.click(screen.getByRole("button", { name: /save candidates for/i }));
    await user.click(screen.getByRole("button", { name: /apply candidates to all/i }));

    await waitFor(() => expect(mocks.notifyError).toHaveBeenCalledWith("Add at least one candidate."));
    expect(mocks.notifyError).toHaveBeenCalledTimes(2);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

describe("admin area — the ballot question, per division and across all of them", () => {
  const renderBallot = async () => {
    renderAdmin(<AdminBallotPage />);
    await screen.findByRole("heading", { name: /ballot question/i });
    return userEvent.setup();
  };

  it("broadcasts the same question to every division", async () => {
    const user = await renderBallot();

    await user.click(screen.getByRole("button", { name: /apply question to all/i }));

    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0][0]).toMatchObject({
      address: DIVISION.votingContract,
      functionName: "setQuestion",
      args: ["Who should represent Kaduwela?"],
    });
    expect(mocks.notifySuccess).toHaveBeenCalledWith(expect.stringContaining("Ballot question applied on 1 division"));
  });

  it("does not write anything when the operator cancels the broadcast", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const user = await renderBallot();

    await user.click(screen.getByRole("button", { name: /apply question to all/i }));

    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("offers the division picker on this tab, so the ballot can be retargeted here", async () => {
    await renderBallot();

    expect(screen.getByRole("combobox", { name: /active division/i })).toBeDefined();
  });

  /**
   * Both save buttons name their target. Two controls a few pixels apart, one
   * writing to one division and one to all of them, is precisely where an
   * unlabelled "Save" gets clicked by mistake.
   */
  it("names the target division on the per-division save buttons", async () => {
    await renderBallot();

    expect(screen.getByRole("button", { name: /save question for Kaduwela/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /save candidates for Kaduwela/i })).toBeDefined();
  });
});

describe("admin area — GN officer table", () => {
  it("lists a division's on-chain officer as assigned", async () => {
    renderAdmin(<AdminDivisionsPage />);
    await screen.findByRole("heading", { name: /gn officer management/i });

    await waitFor(() => expect(screen.getByText("1 assigned")).toBeDefined());
    expect(screen.queryByText(/cannot enrol voters/i)).toBeNull();
  });
});

describe("admin area — live state does not flicker", () => {
  /**
   * The regression test for a real defect.
   *
   * `useDivisions` re-polls every 4s and returns a fresh object per division, so
   * `selectedDiv` changes identity constantly. The provider used to depend on
   * that object, and its effect blanked `votingData` before each re-read —
   * which dropped `phase` to its `?? 0` fallback, i.e. Setup. Mid-election that
   * briefly re-enabled the Setup-only controls, so an operator could click
   * "Save question" during Voting and get a revert.
   *
   * The page re-renders once a second on its own (the countdown ticker), which
   * is enough to reproduce the churn without touching timers.
   */
  it("re-reads the division on a timer, not on every render", async () => {
    mocks.readContract.mockImplementation(({ functionName }: { functionName: string }) => {
      // Phase 2 = Voting: the ballot is frozen.
      if (functionName === "getVotingData")
        return Promise.resolve(["Who should represent Kaduwela?", OWNER, 2, 0, 0, 0, 0, 0n, 2]);
      if (functionName === "getCandidates") return Promise.resolve(["Alice", "Bob"]);
      if (functionName === "owner") return Promise.resolve(OWNER);
      return Promise.resolve(undefined);
    });

    renderAdmin(<AdminBallotPage />);
    await screen.findByRole("heading", { name: /ballot question/i });

    // Settle the initial load, then measure only what happens afterwards.
    await waitFor(() => expect(mocks.readContract).toHaveBeenCalled());
    const afterFirstLoad = mocks.readContract.mock.calls.length;

    // Long enough for the 1s countdown ticker to re-render several times, and
    // short enough that the deliberate 4s poll fires at most once.
    await new Promise(resolve => setTimeout(resolve, 1500));

    const added = mocks.readContract.mock.calls.length - afterFirstLoad;

    // Keyed on the object, each of those re-renders re-created `refetchDivision`,
    // which re-ran the effect, which set state, which re-rendered… a read storm
    // that also blanked `votingData` — dropping `phase` to its `?? 0` fallback
    // and briefly re-enabling the Setup-only controls mid-election.
    expect(added).toBeLessThanOrEqual(3);

    // And the frozen ballot stayed frozen throughout.
    expect((screen.getByRole("button", { name: /save question/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
