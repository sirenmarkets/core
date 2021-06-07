require("dotenv").config()

const fs = require("fs")

// Let the mnemonic fail if local development
let mnemonic
try {
  // ask a Siren dev to give you this file
  mnemonic = fs.readFileSync(".secret").toString().trim()
} catch {
  console.log("ERROR: .secret file not found")
}

// if deploying for mainnet, require mnemonic
if (!!process.env.DEPLOY_MAINNET) {
  mnemonic = fs.readFileSync(".secret-mainnet").toString().trim()
}

const HDWalletProvider = require("@truffle/hdwallet-provider")

module.exports = {
  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a development blockchain for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache-cli, geth or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.
    //
    development: {
      host: "127.0.0.1", // Localhost (default: none)
      port: 8545, // Standard Ethereum port (default: none)
      network_id: "*", // Any network (default: none)
    },
    kovan: {
      provider: function () {
        return new HDWalletProvider(
          mnemonic,
          `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
        )
      },
      network_id: 42,
      gas: 6500000, // default = 4712388
      gasPrice: 10000000000, // default = 10 gwei
    },
    rinkeby: {
      provider: function () {
        return new HDWalletProvider(
          mnemonic,
          `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`,
        )
      },
      network_id: 4,
      gas: 6500000, // default = 4712388
      gasPrice: 10000000000, // default = 10 gwei
    },

    mainnet: {
      provider: function () {
        return new HDWalletProvider(
          mnemonic,
          `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
        )
      },
      network_id: 1,
      gas: 8000000,
      gasPrice: 34000000000, // 34 gwei (this should be changed to match current average gas price whenever we use this provide)
      // check https://www.ethgasstation.info/
    },

    bscTestnet: {
      provider: () =>
        new HDWalletProvider(
          mnemonic,
          `https://data-seed-prebsc-1-s1.binance.org:8545`,
        ),
      network_id: 97,
      confirmations: 10,
      timeoutBlocks: 200,
      skipDryRun: true,
    },
    // Another network with more advanced options...
    // advanced: {
    // port: 8777,             // Custom port
    // network_id: 1342,       // Custom network
    // gas: 8500000,           // Gas sent with each transaction (default: ~6700000)
    // gasPrice: 20000000000,  // 20 gwei (in wei) (default: 100 gwei)
    // from: <address>,        // Account to send txs from (default: accounts[0])
    // websockets: true        // Enable EventEmitter interface for web3 (default: false)
    // },
    // Useful for deploying to a public network.
    // NB: It's important to wrap the provider as a function.
    // ropsten: {
    // provider: () => new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/YOUR-PROJECT-ID`),
    // network_id: 3,       // Ropsten's id
    // gas: 5500000,        // Ropsten has a lower block limit than mainnet
    // confirmations: 2,    // # of confs to wait between deployments. (default: 0)
    // timeoutBlocks: 200,  // # of blocks before a deployment times out  (minimum/default: 50)
    // skipDryRun: true     // Skip dry run before migrations? (default: false for public nets )
    // },
    // Useful for private networks
    // private: {
    // provider: () => new HDWalletProvider(mnemonic, `https://network.io`),
    // network_id: 2111,   // This network is yours, in the cloud.
    // production: true    // Treats this network as if it was a public net. (default: false)
    // }
  },

  plugins: ["solidity-coverage"],

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.6.12", // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200,
        },
        // evmVersion: "byzantium"
      },
    },
  },
}
