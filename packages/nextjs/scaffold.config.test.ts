import scaffoldConfig from "./scaffold.config";
import { hardhat } from "viem/chains";
import { describe, expect, it } from "vitest";

describe("scaffold.config target network", () => {
  it("targets only the local Hardhat chain", () => {
    expect(scaffoldConfig.targetNetworks).toHaveLength(1);
    expect(scaffoldConfig.targetNetworks[0].id).toBe(hardhat.id);
  });
});
