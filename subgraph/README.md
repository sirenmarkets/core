# Subgraph

## Development

## Testing locally

If you want to test `app`'s subgraphs on a local Ganache blockchain, follow these steps

Go to https://thegraph.com/docs/quick-start#local-development and follow the instructions

- Instead of step 1, run `npm run deploy-local` in the project root directory. Make
  note of the address the MarketsRegistry got deployed to by grepping for
  "Market registry is up and running at address" and add it in `subgraph/config/local.json`
- Skip step 3, the part about running `graph init` since we already have our subgraph
- Instead of step 4, run `npm run deploy-local` in the `subgraph/` subdirectory.
- Skip the part in step 5 where you run the `sed` command, we handled that up in the first bullet

Some notes on the previous steps:

- You may get an error where the postgres docker instance complains about different net_versions. If you see that you need to `rm` the files in `graph-node/docker/data/postgres`, which is where docker stores the graph-node's postgres storage data
- If you're running linux, remember to run `.setup` before running `docker-compose up`, this host changes every time you bring Ganache up or down so run `git checkout && ./setup.sh` every time you shutdown Ganache

Look at the graph-node output for any errors. You can query your newly indexed graph-node by using the GraphiQL web UI at http://localhost:8000/

### Updating the subgraph API

Whenever a developer changes a Solidity file in root folder and adds a new event or
derived data they want to make available to the webapp, they must update the bindings in
`subgraph` and deploy the new `subgraph.yaml` to the appropriate network (e.g. `kovan`
or `mainnet`). Follow these steps to update the subgraph API:

1. Update fields or functions in some \*.sol file
2. Compile the contracts: in root folder run `npm run compile`
3. Build the contract bindings: in root folder run `npm run build`
4. Deploy the contracts: in root folder run `npm run deploy-NETWORK`.
5. Note down the deployed MarketRegistry address from the logs in step 4 (they will say "Market registry is up and running at address "markets-registry-address") and update `subgraph/config/<NETWORK>.json`
6. Update corresponding types in `subgraph/schema.graphql`
7. Update the [generated type bindings](generated/) for the mappings: inside `subgraph` run `npm run codegen`
8. Update any mappings that need to change in `subgraph/src/mappings/`
9. Make sure your mappings compile: inside `subgraph` run `npm run build`
10. Authenticate with thegraph.com: run `npm run graph-auth <access-token>`. The access token can be found at https://thegraph.com/explorer/dashboard?account=sirenmarkets
11. Deploy subgraph: inside `subgraph` run `npm run deploy-<NETWORK>`
12. Update client side schema: inside `webapp` run `npm run get-graph-schema`
13. Update query request and response types: inside `webapp` run `npm run generate-graph-types`
14. Update G-QL queries where required.
