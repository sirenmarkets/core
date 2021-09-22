# Subgraph

## Development

### Deploying

#### Testnets

Our testnet subgraphs exist under the "pascalclub" organization. Ask a Siren Dev for the API key for pascalclub, and then run

```bash
cd subgraph
npm run graph-auth PASCALCLUB_API_KEY
npm run codegen
npm run build
npm run deploy-<THE_TESTNET_NETWORK_NAME>
```

#### Testing Locally with Real Data

If you want to test the subgraph locally with real data, you can run ganache locally forked from mumbai testnet (polygon)

```
ganache-cli --fork https://polygon-mumbai.infura.io/v3/INFURA_KEY
```

Once this is running you can deploy the subgraph locally. The only other thing you need to do is copy the params from `./config/mumbai` to `./config/local.json` and leave the network as `mainnet`.

Then deploy it as normal with `npm run deploy-local`

The data from the testnet chain will get processed and scan after some time and you should be able to query the subgraph.

#### View Subgraph Indexing Status

To view the progress of your subgraph's deploy, and see any errors that may occur while it's indexing, you can use a GraphQL client (such as [GraphiQL](https://graphql-dotnet.github.io/docs/getting-started/graphiql/)) to query the status of the deploy.

GraphQL Endpoint: https://api.thegraph.com/index-node/graphql

```graphql
{
  indexingStatusForCurrentVersion(
    subgraphName: "pascalclub/protocol-v2-rinkeby"
  ) {
    subgraph
    fatalError {
      message
    }
    nonFatalErrors {
      message
    }
    health
    node
    synced
  }

  indexingStatusForPendingVersion(
    subgraphName: "pascalclub/protocol-v2-rinkeby"
  ) {
    subgraph
    fatalError {
      message
    }
    nonFatalErrors {
      message
    }
    health
    node
    synced
  }
}
```

## Testing locally

If you want to test the subgraphs on a local hardhat node, follow these steps

Go to https://thegraph.com/docs/quick-start#local-development and follow the instructions

- Instead of step 1, run `npm run deploy-local` in the project root directory.
- Skip step 3, the part about running `graph init` since we already have our subgraph source code
- Skip step 4, we already deployed our contracts in step 1
- Skip the part in step 5 where you run the `sed` command, we handled that up in the first bullet
- Skip step 6, we don't need to use their example dApp

Some notes on the previous steps:

- You may get an error where the postgres docker instance complains about different net_versions. If you see that you need to `rm` the files in `graph-node/docker/data/postgres`, which is where docker stores the graph-node's postgres storage data
- If you're running linux, remember to run `.setup` before running `docker-compose up`, this host changes every time you bring Ganache up or down so run `git checkout && ./setup.sh` every time you shutdown Ganache

Look at the graph-node output for any errors. You can query your newly indexed graph-node by using the GraphiQL web UI at http://localhost:8000/

### Updating the subgraph API

Whenever a developer changes a Solidity file in root folder and adds a new event or
derived data they want to make available to via the subgraph, they must update the bindings in
`subgraph` and deploy the new `subgraph.yaml` to the appropriate network (e.g. `rinkeby`
or `mainnet`). Follow these steps to update the subgraph API:

1. Update fields or functions in some \*.sol file
2. Build the contract bindings: in root folder run `npm run compile`
3. Deploy the contracts: in root folder run `npm run deploy-NETWORK`.
4. Update corresponding types in `subgraph/schema.graphql`
5. Update the [generated type bindings](generated/) for the mappings: inside `subgraph/` run `npm run codegen`
6. Update any mappings that need to change in `subgraph/src/mappings/`
7. Make sure your mappings compile: inside `subgraph` run `npm run build`
8. Authenticate with thegraph.com: run `npm run graph-auth <access-token>`. The access token can be found at https://thegraph.com/explorer/dashboard?account=sirenmarkets. Ask a Siren dev for the auth token
9. Deploy subgraph: inside `subgraph` run `npm run deploy-<NETWORK>`

```

```
