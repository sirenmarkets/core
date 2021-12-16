import "@nomiclabs/hardhat-truffle5"
import "@nomiclabs/hardhat-ethers"
import "@typechain/hardhat"
import "solidity-coverage"
import "hardhat-log-remover"
import "uniswap-v3-deploy-plugin"
import "hardhat-contract-sizer"
import "@nomiclabs/hardhat-etherscan"
import "hardhat-storage-layout"

import { HardhatUserConfig } from "hardhat/types"

import { load } from "ts-dotenv"

// Ask a Siren dev for the correct .env file
const env = load({
  DEPLOY_PRIVATE_KEY: {
    type: String,
    optional: true, // only optional because it we don't need it when deploying to a local hardhat instance
    default: "0xdeadbeef",
  },
  INFURA_API_KEY: {
    type: String,
    optional: true, // only optional when running against the local hardhat network, otherwise it's required
  },
  ETHERSCAN_API_KEY: {
    type: String,
    optional: true,
  },
})

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.7.3",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.6.2",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.5.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      mining: {
        auto: true,
        interval: 0,
      },
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${env.INFURA_API_KEY}`,
      accounts: [env.DEPLOY_PRIVATE_KEY],
      chainId: 4,
      gasPrice: "auto",
    },
    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      chainId: 80001,
      accounts: [env.DEPLOY_PRIVATE_KEY],
      gasPrice: "auto",
    },
    matic: {
      url: "https://rpc-mainnet.maticvigil.com",
      chainId: 137,
      accounts: [env.DEPLOY_PRIVATE_KEY],
      gasPrice: "auto",
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: env.ETHERSCAN_API_KEY,
  },
  typechain: {
    target: "truffle-v5",
  },
}

export default config
