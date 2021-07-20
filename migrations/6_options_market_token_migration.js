const OptionsMarketToken = artifacts.require("OptionsMarketToken")

module.exports = async function (deployer, network, accounts) {
  deployer.then(async () => {
    // Deploy the governance token and give all tokens to account 0
    const token = await deployer.deploy(OptionsMarketToken, accounts[0])

    console.log("completed governance migration")
  })
}