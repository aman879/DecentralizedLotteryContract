const { ethers } = require("hardhat");

async function enterLottery() {
  const lottery = await ethers.getContract("Lottery");
  const lotteryFee = await lottery.getEntranceFee();
  const tx = await lottery.enterLottery({ value: lotteryFee + 1 });
  await tx.wait(1);
  console.log(tx.hash);
  console.log("Entered");
}

enterRaffle()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
