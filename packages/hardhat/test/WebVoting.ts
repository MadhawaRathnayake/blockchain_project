import { expect } from "chai";
import { ethers } from "hardhat";
import { ElectionRegistry, Voting, WebVoting } from "../typechain-types";

const HOUR = 3600;

describe("WebVoting", function () {
  let registry: ElectionRegistry;
  let divisionA: Voting;
  let divisionB: Voting;
  let webVoting: WebVoting;
  let owner: any, voter1: any, voter2: any;

  const deployVoting = async (verifier: string, nicRegistry: string, leanIMT: string, question: string) => {
    const VotingFactory = await ethers.getContractFactory("Voting", { libraries: { LeanIMT: leanIMT } });
    return (await VotingFactory.deploy(owner.address, verifier, nicRegistry, question, [
      "Candidate A",
      "Candidate B",
      "Candidate C",
    ])) as Voting;
  };

  /** Setup → Registration → Voting on a division. */
  const openVoting = async (division: Voting) => {
    await division.startRegistration(HOUR);
    await division.startVoting(HOUR);
  };

  beforeEach(async function () {
    [owner, voter1, voter2] = await ethers.getSigners();

    const poseidon = await (await ethers.getContractFactory("PoseidonT3")).deploy();
    const leanIMT = await (
      await ethers.getContractFactory("LeanIMT", { libraries: { PoseidonT3: await poseidon.getAddress() } })
    ).deploy();
    const leanIMTAddr = await leanIMT.getAddress();
    const verifierAddr = await (await (await ethers.getContractFactory("HonkVerifier")).deploy()).getAddress();
    const nicRegistryAddr = await (
      await (await ethers.getContractFactory("NicRegistry")).deploy(owner.address)
    ).getAddress();

    registry = (await (
      await ethers.getContractFactory("ElectionRegistry", { libraries: { LeanIMT: leanIMTAddr } })
    ).deploy(owner.address, verifierAddr, nicRegistryAddr)) as ElectionRegistry;

    divisionA = await deployVoting(verifierAddr, nicRegistryAddr, leanIMTAddr, "Question A");
    divisionB = await deployVoting(verifierAddr, nicRegistryAddr, leanIMTAddr, "Question B");
    await registry.addDivision("Division A", await divisionA.getAddress(), ethers.ZeroAddress);
    await registry.addDivision("Division B", await divisionB.getAddress(), ethers.ZeroAddress);

    webVoting = (await (await ethers.getContractFactory("WebVoting")).deploy(await registry.getAddress())) as WebVoting;
  });

  describe("phase gate", function () {
    it("rejects a vote during Setup", async function () {
      await expect(webVoting.connect(voter1).vote(0))
        .to.be.revertedWithCustomError(webVoting, "WebVoting__NotVotingPhase")
        .withArgs(0);
    });

    it("rejects a vote during Registration", async function () {
      await divisionA.startRegistration(HOUR);
      await expect(webVoting.connect(voter1).vote(0))
        .to.be.revertedWithCustomError(webVoting, "WebVoting__NotVotingPhase")
        .withArgs(1);
    });

    it("rejects a vote after the election has ended", async function () {
      await openVoting(divisionA);
      await divisionA.endElection();
      await expect(webVoting.connect(voter1).vote(0))
        .to.be.revertedWithCustomError(webVoting, "WebVoting__NotVotingPhase")
        .withArgs(3);
    });

    it("rejects a vote once the voting window has expired", async function () {
      await openVoting(divisionA);
      await ethers.provider.send("evm_increaseTime", [HOUR + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(webVoting.connect(voter1).vote(0))
        .to.be.revertedWithCustomError(webVoting, "WebVoting__NotVotingPhase")
        .withArgs(3);
    });
  });

  describe("voting", function () {
    beforeEach(async function () {
      await openVoting(divisionA);
    });

    it("counts a vote and emits WebVoteCast", async function () {
      await expect(webVoting.connect(voter1).vote(1))
        .to.emit(webVoting, "WebVoteCast")
        .withArgs(await divisionA.getAddress(), 0, voter1.address, 1);

      const ballot = await webVoting.getBallot(voter1.address);
      expect(ballot.webVoteCounts).to.deep.equal([0n, 1n, 0n]);
      expect(ballot.hasVoted).to.equal(true);
    });

    it("allows one vote per address, but lets other addresses vote", async function () {
      await webVoting.connect(voter1).vote(0);
      await expect(webVoting.connect(voter1).vote(1))
        .to.be.revertedWithCustomError(webVoting, "WebVoting__AlreadyVoted")
        .withArgs(voter1.address);

      await webVoting.connect(voter2).vote(0);
      expect((await webVoting.getBallot(voter2.address)).webVoteCounts).to.deep.equal([2n, 0n, 0n]);
    });

    it("rejects an invalid candidate", async function () {
      await expect(webVoting.connect(voter1).vote(3))
        .to.be.revertedWithCustomError(webVoting, "WebVoting__InvalidCandidate")
        .withArgs(3);
    });

    it("does not touch the division's ZK tally", async function () {
      await webVoting.connect(voter1).vote(0);
      await webVoting.connect(voter2).vote(2);
      expect(await divisionA.getVoteCounts()).to.deep.equal([0n, 0n, 0n]);
    });
  });

  describe("ballot resolution", function () {
    it("reads the ballot from the first division, ignoring the others", async function () {
      const ballot = await webVoting.getBallot(voter1.address);
      expect(ballot.votingContract).to.equal(await divisionA.getAddress());
      expect(ballot.divisionName).to.equal("Division A");
      expect(ballot.question).to.equal("Question A");
      expect(ballot.candidates).to.deep.equal(["Candidate A", "Candidate B", "Candidate C"]);
      expect(ballot.phase).to.equal(0);
    });

    it("is not opened by a later division entering Voting", async function () {
      await openVoting(divisionB);
      await expect(webVoting.connect(voter1).vote(0)).to.be.revertedWithCustomError(
        webVoting,
        "WebVoting__NotVotingPhase",
      );
    });

    it("follows the registry when its divisions are replaced", async function () {
      await registry.clearDivisions();
      await registry.addDivision("Division B", await divisionB.getAddress(), ethers.ZeroAddress);
      await openVoting(divisionB);

      await webVoting.connect(voter1).vote(2);
      const ballot = await webVoting.getBallot(voter1.address);
      expect(ballot.votingContract).to.equal(await divisionB.getAddress());
      expect(ballot.webVoteCounts).to.deep.equal([0n, 0n, 1n]);
    });

    it("reverts when the registry has no divisions", async function () {
      await registry.clearDivisions();
      await expect(webVoting.getBallot(voter1.address)).to.be.revertedWithCustomError(
        webVoting,
        "WebVoting__NoActiveDivision",
      );
      await expect(webVoting.connect(voter1).vote(0)).to.be.revertedWithCustomError(
        webVoting,
        "WebVoting__NoActiveDivision",
      );
    });

    it("starts a fresh tally after the admin resets the election", async function () {
      await openVoting(divisionA);
      await webVoting.connect(voter1).vote(0);

      await divisionA.resetElection();
      await divisionA.setCandidates(["X", "Y"]);
      await openVoting(divisionA);

      const ballot = await webVoting.getBallot(voter1.address);
      expect(ballot.electionId).to.equal(1n);
      expect(ballot.webVoteCounts).to.deep.equal([0n, 0n]);
      expect(ballot.hasVoted).to.equal(false);
      await webVoting.connect(voter1).vote(1);
    });
  });
});
