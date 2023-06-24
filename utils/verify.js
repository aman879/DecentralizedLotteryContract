const { run } = require("hardhat");

const verify = async (contarctAddress, args) => {
  console.log("verifying contract...");
  try {
    await run("verify:verify", {
      address: contarctAddress,
      constructorArguments: args,
    });
  } catch (e) {
    if (e.message.toLowerCase().includes("already verified")) {
      console.log("Already verified!");
    } else {
      console.log(e);
    }
  }
};

module.exports = { verify };
