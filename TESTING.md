# Testing Matrix

This repository currently validates the demo model and static app shape. It does
not yet prove the flow against a funded Dash Platform testnet contract.

## Covered Now

- `npm test` exercises the pure governance/token model.
- Static serving checks can load `index.html`, `src/app.mjs`, and the SVG asset.
- The app records SDK-shaped calls for:
  - `sdk.tokens.directPurchase`
  - `sdk.documents.create` with `tokenPaymentInfo`
  - `sdk.tokens.freeze`
  - `sdk.tokens.destroyFrozen`
  - group action proposal/sign/execute envelopes

## Required Before Calling It Live-Working

1. Deploy a testnet data contract with:
   - `bountyClaim` document type;
   - token position `0` as the stake token;
   - document creation token cost configured for the claim type;
   - a 3-member equal-weight group at contract position `0`;
   - freeze and destroy-frozen controls assigned to that group.
2. Fund at least four test identities:
   - reporter;
   - group member A;
   - group member B;
   - group member C / replacement member.
3. Replace the simulator adapter with real SDK calls and run:
   - direct token purchase;
   - claim document creation using `tokenPaymentInfo`;
   - negative create without stake;
   - group freeze with one signer rejected / pending;
   - group freeze with two signers executed;
   - destroy frozen stake with two signers executed;
   - destroy before freeze rejected;
   - group member replacement with two signers executed;
   - removed member cannot sign subsequent actions.
4. Run the same flow from a GitHub Pages deployment, not only localhost.
5. Record transaction/state-transition IDs and queried group action/signature
   state for every executed action.

## Current Status

The current app is a deterministic front-end prototype and rule harness. It is
useful for product review and UI/API-shape discussion, but it needs the live
testnet pass above before it should be described as proving Platform groups
work end-to-end for this bounty use case.
