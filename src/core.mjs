export const TOKEN_PAYMENT_INFO = Object.freeze({
  tokenContractPosition: 0,
  maximumTokenCost: 1,
  gasFeesPaidBy: "documentOwner",
});

const INITIAL_MEMBERS = [
  { id: "avery", name: "Avery", weight: 1 },
  { id: "blake", name: "Blake", weight: 1 },
  { id: "casey", name: "Casey", weight: 1 },
];

export function createInitialState() {
  return {
    nextClaimNumber: 1,
    nextActionNumber: 1,
    token: {
      symbol: "BNTY",
      priceCredits: 1200,
      reporterLiquid: 0,
      staked: 0,
      frozen: 0,
      destroyed: 0,
      returned: 0,
    },
    group: {
      contractPosition: 0,
      threshold: 2,
      members: INITIAL_MEMBERS.map((member) => ({ ...member })),
    },
    claims: [],
    actions: [],
    events: [
      {
        type: "system",
        message: "Bounty Desk initialized with a 2-of-3 review group.",
      },
    ],
    sdkTrace: [],
  };
}

export function cloneState(state) {
  return structuredClone(state);
}

export function memberPower(state, memberId) {
  return state.group.members.find((member) => member.id === memberId)?.weight ?? 0;
}

export function actionPower(state, action) {
  return action.signers.reduce((sum, memberId) => sum + memberPower(state, memberId), 0);
}

export function isActionApproved(state, action) {
  return actionPower(state, action) >= state.group.threshold;
}

export function purchaseTokens(state, amount) {
  const next = cloneState(state);
  const count = Number(amount);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Purchase amount must be a positive whole number.");
  }
  next.token.reporterLiquid += count;
  addEvent(next, "token", `Reporter bought ${count} ${next.token.symbol} token${count === 1 ? "" : "s"}.`);
  addSdkTrace(next, "sdk.tokens.directPurchase", {
    tokenPosition: TOKEN_PAYMENT_INFO.tokenContractPosition,
    amount: count,
    priceCredits: next.token.priceCredits,
    purchaser: "reporterIdentityId",
  });
  return next;
}

export function submitClaim(state, input) {
  const next = cloneState(state);
  const title = clean(input.title);
  const summary = clean(input.summary);
  const severity = clean(input.severity || "medium");
  if (!title) throw new Error("Claim title is required.");
  if (!summary) throw new Error("Claim summary is required.");
  if (next.token.reporterLiquid < TOKEN_PAYMENT_INFO.maximumTokenCost) {
    throw new Error("Reporter needs one liquid BNTY token before submitting.");
  }

  const id = `claim-${String(next.nextClaimNumber).padStart(3, "0")}`;
  next.nextClaimNumber += 1;
  next.token.reporterLiquid -= TOKEN_PAYMENT_INFO.maximumTokenCost;
  next.token.staked += TOKEN_PAYMENT_INFO.maximumTokenCost;
  next.claims.unshift({
    id,
    title,
    summary,
    severity,
    status: "pending-review",
    stake: TOKEN_PAYMENT_INFO.maximumTokenCost,
    stakeState: "locked",
    documentTypeName: "bountyClaim",
    createdAt: new Date().toISOString(),
  });
  addEvent(next, "document", `Created ${id}; 1 ${next.token.symbol} moved into claim stake.`);
  addSdkTrace(next, "sdk.documents.create", {
    document: {
      documentTypeName: "bountyClaim",
      properties: { title, summary, severity },
      ownerId: "reporterIdentityId",
    },
    tokenPaymentInfo: TOKEN_PAYMENT_INFO,
  });
  return next;
}

export function proposeAction(state, action) {
  const next = cloneState(state);
  const proposerId = action.proposerId;
  ensureMember(next, proposerId);
  validateActionPayload(next, action);
  const id = `action-${String(next.nextActionNumber).padStart(3, "0")}`;
  next.nextActionNumber += 1;
  const created = {
    id,
    type: action.type,
    targetId: action.targetId ?? null,
    replacement: action.replacement ?? null,
    signers: [proposerId],
    status: "collecting-signatures",
    createdAt: new Date().toISOString(),
  };
  next.actions.unshift(created);
  addEvent(next, "group", `${memberName(next, proposerId)} opened ${describeAction(created)}.`);
  addSdkTrace(next, "groupAction.propose", sdkGroupActionPayload(created));
  executeIfApproved(next, created.id);
  return next;
}

export function signAction(state, actionId, memberId) {
  const next = cloneState(state);
  ensureMember(next, memberId);
  const action = findAction(next, actionId);
  if (action.status !== "collecting-signatures") {
    throw new Error("This action is already closed.");
  }
  if (action.signers.includes(memberId)) {
    throw new Error(`${memberName(next, memberId)} already signed this action.`);
  }
  action.signers.push(memberId);
  addEvent(next, "group", `${memberName(next, memberId)} signed ${action.id}.`);
  addSdkTrace(next, "groupAction.sign", {
    actionId: action.id,
    signerIdentityId: memberId,
    groupContractPosition: next.group.contractPosition,
    votingPower: memberPower(next, memberId),
  });
  executeIfApproved(next, action.id);
  return next;
}

export function runHappyPathScenario(state) {
  let next = purchaseTokens(state, 2);
  next = submitClaim(next, {
    title: "Unauthenticated contract mutation",
    severity: "critical",
    summary: "A crafted state transition appears to mutate review metadata without a valid owner signature.",
  });
  const targetId = next.claims[0].id;
  next = proposeAction(next, { type: "freeze-claim", targetId, proposerId: "avery" });
  next = signAction(next, next.actions[0].id, "blake");
  next = proposeAction(next, { type: "destroy-slop-stake", targetId, proposerId: "casey" });
  next = signAction(next, next.actions[0].id, "avery");
  next = proposeAction(next, {
    type: "replace-member",
    proposerId: "blake",
    replacement: {
      oldMemberId: "casey",
      newMember: { id: "devon", name: "Devon", weight: 1 },
    },
  });
  next = signAction(next, next.actions[0].id, "avery");
  return next;
}

function executeIfApproved(state, actionId) {
  const action = findAction(state, actionId);
  if (!isActionApproved(state, action)) return;
  if (action.type === "freeze-claim") {
    executeFreezeClaim(state, action);
  } else if (action.type === "destroy-slop-stake") {
    executeDestroySlopStake(state, action);
  } else if (action.type === "approve-claim") {
    executeApproveClaim(state, action);
  } else if (action.type === "replace-member") {
    executeReplaceMember(state, action);
  } else {
    throw new Error(`Unknown action type: ${action.type}`);
  }
  action.status = "executed";
}

function executeFreezeClaim(state, action) {
  const claim = findClaim(state, action.targetId);
  if (claim.stakeState !== "locked") {
    throw new Error("Only locked claim stake can be frozen.");
  }
  claim.status = "frozen-for-review";
  claim.stakeState = "frozen";
  state.token.staked -= claim.stake;
  state.token.frozen += claim.stake;
  addEvent(state, "token", `${claim.id} stake frozen by 2-of-3 group approval.`);
  addSdkTrace(state, "sdk.tokens.freeze", {
    tokenPosition: TOKEN_PAYMENT_INFO.tokenContractPosition,
    identityId: "reporterIdentityId",
    amount: claim.stake,
    publicNote: `Freeze stake for ${claim.id}`,
    groupActionId: action.id,
  });
}

function executeDestroySlopStake(state, action) {
  const claim = findClaim(state, action.targetId);
  if (claim.stakeState !== "frozen") {
    throw new Error("Destroy requires the claim stake to be frozen first.");
  }
  claim.status = "slop-rejected";
  claim.stakeState = "destroyed";
  state.token.frozen -= claim.stake;
  state.token.destroyed += claim.stake;
  addEvent(state, "token", `${claim.id} frozen stake destroyed as slop/spam.`);
  addSdkTrace(state, "sdk.tokens.destroyFrozen", {
    tokenPosition: TOKEN_PAYMENT_INFO.tokenContractPosition,
    frozenIdentityId: "reporterIdentityId",
    amount: claim.stake,
    publicNote: `Destroy slop stake for ${claim.id}`,
    groupActionId: action.id,
  });
}

function executeApproveClaim(state, action) {
  const claim = findClaim(state, action.targetId);
  if (claim.stakeState !== "locked") {
    throw new Error("Only an unlocked pending claim can be approved for payout.");
  }
  claim.status = "eligible-for-payout";
  claim.stakeState = "returned";
  state.token.staked -= claim.stake;
  state.token.returned += claim.stake;
  state.token.reporterLiquid += claim.stake;
  addEvent(state, "document", `${claim.id} approved; stake returned and payout can proceed.`);
  addSdkTrace(state, "groupAction.execute.approveClaim", {
    documentId: claim.id,
    status: claim.status,
    returnedStake: claim.stake,
    groupActionId: action.id,
  });
}

function executeReplaceMember(state, action) {
  const { oldMemberId, newMember } = action.replacement;
  const index = state.group.members.findIndex((member) => member.id === oldMemberId);
  if (index === -1) throw new Error("Member to replace is not in the group.");
  if (state.group.members.some((member) => member.id === newMember.id && member.id !== oldMemberId)) {
    throw new Error("Replacement member is already in the group.");
  }
  const oldName = state.group.members[index].name;
  state.group.members[index] = {
    id: cleanId(newMember.id),
    name: clean(newMember.name),
    weight: 1,
  };
  addEvent(state, "group", `${oldName} replaced by ${state.group.members[index].name}.`);
  addSdkTrace(state, "groupAction.execute.replaceMember", {
    groupContractPosition: state.group.contractPosition,
    oldMemberId,
    newMember: state.group.members[index],
    groupActionId: action.id,
  });
}

function validateActionPayload(state, action) {
  if (["freeze-claim", "destroy-slop-stake", "approve-claim"].includes(action.type)) {
    findClaim(state, action.targetId);
    return;
  }
  if (action.type === "replace-member") {
    const replacement = action.replacement;
    if (!replacement) throw new Error("Replacement member payload is required.");
    ensureMember(state, replacement.oldMemberId);
    const member = replacement.newMember;
    if (!cleanId(member?.id)) throw new Error("New member ID is required.");
    if (!clean(member?.name)) throw new Error("New member name is required.");
    return;
  }
  throw new Error(`Unsupported action type: ${action.type}`);
}

function sdkGroupActionPayload(action) {
  return {
    type: action.type,
    targetId: action.targetId,
    replacement: action.replacement,
    groupContractPosition: 0,
    threshold: 2,
    initialSigner: action.signers[0],
  };
}

function findClaim(state, claimId) {
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error("Claim not found.");
  return claim;
}

function findAction(state, actionId) {
  const action = state.actions.find((item) => item.id === actionId);
  if (!action) throw new Error("Action not found.");
  return action;
}

function ensureMember(state, memberId) {
  if (!state.group.members.some((member) => member.id === memberId)) {
    throw new Error("Only current group members can sign governance actions.");
  }
}

function memberName(state, memberId) {
  return state.group.members.find((member) => member.id === memberId)?.name ?? memberId;
}

function describeAction(action) {
  if (action.type === "freeze-claim") return `a freeze vote for ${action.targetId}`;
  if (action.type === "destroy-slop-stake") return `a destroy-frozen-stake vote for ${action.targetId}`;
  if (action.type === "approve-claim") return `an approve-for-payout vote for ${action.targetId}`;
  if (action.type === "replace-member") {
    return `a membership change replacing ${action.replacement.oldMemberId}`;
  }
  return action.type;
}

function addEvent(state, type, message) {
  state.events.unshift({ type, message, at: new Date().toISOString() });
}

function addSdkTrace(state, method, payload) {
  state.sdkTrace.unshift({ method, payload, at: new Date().toISOString() });
}

function clean(value) {
  return String(value ?? "").trim();
}

function cleanId(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
