import "dotenv/config";
import { task } from "hardhat/config";
import { HardhatUserConfig } from "hardhat/types";

import auctionHouseDeployment from "@floatprotocol/float-contracts/deployments/mainnet/AuctionHouse.json";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";

task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("last", "Grabs the last auction", async (args, hre) => {
  const [owner] = await hre.ethers.getSigners();
  const auctionHouse = new hre.ethers.Contract(auctionHouseDeployment.address, auctionHouseDeployment.abi, owner);

  console.log(`Last Auction started @ ${await auctionHouse.lastAuctionBlock()}`);

  console.log(await auctionHouse.latestAuction());
});

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.ETHEREUM_RPC_URL as string,
        blockNumber: Number(process.env.START_BLOCK),
      }
    },
    mainnet: {
      url: process.env.ETHEREUM_RPC_URL,
      accounts: [process.env.PRIVATE_KEY ?? ""],
    },
  },
  paths: {
    sources: "./contracts",
  },
};

export default config;