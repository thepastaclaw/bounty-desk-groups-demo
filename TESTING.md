# Testing Matrix

This repository validates both the browser simulator model and a signed Dash
Platform testnet harness. The static GitHub Pages app renders public results
from the latest harness run.

## Covered Now

- `npm test` exercises the pure governance/token model.
- Static serving checks can load `index.html`, `src/app.mjs`, and the SVG asset.
- The app records SDK-shaped calls for:
  - `sdk.tokens.directPurchase`
  - `sdk.documents.create` with `tokenPaymentInfo`
  - `sdk.tokens.freeze`
  - `sdk.tokens.destroyFrozen`
  - group action proposal/sign/execute envelopes
- `npm run network:e2e` has completed on Dash Platform testnet with the public
  contract/token/identity IDs in `data/testnet-state.json`.

## Live Testnet Coverage

Passed on testnet:

1. registered and funded owner, reporter, and reviewer identities;
2. deployed a `bountyClaim` contract with a BNTY token and 2-of-3 group;
3. set direct-purchase token pricing as contract owner;
4. purchased BNTY tokens as reporter;
5. created a `bountyClaim` document with `tokenPaymentInfo`;
6. froze reporter BNTY with reviewer A proposing and reviewer B signing;
7. destroyed frozen reporter BNTY with reviewer A proposing and reviewer B
   signing.

Failed / not supported by the tested path:

- replacing reviewer C with reviewer D by updating `dataContract.groups` was
  rejected by Platform with `change group at position 0 is not allowed`.
- That means the mutable-membership requirement is not proven yet. It likely
  needs a different protocol path, SDK surface, or a Platform change.

## Still Required Before Calling It Fully Live-Working

1. Find or add the correct network path for mutable group membership.
2. Add negative live tests:
   - create claim without stake rejected;
   - one group signer leaves freeze/destroy pending;
   - destroy before freeze rejected;
   - removed member cannot sign after a successful membership replacement.
3. Record state-transition hashes once the SDK exposes them cleanly from these
   helper calls.
4. Keep signing in local scripts or a real wallet integration; do not put
   mnemonic/private-key material into the GitHub Pages app.

## Current Status

The token-payment and 2-of-3 token-control parts are live-tested on testnet.
Mutable group membership is currently a real failing requirement.
