# Chama Arc Testnet subgraph

Indexes the deployed ChamaDirectory and its join-request/invite/status events on Arc Testnet (chain ID 5042002).

The subgraph is an eventually consistent read model. Keep direct contract reads for transaction confirmation and authorization-sensitive state.

## Local commands

```bash
npm install
npm run codegen
npm run build
```

## Deployment

Do not put deployment tokens in source control or chat. Authenticate locally, then run:

```bash
graph auth <STUDIO_DEPLOY_KEY>
graph deploy arc-testnet
```

The frontend should query pending requests with:

```graphql
query PendingJoinRequests($chamaId: BigInt!) {
  joinRequests(where: { chama: $chamaId, processed: false }, orderBy: createdAt, orderDirection: asc) {
    id
    applicant
    createdAt
    codeHash
  }
}
```

The deployed directory address is `0x35e87026e77618fE9411F278f3870554aec6398f`; the indexing start block is `64486284`.
