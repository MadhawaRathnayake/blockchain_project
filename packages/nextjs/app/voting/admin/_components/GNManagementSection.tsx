"use client";

import { useEffect, useState } from "react";
import { AddressInput } from "@scaffold-ui/components";
import { Section } from "~~/app/voting/admin/_components/Section";
import { SET_GN_OFFICER_ABI } from "~~/app/voting/admin/_components/adminContracts";
import { useDivisions } from "~~/hooks/useDivisions";
import { useElectionWriter } from "~~/hooks/useElectionWriter";
import { notification } from "~~/utils/scaffold-eth";

/**
 * Assign the on-chain GN officer for a division.
 *
 * Owns its own division selection deliberately: this is a staffing table, and
 * the officer you are appointing is often not the division you are running an
 * election in.
 */
export const GNManagementSection = () => {
  const [gnAddress, setGnAddress] = useState("");
  const [selectedDivision, setSelectedDivision] = useState(0);
  const { divisions, isLoading: divisionsLoading, error: divisionsError, refetch, toggleHidden } = useDivisions();
  const { write } = useElectionWriter();

  const unassigned = divisions.filter(division => !division.hidden && division.gnOfficers.length === 0);

  // Keep selection valid as divisions load in.
  useEffect(() => {
    if (divisions.length > 0 && selectedDivision >= divisions.length) {
      setSelectedDivision(0);
    }
  }, [divisions.length, selectedDivision]);

  const handleAssignGN = async () => {
    if (!gnAddress || !gnAddress.startsWith("0x") || gnAddress.length !== 42) {
      notification.error("Enter a valid Ethereum address.");
      return;
    }
    const div = divisions[selectedDivision];
    if (!div) {
      notification.error("No division selected.");
      return;
    }
    if (div.hidden) {
      notification.error("Cannot assign a GN officer to a hidden division.");
      return;
    }
    try {
      await write({
        address: div.votingContract,
        abi: SET_GN_OFFICER_ABI,
        functionName: "setGNOfficer",
        args: [gnAddress as `0x${string}`, true],
      });

      notification.success(`✅ GN added to ${div.name}!`);
      setGnAddress("");
      refetch();
    } catch (e: any) {
      notification.error(e?.shortMessage || e?.message || "Failed to assign GN");
    }
  };

  const handleRemoveGN = async (address: string) => {
    const div = divisions[selectedDivision];
    if (!div) return;
    try {
      await write({
        address: div.votingContract,
        abi: SET_GN_OFFICER_ABI,
        functionName: "setGNOfficer",
        args: [address as `0x${string}`, false],
      });
      notification.success(`Removed GN officer from ${div.name}.`);
      refetch();
    } catch (e: any) {
      notification.error(e?.shortMessage || e?.message || "Failed to remove GN officer");
    }
  };

  const selected = divisions[selectedDivision];

  return (
    <Section title="GN Officer Management" hint="Assign GN officers to specific polling divisions.">
      {divisionsError && (
        <div className="alert alert-error mb-4 text-sm">
          <span>⚠️ {divisionsError}</span>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="alert alert-info flex-col items-start gap-1 text-sm mb-4">
          <span className="font-bold">
            {unassigned.length} division{unassigned.length === 1 ? "" : "s"} lack{unassigned.length === 1 ? "s" : ""} an
            assigned officer.
          </span>
          <p className="text-xs opacity-80">
            {unassigned.map(division => division.name).join(", ")} {unassigned.length === 1 ? "has" : "have"} no GN
            officer assigned, so nobody can enrol voters for {unassigned.length === 1 ? "it" : "them"}. Assign an
            officer to enable voter enrolment.
          </p>
        </div>
      )}
      {divisionsLoading && divisions.length === 0 ? (
        <div className="flex items-center gap-2 py-6 opacity-60">
          <span className="loading loading-spinner loading-sm"></span>
          <span>Loading divisions from the ElectionRegistry…</span>
        </div>
      ) : divisions.length === 0 ? (
        <div className="text-sm opacity-60 py-4">No divisions registered yet. Deploy divisions first.</div>
      ) : (
        <>
          {/* Division Selector */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text text-sm font-bold">Select Division</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={selectedDivision}
              onChange={e => setSelectedDivision(Number(e.target.value))}
            >
              {divisions.map((div, idx) => (
                <option key={div.votingContract} value={idx} disabled={div.hidden}>
                  {div.hidden ? "[HIDDEN] " : ""}
                  {div.name}
                </option>
              ))}
            </select>
          </div>

          {/* Current GN officer(s) for selected division */}
          <div className="p-3 bg-base-200/50 rounded-lg mb-4">
            <div className="text-xs opacity-60 mb-1">
              Current GN officer{selected && selected.gnOfficers.length !== 1 ? "s" : ""} for{" "}
              <strong>{selected?.name}</strong>
            </div>
            {selected && selected.gnOfficers.length > 0 ? (
              <div className="space-y-1">
                {selected.gnOfficers.map(gn => (
                  <div key={gn} className="font-mono text-sm flex items-center gap-2">
                    <span className="text-success">{gn}</span>
                    <button className="btn btn-ghost btn-xs text-error" onClick={() => handleRemoveGN(gn)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <span className="opacity-40 text-sm">None assigned</span>
            )}
          </div>

          {/* All divisions overview */}
          <div className="overflow-x-auto mb-4">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Division</th>
                  <th>GN Officer</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((div, idx) => {
                  const officers = div.gnOfficers;
                  return (
                    <tr
                      key={div.votingContract}
                      className={`${selectedDivision === idx ? "bg-primary/10" : ""} ${div.hidden ? "opacity-40 grayscale" : ""}`}
                    >
                      <td className="font-bold">
                        {div.name}{" "}
                        {div.hidden && <span className="text-xs font-normal text-base-content/60 ml-1">(Hidden)</span>}
                      </td>
                      <td className="font-mono text-xs">
                        {officers.length === 0
                          ? "—"
                          : officers.map(gn => (
                              <div key={gn}>
                                {gn.slice(0, 10)}...{gn.slice(-4)}
                              </div>
                            ))}
                      </td>
                      <td>
                        {officers.length === 0 ? (
                          <span className="badge badge-ghost badge-xs">Empty</span>
                        ) : (
                          <span className="badge badge-success badge-xs">{officers.length} assigned</span>
                        )}
                      </td>
                      <td>
                        <button
                          className={`btn btn-xs ${div.hidden ? "btn-outline" : "btn-ghost text-error"}`}
                          onClick={() => toggleHidden?.(div.id)}
                        >
                          {div.hidden ? "Show" : "Hide"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Assign new GN */}
          <div className="space-y-3">
            <div className="form-control">
              <label className="label">
                <span className="label-text text-sm">New GN Address for {selected?.name}</span>
              </label>
              <AddressInput value={gnAddress} onChange={setGnAddress} placeholder="0x..." />
            </div>

            <div className="flex gap-2 justify-end">
              <button className="btn btn-primary btn-sm" disabled={!gnAddress} onClick={handleAssignGN}>
                Assign GN to {selected?.name}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Test accounts */}
      <div className="text-xs opacity-40 mt-3">
        <details>
          <summary className="cursor-pointer">Test GN accounts (Hardhat)</summary>
          <div className="mt-2 space-y-1 font-mono text-xs">
            <div>GN Kaduwela (#1): 0x70997970C51812dc3A010C7d01b50e0d17dc79C8</div>
            <div>GN Colombo (#2): 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC</div>
            <div>GN Gampaha (#3): 0x90F79bf6EB2c4f870365E785982E1f101E93b906</div>
          </div>
        </details>
      </div>
    </Section>
  );
};
