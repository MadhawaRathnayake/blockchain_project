"use client";

import { useEffect, useState } from "react";
import { NextPage } from "next";
import { zeroAddress } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { PHASE_LABELS } from "~~/utils/electionPhase";

/**
 * /vote — MetaMask web voting.
 *
 * A demo channel alongside the mobile app: any connected account may vote once
 * per election while it is in its Voting phase, with no GN enrolment and no ZK
 * proof. Divisions are ignored — `WebVoting` reads the ballot from the first
 * division in the registry and keeps its own tally, separate from the ZK
 * results shown on /results.
 */

const PHASE_VOTING = 2;

const formatRemaining = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
};

const Message = ({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) => (
  <div className="flex flex-col items-center justify-center grow p-6 lg:p-8">
    <div className="text-center max-w-md">
      <div className="text-5xl mb-4">{icon}</div>
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      {subtitle && <p className="opacity-60">{subtitle}</p>}
    </div>
  </div>
);

const WebVotePage: NextPage = () => {
  const { address, isConnected } = useAccount();
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const {
    data: ballot,
    isLoading,
    isError,
    refetch,
  } = useScaffoldReadContract({
    contractName: "WebVoting",
    functionName: "getBallot",
    args: [address ?? zeroAddress],
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "WebVoting" });

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isConnected) {
    return (
      <Message icon="🦊" title="Connect your wallet" subtitle="Connect your MetaMask wallet to vote in the election." />
    );
  }
  if (isLoading) {
    return <Message icon="⏳" title="Loading the ballot" subtitle="Reading the election from the chain…" />;
  }
  if (isError || !ballot) {
    return (
      <Message
        icon="🗳️"
        title="No election available"
        subtitle="No division is registered yet, or the contracts are not deployed. Ask the Election Authority to set one up."
      />
    );
  }

  const [, divisionName, question, candidates, phase, votingEndTime, , webVoteCounts, hasVoted] = ballot;
  const counts = webVoteCounts.map(Number);
  const totalVotes = counts.reduce((sum, n) => sum + n, 0);
  const remaining = Math.max(0, Number(votingEndTime) - now);
  const isVoting = phase === PHASE_VOTING && remaining > 0;

  const handleVote = async () => {
    if (selected === null) return;
    try {
      await writeContractAsync({ functionName: "vote", args: [BigInt(selected)] });
      setSelected(null);
    } catch {
      // useTransactor has already shown the decoded revert reason.
    } finally {
      refetch();
    }
  };

  return (
    <div className="grow w-full p-6 lg:p-8">
      <div className="w-full max-w-3xl mx-auto space-y-5">
        <div className="dash-card p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">{question || "Election"}</h1>
              <p className="text-xs opacity-50 mt-1">Ballot from the {divisionName} division</p>
            </div>
            <span className={`badge ${isVoting ? "badge-success" : "badge-ghost"}`}>
              {isVoting ? "Voting open" : (PHASE_LABELS[phase] ?? "Unknown")}
            </span>
          </div>

          {isVoting && (
            <p className="text-sm opacity-70 mt-3">
              Voting closes in <span className="font-mono font-semibold">{formatRemaining(remaining)}</span>
            </p>
          )}

          <div className="mt-6">
            {hasVoted ? (
              <div className="alert alert-success">
                <span>✅ Your vote has been recorded for this election.</span>
              </div>
            ) : !isVoting ? (
              <div className="alert">
                <span>
                  {phase < PHASE_VOTING
                    ? "Voting has not started yet. This page opens the ballot as soon as the Election Authority starts voting."
                    : "Voting has ended for this election."}
                </span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {candidates.map((candidate, index) => (
                    <label
                      key={index}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        selected === index ? "border-primary bg-primary/10" : "border-base-300 hover:bg-base-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="candidate"
                        className="radio radio-primary radio-sm"
                        checked={selected === index}
                        onChange={() => setSelected(index)}
                      />
                      <span className="font-medium">{candidate}</span>
                    </label>
                  ))}
                </div>
                <button
                  className="btn btn-primary w-full mt-4"
                  disabled={selected === null || isMining}
                  onClick={handleVote}
                >
                  {isMining ? "Submitting vote…" : "Cast vote"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="dash-card p-6">
          <h2 className="font-bold">Web vote tally</h2>
          <p className="text-xs opacity-50 mt-1">
            {totalVotes} vote{totalVotes === 1 ? "" : "s"} cast from this page
          </p>
          <div className="space-y-3 mt-4">
            {candidates.map((candidate, index) => {
              const pct = totalVotes > 0 ? Math.round((counts[index] / totalVotes) * 100) : 0;
              return (
                <div key={index}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{candidate}</span>
                    <span className="font-mono">
                      {counts[index]} ({pct}%)
                    </span>
                  </div>
                  <progress className="progress progress-primary w-full" value={pct} max={100} />
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs opacity-50 px-1">
          Web voting is a demonstration channel: your wallet address is recorded with your vote, so it is not anonymous,
          and these votes are counted separately from the zero-knowledge ballots cast in the mobile app (shown on
          Results).
        </p>
      </div>
    </div>
  );
};

export default WebVotePage;
