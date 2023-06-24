const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");
const { assert, expect } = require("chai");
const { ConstructorFragment } = require("ethers/lib/utils");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery", function () {
      let lottery, deployer, lotteryEnranceFee;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        lottery = await ethers.getContract("Lottery", deployer);
        lotteryEnranceFee = await lottery.getEntranceFee();
      });
      describe("fulFillRandomWords", function () {
        it("work with live chainlink keepers and chainlink VRF, we get a random winner", async function () {
          const startingTimeStamp = await lottery.getLatestTimeStamp();
          const accounts = await ethers.getSigners();

          console.log("above Promise");

          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              console.log("winnerPicked event fired");
              try {
                const recentWinner = await lottery.getRecentWinner();
                const lotteryState = await lottery.getLotteryState();
                const winnerEndingBalance = await accounts[0].getBalance();
                const endingTimeStamp = await lottery.getLatestTimeStamp();

                await expect(lottery.getPlayer(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(lotteryState.toString(), "0");
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(lotteryEnranceFee).toString()
                );
                assert(endingTimeStamp > startingTimeStamp);
                console.log("REOLVED");
                resolve();
              } catch (e) {
                console.log("Error");
                reject(e);
              }
            });
            console.log("outside try-catch inside Promise");
            await lottery.enterLottery({ value: lotteryEnranceFee });
            const winnerStartingBalance = await accounts[0].getBalance();
          });
          console.log("Outside Promise");
        });
      });
    });
