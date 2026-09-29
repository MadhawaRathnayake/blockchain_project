import {
  DEFAULT_SERVER_CHAIN_ID,
  DEFAULT_SERVER_RPC_URL,
  parseChainId,
  resolveFaucetChainIds,
  resolveServerChainConfig,
} from "./serverChain";
import { describe, expect, it } from "vitest";

describe("resolveServerChainConfig", () => {
  it("defaults to Hardhat, so a checkout with no .env.local works", () => {
    expect(resolveServerChainConfig()).toEqual({
      chainId: DEFAULT_SERVER_CHAIN_ID,
      rpcUrl: DEFAULT_SERVER_RPC_URL,
    });
    expect(DEFAULT_SERVER_CHAIN_ID).toBe(31337);
    expect(DEFAULT_SERVER_RPC_URL).toBe("http://127.0.0.1:8545");
  });

  it("honours an explicit chain id and RPC URL", () => {
    expect(resolveServerChainConfig({ chainId: "4242", publicRpcUrl: "http://elsewhere:1234" })).toEqual({
      chainId: 4242,
      rpcUrl: "http://elsewhere:1234",
    });
  });

  it("prefers the server-only RPC_URL over the public one", () => {
    expect(
      resolveServerChainConfig({ rpcUrl: "http://hardhat:8545", publicRpcUrl: "http://127.0.0.1:8545" }).rpcUrl,
    ).toBe("http://hardhat:8545");
  });

  it("falls through a blank RPC_URL to the public one", () => {
    expect(resolveServerChainConfig({ rpcUrl: "  ", publicRpcUrl: "http://other:8545" }).rpcUrl).toBe(
      "http://other:8545",
    );
  });

  it("falls back rather than yielding a NaN chain id", () => {
    expect(resolveServerChainConfig({ chainId: "not-a-number" }).chainId).toBe(DEFAULT_SERVER_CHAIN_ID);
  });
});

describe("parseChainId", () => {
  it.each([undefined, "", "  ", "abc", "0", "-1", "1.5"])("falls back for %p", raw => {
    expect(parseChainId(raw, 7)).toBe(7);
  });

  it("parses a positive integer, tolerating whitespace", () => {
    expect(parseChainId(" 31337 ", 7)).toBe(31337);
  });
});

describe("resolveFaucetChainIds", () => {
  it("defaults to the local Hardhat chain", () => {
    expect([...resolveFaucetChainIds(undefined)]).toEqual([31337]);
  });

  it("treats a blank value as unset", () => {
    expect([...resolveFaucetChainIds("   ")]).toEqual([31337]);
  });

  it("parses an explicit list, tolerating whitespace", () => {
    expect([...resolveFaucetChainIds(" 31337 , 1337 ")].sort((a, b) => a - b)).toEqual([1337, 31337]);
  });

  it("drops malformed entries instead of admitting NaN", () => {
    const ids = resolveFaucetChainIds("31337,,abc,-5,0");
    expect([...ids]).toEqual([31337]);
  });

  it("yields an empty allowlist for wholly invalid input, disabling the faucet", () => {
    // Fail closed: a typo must not accidentally enable funding on a live chain.
    expect(resolveFaucetChainIds("mainnet").size).toBe(0);
  });
});
