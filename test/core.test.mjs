import test from "node:test";
import assert from "node:assert/strict";

import {
  actionPower,
  createInitialState,
  proposeAction,
  purchaseTokens,
  signAction,
  submitClaim,
  TOKEN_PAYMENT_INFO,
} from "../src/core.mjs";

test("document creation requires a purchased stake token and records tokenPaymentInfo", () => {
  assert.throws(
    () => submitClaim(createInitialState(), { title: "Bug", summary: "No stake yet" }),
    /needs one liquid BNTY/,
  );

  const withTokens = purchaseTokens(createInitialState(), 2);
  const next = submitClaim(withTokens, {
    title: "Signature bypass",
    severity: "critical",
    summary: "A fake report used for deterministic testing.",
  });

  assert.equal(next.token.reporterLiquid, 1);
  assert.equal(next.token.staked, 1);
  assert.equal(next.claims[0].documentTypeName, "bountyClaim");
  assert.deepEqual(next.sdkTrace[0].payload.tokenPaymentInfo, TOKEN_PAYMENT_INFO);
});

test("freeze and destroy require 2-of-3 group approval", () => {
  let state = purchaseTokens(createInitialState(), 1);
  state = submitClaim(state, { title: "AI slop", summary: "Looks generated." });
  const claimId = state.claims[0].id;

  state = proposeAction(state, {
    type: "freeze-claim",
    targetId: claimId,
    proposerId: "avery",
  });
  assert.equal(actionPower(state, state.actions[0]), 1);
  assert.equal(state.claims[0].stakeState, "locked");

  state = signAction(state, state.actions[0].id, "blake");
  assert.equal(state.claims[0].stakeState, "frozen");
  assert.equal(state.token.frozen, 1);

  state = proposeAction(state, {
    type: "destroy-slop-stake",
    targetId: claimId,
    proposerId: "casey",
  });
  state = signAction(state, state.actions[0].id, "avery");

  assert.equal(state.claims[0].status, "slop-rejected");
  assert.equal(state.claims[0].stakeState, "destroyed");
  assert.equal(state.token.destroyed, 1);
  assert.equal(state.token.frozen, 0);
});

test("destroying stake before freeze is rejected", () => {
  let state = purchaseTokens(createInitialState(), 1);
  state = submitClaim(state, { title: "Premature destroy", summary: "No freeze." });

  assert.throws(
    () => {
      let next = proposeAction(state, {
        type: "destroy-slop-stake",
        targetId: state.claims[0].id,
        proposerId: "avery",
      });
      next = signAction(next, next.actions[0].id, "blake");
      return next;
    },
    /Destroy requires/,
  );
});

test("membership changes are group-gated and removed members can no longer sign", () => {
  let state = createInitialState();
  state = proposeAction(state, {
    type: "replace-member",
    proposerId: "avery",
    replacement: {
      oldMemberId: "casey",
      newMember: { id: "devon", name: "Devon", weight: 1 },
    },
  });
  assert.equal(state.group.members.some((member) => member.id === "devon"), false);

  state = signAction(state, state.actions[0].id, "blake");
  assert.equal(state.group.members.some((member) => member.id === "devon"), true);
  assert.equal(state.group.members.some((member) => member.id === "casey"), false);

  assert.throws(
    () => proposeAction(state, {
      type: "replace-member",
      proposerId: "casey",
      replacement: {
        oldMemberId: "devon",
        newMember: { id: "casey", name: "Casey", weight: 1 },
      },
    }),
    /Only current group members/,
  );
});
