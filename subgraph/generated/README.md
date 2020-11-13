# Subgraph Type Bindings For Your Mappings

## Directory Structure

### templates/

The `templates/` directory contains classes derived from the ABI files in the `build`
directory. Use these classes to get type-safe access to fields on Solidity contracts and their events

### templates.ts

The templates.ts file contains the template contracts specified in the `name` field of the [subgraph.template.yaml](../subgraph.template.yaml)'s
`templates` section. These classes are only used dynamically select which onchain contracts we want to index
(i.e. contracts like Market which are being created by the MarketsRegistry at runtime). We do with with the
`.create` and `.createWithContext` methods on the template classes.

### schema.ts

The schema.ts file contains classes derived from the types in [schema.graphql](../schema.graphql). Use
these classes to instantiate objects you want to save and later load from The Graph's store.

### All Other Top Level Files

These files contain classes derived from the `name` field in the `dataSources` section of the
[subgraph.template.yaml](../subgraph.template.yaml) file. Uses these files just as you would the
[templates classes](#templatests)
