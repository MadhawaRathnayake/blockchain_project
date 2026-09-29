import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploy WebVoting — the MetaMask voting channel behind the web app's /vote page.
 *
 * It reads the ballot from the first active division in the ElectionRegistry
 * and keeps its own tally, so it needs nothing but the registry's address.
 */
const deployWebVoting: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const registry = await hre.deployments.get("ElectionRegistry");

  const webVoting = await hre.deployments.deploy("WebVoting", {
    from: deployer,
    args: [registry.address],
    log: true,
    autoMine: true,
  });

  console.log(`🌐 WebVoting at: ${webVoting.address}`);
};

export default deployWebVoting;
deployWebVoting.tags = ["WebVoting"];
deployWebVoting.dependencies = ["Divisions"];
