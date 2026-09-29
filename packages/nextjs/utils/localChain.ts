import { hardhat } from "viem/chains";

/**
 * True for the local Hardhat node.
 *
 * Used to show the burner wallet, skip polling, and link to the built-in block
 * explorer instead of Etherscan.
 */
export const isLocalChainId = (chainId: number): boolean => chainId === hardhat.id;
