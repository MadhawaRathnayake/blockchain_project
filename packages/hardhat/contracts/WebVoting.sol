// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IRegistryDivisions {
    struct Division {
        string name;
        address votingContract;
        address gnOfficer;
        bool active;
    }

    function getAllDivisions() external view returns (Division[] memory);
}

interface IVotingBallot {
    function getVotingData() external view returns (
        string memory question,
        address contractOwner,
        uint8 phase,
        uint256 registrationEndTime,
        uint256 votingEndTime,
        uint256 size,
        uint256 depth,
        uint256 root,
        uint256 candidateCount
    );

    function getCandidates() external view returns (string[] memory);

    function getCurrentElectionId() external view returns (uint256);
}

/**
 * @title WebVoting
 * @notice A simple, wallet-based voting channel for the web app.
 *
 *         Any connected account may vote once per election while the election
 *         is in its Voting phase. There is no GN enrolment and no ZK proof, so a
 *         web vote is **not anonymous** — the voter's address is in the event.
 *
 *         Divisions are ignored: the ballot (question, candidates, phase and
 *         election id) is read from the first active division in the
 *         ElectionRegistry. The election itself is still run entirely by the
 *         admin through that division's Voting contract.
 *
 *         This contract only reads from Voting and ElectionRegistry and keeps
 *         its own tally, so the ZK voting flow and its results are untouched.
 *         State is keyed by (voting contract, election id): an admin
 *         `resetElection()`, or a different first division, starts a fresh web
 *         tally with no action needed here.
 */
contract WebVoting {
    error WebVoting__NoActiveDivision();
    error WebVoting__NotVotingPhase(uint8 phase);
    error WebVoting__InvalidCandidate(uint256 candidate);
    error WebVoting__AlreadyVoted(address voter);

    event WebVoteCast(
        address indexed votingContract,
        uint256 indexed electionId,
        address indexed voter,
        uint256 candidate
    );

    /// @dev `Voting.Phase.Voting`.
    uint8 private constant PHASE_VOTING = 2;

    IRegistryDivisions public immutable i_registry;

    mapping(address => mapping(uint256 => mapping(address => bool))) private s_hasVoted;
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) private s_tally;

    constructor(address registry) {
        i_registry = IRegistryDivisions(registry);
    }

    /// @notice Cast a vote for `candidate` (an index into the ballot's candidates).
    function vote(uint256 candidate) external {
        (address target, ) = _activeDivision();
        IVotingBallot ballot = IVotingBallot(target);

        (, , uint8 phase, , , , , , uint256 candidateCount) = ballot.getVotingData();
        if (phase != PHASE_VOTING) revert WebVoting__NotVotingPhase(phase);
        if (candidate >= candidateCount) revert WebVoting__InvalidCandidate(candidate);

        uint256 electionId = ballot.getCurrentElectionId();
        if (s_hasVoted[target][electionId][msg.sender]) revert WebVoting__AlreadyVoted(msg.sender);

        s_hasVoted[target][electionId][msg.sender] = true;
        s_tally[target][electionId][candidate]++;
        emit WebVoteCast(target, electionId, msg.sender, candidate);
    }

    /// @notice Everything the web voting page needs, in one call.
    /// @dev Reverts with WebVoting__NoActiveDivision when the registry is empty.
    function getBallot(address voter)
        external
        view
        returns (
            address votingContract,
            string memory divisionName,
            string memory question,
            string[] memory candidates,
            uint8 phase,
            uint256 votingEndTime,
            uint256 electionId,
            uint256[] memory webVoteCounts,
            bool hasVoted
        )
    {
        (votingContract, divisionName) = _activeDivision();
        IVotingBallot ballot = IVotingBallot(votingContract);

        (question, , phase, , votingEndTime, , , , ) = ballot.getVotingData();
        candidates = ballot.getCandidates();
        electionId = ballot.getCurrentElectionId();

        webVoteCounts = new uint256[](candidates.length);
        for (uint256 i = 0; i < candidates.length; i++) {
            webVoteCounts[i] = s_tally[votingContract][electionId][i];
        }
        hasVoted = s_hasVoted[votingContract][electionId][voter];
    }

    /// @dev The first active division in the registry.
    function _activeDivision() internal view returns (address votingContract, string memory name) {
        IRegistryDivisions.Division[] memory divisions = i_registry.getAllDivisions();
        for (uint256 i = 0; i < divisions.length; i++) {
            if (divisions[i].active) return (divisions[i].votingContract, divisions[i].name);
        }
        revert WebVoting__NoActiveDivision();
    }
}
