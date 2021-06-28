import hre from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { UniswappyV2EthPair } from "../src/UniswappyV2EthPair";
import { fetchJson, formatUnits } from "ethers/lib/utils";

import erc20abi from "../src/abi/IERC20.json";
import uniswapV2PairAbi from "../src/abi/UniswappyV2Pair.json";

import auctionHouseDeployment from "@floatprotocol/float-contracts/deployments/mainnet/AuctionHouse.json";

const ETHER = BigNumber.from(10).pow(18);

const TEST_VOLUMES = [
  ETHER.mul(20),
  ETHER.mul(16),
  ETHER.mul(15),
  ETHER.mul(14),
  ETHER.mul(13),
  ETHER.mul(12),
  ETHER.mul(10),
  ETHER.mul(9),
  ETHER.mul(8),
  ETHER.mul(7),
  ETHER.mul(6),
  ETHER.mul(5),
  ETHER.mul(3),
  ETHER.mul(2),
  ETHER.div(1),
  ETHER.div(2),
  ETHER.div(4),
]

const FLOAT = "0xb05097849BCA421A3f51B249BA6CCa4aF4b97cb9";
const BANK = "0x24A6A37576377F63f194Caa5F518a60f45b42921";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const FLOAT_ETH_SLP = "0x481DdaF90C59d91F3e480E6793122E62612CA5A9";
const BANK_ETH_SLP = "0x938625591ADb4e865b882377e2c965F9f9b85E34";

// Replace this with the actual cost of your swapping strategy.
const GAS_LIMIT_FOR_2_WAY_SWAP = 8e5;

async function main() {
  const { ethers, network } = hre;
  const [owner] = await ethers.getSigners();

  const floatEthSLP = new ethers.Contract(FLOAT_ETH_SLP, uniswapV2PairAbi, owner);
  const bankEthSLP = new ethers.Contract(BANK_ETH_SLP, uniswapV2PairAbi, owner);
  const auctionHouse =new ethers.Contract(auctionHouseDeployment.address, auctionHouseDeployment.abi, owner);

  const floatPair = new UniswappyV2EthPair(FLOAT_ETH_SLP, [FLOAT, WETH], "sushiswap");
  const bankPair = new UniswappyV2EthPair(BANK_ETH_SLP, [BANK, WETH], "sushiswap");
  bankPair.setReservesViaOrderedBalances(await bankEthSLP.getReserves());
  floatPair.setReservesViaOrderedBalances(await floatEthSLP.getReserves());

  console.log("From: ", owner.address);

  while((await auctionHouse.step()) > 150 ) {
    if(network.name === "mainnet") {
      console.log("Sleeping, not active...");
      await wait(ethers);
    } else {
      console.log("Starting...");
      await auctionHouse.start();
      await wait(ethers);
    }
  }

  // Remember:
  // 0|1 => Expansion (protocol sells, you buy)
  // 2|3 => Contraction (protocol buys, you sell) 
  const stabCase = (await auctionHouse.latestAuction()).stabilisationCase;
  console.log("At Stage: ", await auctionHouse.stage());
  console.log("Case: ", stabCase, `i.e. ${stabCase <= 1 ? "expansion" : "contraction"}`);

  let step = await auctionHouse.step();
  while (step < 150) {
    const [wethPrice, bankPrice] = await auctionHouse.price();
    const latestAuction = await auctionHouse.latestAuction();
    const allowance = latestAuction.allowance.sub(latestAuction.delta);
    console.log("Step:", step.toNumber());
    console.log(formatUnits(wethPrice, 27), formatUnits(bankPrice, 27));
    console.log("Allowance remaining: ", formatUnits(allowance));

    let profitVol: BigNumber | undefined = undefined;
    let maxProfit: BigNumber = BigNumber.from(0).sub(ETHER.mul(1000));

    const gasCost = await getGasCost();

    for (const vol of TEST_VOLUMES) {
      let localProfit;
      if (stabCase <= 1) {
        // Convert BANK => WETH value to start calculation
        const floatPriceInWeth = wethPrice.add(bankPair.getTokensOut(BANK, WETH, bankPrice));

        const floatIn = divPrice(vol, floatPriceInWeth);

        // Skip if will fail.
        if(floatIn.gt(allowance)) {
          continue;
        }
        const proceedsFromSellingTokens = floatPair.getTokensOut(FLOAT, WETH, floatIn);
  
        localProfit = proceedsFromSellingTokens.sub(vol);
      } else {
        const floatOutFromBuy = floatPair.getTokensOut(WETH, FLOAT, vol);

        // Skip if will fail.
        if(floatOutFromBuy.gt(allowance)) {
          continue;
        }
        const wethOutFromSell = mulPrice(floatOutFromBuy, wethPrice);
        const bankOutFromSell = mulPrice(floatOutFromBuy, bankPrice);
        const proceedsFromSellingTokens = bankPair.getTokensOut(BANK, WETH, bankOutFromSell);
  
        localProfit = proceedsFromSellingTokens.add(wethOutFromSell).sub(vol);
      }
      

      if (localProfit.gt(maxProfit)) {
        maxProfit = localProfit;
        profitVol = vol;
      }
    }

    if(profitVol && maxProfit.gt(gasCost)) {
      console.log("Trying to use", formatUnits(profitVol), "to make", formatUnits(maxProfit));
      console.log("Profit required:", formatUnits(gasCost));
      console.log("Float Buy: ", formatUnits(floatPair.getTokensOut(WETH, FLOAT, profitVol)));
      
      // FOR THE READER:
      // Implement the actual bundle execution here, remember:
      // - Flashbot execution to avoid mempool, or
      // - High gas + onchain check for profit > maxProfit.mul(0.99)
      // ...

      await wait(ethers);

      // FOR THE READER:
      // Wait for your txn here.
      // ---

    } else if (profitVol) {
      console.log("Insufficient profit, best was @", formatUnits(profitVol), "to make", formatUnits(maxProfit));
    }

    await wait(ethers);
    bankPair.setReservesViaOrderedBalances(await bankEthSLP.getReserves());
    floatPair.setReservesViaOrderedBalances(await floatEthSLP.getReserves());
    step = await auctionHouse.step();
  }

  // Check your total profit, depends on implementation, simplest would just check WETH balance leftover.
  const weth = new ethers.Contract(WETH, erc20abi, owner);
  const balanceOf =  await weth.balanceOf(owner.address);
  console.log("Profit?", formatUnits(balanceOf));
}

async function getGasCost(): Promise<BigNumber> {
  return BigNumber.from(10e9).mul(GAS_LIMIT_FOR_2_WAY_SWAP);

  // Use something like this for real:

  // const gasNow = await fetchJson(
  //   "https://www.gasnow.org/api/v3/gas/price?utm_source=FloatDeployer"
  // );
  // const fast = gasNow.data.fast;
  // return BigNumber.from(fast).mul(GAS_LIMIT_FOR_2_WAY_SWAP);
}

function mulPrice(amountOut: BigNumber, price: BigNumber): BigNumber {
  return amountOut.mul(price).div(BigNumber.from(10).pow(27));
}

function divPrice(amountIn: BigNumber, price: BigNumber): BigNumber {
  return amountIn.mul(BigNumber.from(10).pow(27)).div(price);
}

const delay = (s: number) => new Promise(resolve => setTimeout(resolve, s * 1000))

async function wait(ethers: any) {
  const { network } = hre;

  if (network.name === "mainnet") {
    await delay(1);
  } else {
    await ethers.provider.send("evm_mine", []);
    await delay(0.1);
  }
}

main()
.then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
});