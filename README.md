# Bounty Desk Groups Demo

Standalone GitHub Pages-ready demo for a Dash Platform bug bounty use case:

- reporters buy submission stake tokens;
- creating a bounty claim document includes `tokenPaymentInfo`;
- a 2-of-3 equal-weight review group can freeze a claim stake;
- the same group can destroy frozen stake when a claim is AI slop;
- group membership changes are tested against the network.

The browser app is intentionally static. It runs fully in the browser and keeps
state in `localStorage`, while showing the SDK call shape each simulated action
maps to.

The repository also includes a signed local testnet harness in
`scripts/network/`. Its public results are committed to
[`data/testnet-state.json`](./data/testnet-state.json) and rendered on the
GitHub Pages app. Mnemonics and private keys stay in `.secrets/` and are never
committed.

## Current testnet result

The latest public testnet run proves:

- owner set the BNTY direct-purchase price;
- reporter bought BNTY tokens;
- reporter created a `bountyClaim` document with `tokenPaymentInfo`;
- two out of three group members froze the reporter's remaining token balance;
- two out of three group members destroyed the frozen slop stake.

The mutable membership part uncovered a protocol/SDK limitation: changing the
group member set through a data-contract update was rejected with
`change group at position 0 is not allowed`. This is recorded in
`data/testnet-state.json` as the live result rather than treated as passing.

Public testnet IDs:

- contract: `GArmHoHXNPhoVXr8yGw7VxXTGwqX5ncy3vMoRdAiJkWg`
- token: `GWX4MJbZyaDLcxuZKcmaFoFh7oe9GrP68J64VwsSYdNF`
- owner: `6qaU3Y3DtzzBUXuYdUmP7mWHuoo3vGFQDbTDFmTPyEmL`
- reporter: `AGdZNnKrSjTsXoWjbrXJ5aNQ1bcdxgU88o8S62aWNwB5`
- reviewers: `5ed69SyYm1Vnked2vge1HbSJjDXXhaFqod82s2epWGwG`, `HyQfQ8mgjpX8wZiDM69gx2JCdPdot1iVhRYuBVmmsA9P`, `8Arz5PLGQwEDFpmuxEhHdghXRy7GuKVyReubpGyC8qQB`

## Run locally

```sh
npm test
npm run serve
```

Then open:

```text
http://localhost:4173
```

## GitHub Pages

Publish the repository root as a static Pages site. No build step is required.

## Reference SDK shapes

The simulator mirrors the public SDK surfaces used by the existing reference apps:

- token-paid document creation: `sdk.documents.create({ document, identityKey, signer, tokenPaymentInfo })`
- token purchase: `sdk.tokens.directPurchase(options)`
- freeze: `sdk.tokens.freeze(options)`
- destroy frozen funds: `sdk.tokens.destroyFrozen(options)`
- group reads: `sdk.group.members(query)`, `sdk.group.actions(query)`, `sdk.group.actionSigners(query)`

Actual signing/broadcasting happens through the local network scripts because a
GitHub Pages page should not hold wallet seed material.

See [`TESTING.md`](./TESTING.md) for the current simulator and live testnet
coverage.
