# Bounty Desk Groups Demo

Standalone GitHub Pages-ready demo for a Dash Platform bug bounty use case:

- reporters buy submission stake tokens;
- creating a bounty claim document includes `tokenPaymentInfo`;
- a 2-of-3 equal-weight review group can freeze a claim stake;
- the same group can destroy frozen stake when a claim is AI slop;
- group membership can be changed by the group.

The app is intentionally static. It runs fully in the browser and keeps state in `localStorage`, while showing the SDK call shape each simulated action maps to. That makes it suitable for GitHub Pages before a funded testnet contract is deployed.

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

Actual group action signing/broadcasting is represented as a governance envelope in this demo because this static site has no wallet, identities, funded testnet contract, or signer backend.
