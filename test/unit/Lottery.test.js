const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lotter", function () {
      let lottery, vrfCoordinatorV2Mock;
      let deployer, lotteryEnranceFee, interval;
      const chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        lottery = await ethers.getContract("Lottery", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        lotteryEnranceFee = await lottery.getEntranceFee();
        interval = await lottery.getInterval();
      });

      describe("constructor", function () {
        it("Initializes the lottery correctly", async function () {
          const lotteryState = await lottery.getLotteryState();

          assert.equal(lotteryState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });
      describe("enterLottery", function () {
        it("reverts when you dont pay enough", async function () {
          await expect(lottery.enterLottery()).to.be.revertedWith(
            "Lottery_NotEnoughtETHEntered"
          );
        });
        it("records players when they enter", async function () {
          await lottery.enterLottery({ value: lotteryEnranceFee });
          const playerFromContract = await lottery.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });
        it("emits event on enter", async function () {
          await expect(
            lottery.enterLottery({ value: lotteryEnranceFee })
          ).to.emit(lottery, "LotteryEnter");
        });
        it("doesnt allow entrance when lottery is calculating", async function () {
          await lottery.enterLottery({ value: lotteryEnranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await lottery.performUpkeep([]);
          await expect(
            lottery.enterLottery({ value: lotteryEnranceFee })
          ).to.be.revertedWith("Lottery__NotOpen");
        });
      });
      describe("checkUpKeep", function () {
        it("returns false if people didnt send ETH", async function () {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upKeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(!upKeepNeeded);
        });
        it("returns false if lottery is not open", async function () {
          await lottery.enterLottery({ value: lotteryEnranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await lottery.performUpkeep([]);

          const lotteryState = await lottery.getLotteryState();
          const { upKeepNeeded } = await lottery.callStatic.checkUpkeep([]);

          assert.equal(lotteryState.toString(), "1");
          assert.equal(upKeepNeeded, false);
        });
        it("returns false if enough time hasnt passed", async function () {
          await lottery.enterLottery({ value: lotteryEnranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 10,
          ]);
          await network.provider.send("evm_mine", []);
          const { upKeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert.equal(upKeepNeeded, false);
        });
        it("returns true if enough time has passed, has player, eth, and is open", async function () {
          await lottery.enterLottery({ value: lotteryEnranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);

          const { upKeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(upKeepNeeded);
        });
      });
      describe("performUpKeep", function () {
        it("it can only run when checkUpKeep is true", async function () {
          await lottery.enterLottery({ value: lotteryEnranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);

          const tx = await lottery.performUpkeep([]);
          assert(tx);
        });
        it("reverts when checkUpKeep is false", async function () {
          await expect(lottery.performUpkeep([])).to.be.revertedWith(
            "Lottery_UpKeepNotNeeded"
          );
        });
        it("updates the lottery state, emits an event", async function () {
          await lottery.enterLottery({ value: lotteryEnranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);

          const txResponse = await lottery.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          const requestId = txReceipt.events[1].args.requestId;
          const lotteryState = await lottery.getLotteryState();
          assert(requestId.toNumber() > 0);
          assert.equal(lotteryState.toString(), "1");
        });
      });
      describe("fullFillRandomWords", function () {
        beforeEach(async function () {
          await lottery.enterLottery({ value: lotteryEnranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
        });
        it("it can only be called after performUpKeep", async function () {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
          ).to.be.revertedWith("nonexistent request");
        });
        it("Pick the winner, resets the lottery, and sends the money", async function () {
          const additionalEntrants = 3;
          const startingAccountIndex = 1;
          const accounts = await ethers.getSigners();
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrants;
            i++
          ) {
            const accountConnectLottery = lottery.connect(accounts[i]);
            await accountConnectLottery.enterLottery({
              value: lotteryEnranceFee,
            });
          }
          const startingTimeStamp = await lottery.getLatestTimeStamp();

          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              console.log("Found the event!");
              try {
                const recentWinner = await lottery.getRecentWinner();
                console.log("recentWinner", recentWinner);
                console.log(accounts[0].address);
                console.log(accounts[1].address);
                console.log(accounts[2].address);
                console.log(accounts[3].address);
                console.log(accounts[4].address);
                const winnerEndingBalance = await accounts[1].getBalance();
                const lotteryState = await lottery.getLotteryState();
                const endingTimeStamp = await lottery.getLatestTimeStamp();
                const numPlayers = await lottery.getNumberOfPlayers();
                assert.equal(lotteryState.toString(), "0");
                assert.equal(numPlayers.toString(), "0");
                assert(endingTimeStamp > startingTimeStamp);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(
                    lotteryEnranceFee
                      .mul(additionalEntrants)
                      .add(lotteryEnranceFee)
                      .toString()
                  )
                );
              } catch (e) {
                reject(e);
              }
              resolve();
            });
            const tx = await lottery.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            const winnerStartingBalance = await accounts[1].getBalance();
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              lottery.address
            );
          });
        });
      });
    });
