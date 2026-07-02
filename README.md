# Bounty Desk Groups Demo

Standalone GitHub Pages-ready demo for a Dash Platform bug bounty use case:

- reporters buy submission stake tokens;
- creating a bounty claim document includes `tokenPaymentInfo`;
- a 2-of-3 equal-weight review group can freeze a claim stake;
- the same group can destroy frozen stake when a claim is AI slop;
- group membership changes are tested against the network.

The browser app is intentionally static but functional on testnet. It can
generate a throwaway testnet mnemonic, show a Bridge funding link, register
identities, deploy the bounty contract, create a token-paid claim, and execute
2-of-3 group-gated token actions directly from the page. The generated mnemonic
is stored only in that browser's `localStorage` so the static page can sign
later steps.

The repository also includes the original signed local testnet harness in
`scripts/network/`. Its public results are committed to
[`data/testnet-state.json`](./data/testnet-state.json) and rendered on the
GitHub Pages app. Mnemonics and private keys stay in `.secrets/` and are never
committed.

## Functional browser flow

1. Click **Generate wallet**.
2. Open the generated Bridge link and fund the testnet address.
3. Click **Register identities**.
4. Click **Deploy contract**.
5. Click **Run bounty flow**.

The page then sends real SDK transitions for direct token purchase,
`documents.create(..., tokenPaymentInfo)`, `tokens.freeze`, and
`tokens.destroyFrozen`. The membership-update button intentionally shows the
current protocol limitation if the data-contract group update is rejected.

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
