import { Document, GroupStateTransitionInfoStatus } from "@dashevo/evo-sdk";

import {
  IdentityKeyManager,
  SECRET_IDENTITIES_PATH,
  TESTNET_STATE_PATH,
  createClient,
  ensureDirs,
  mnemonicFromEnv,
  networkName,
  publicIdentitiesFromSecret,
  readJson,
  updatePublicState,
} from "./lib/sdk-helpers.mjs";
import { main } from "./lib/errors.mjs";
import { GROUP_POSITION, TOKEN_POSITION } from "./lib/contract.mjs";

function idOf(value) {
  return value?.toString?.() ?? String(value);
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].map(([key, value]) => [
    key,
    typeof value === "bigint" ? value.toString() : value?.toJSON?.() ?? idOf(value),
  ]));
}

async function managerFor({ sdk, mnemonic, network, entry }) {
  return IdentityKeyManager.create({
    sdk,
    mnemonic,
    network,
    identityId: entry.identityId,
    identityIndex: entry.identityIndex,
  });
}

async function activeActionIds(sdk, contractId) {
  const actions = await sdk.group.actions({
    dataContractId: contractId,
    groupContractPosition: GROUP_POSITION,
    status: "ACTIVE",
    limit: 20,
  });
  return [...actions.keys()];
}

async function getActiveActionId(sdk, contractId, exclude = new Set()) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ids = (await activeActionIds(sdk, contractId)).filter((id) => !exclude.has(id));
    if (ids.length > 0) return ids[0];
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("No active group action found after proposer transition");
}

await main(async () => {
  ensureDirs();
  const network = networkName();
  const mnemonic = mnemonicFromEnv();
  const secret = readJson(SECRET_IDENTITIES_PATH);
  const contract = secret?.contract;
  if (!contract?.contractId) throw new Error("Missing contract. Run npm run network:contract first.");

  const sdk = await createClient(network);
  const ownerManager = await managerFor({ sdk, mnemonic, network, entry: secret.identities.owner });
  const reporterManager = await managerFor({ sdk, mnemonic, network, entry: secret.identities.reporter });
  const reviewerAManager = await managerFor({ sdk, mnemonic, network, entry: secret.identities.reviewerA });
  const reviewerBManager = await managerFor({ sdk, mnemonic, network, entry: secret.identities.reviewerB });

  const trace = [];
  const record = (step, result = {}) => {
    const entry = { step, at: new Date().toISOString(), ...result };
    trace.push(entry);
    console.log(`${step}: ${JSON.stringify(result)}`);
  };

  const ownerAuth = await ownerManager.getAuth();
  const reporterAuth = await reporterManager.getAuth();
  const reviewerAAuth = await reviewerAManager.getAuth();
  const reviewerBAuth = await reviewerBManager.getAuth();

  const tokenId = contract.tokenId;
  const tokenPrice = BigInt(process.env.TOKEN_DIRECT_PURCHASE_PRICE || "1000");

  const setPrice = await sdk.tokens.setPrice({
    dataContractId: contract.contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: secret.identities.owner.identityId,
    price: tokenPrice,
    publicNote: "Set BNTY direct purchase price for Bounty Desk e2e",
    identityKey: ownerAuth.identityKey,
    signer: ownerAuth.signer,
  });
  record("token.setPrice", {
    ownerId: idOf(setPrice.ownerId),
    price: tokenPrice.toString(),
  });

  const purchase = await sdk.tokens.directPurchase({
    dataContractId: contract.contractId,
    tokenPosition: TOKEN_POSITION,
    buyerId: secret.identities.reporter.identityId,
    amount: 3n,
    maxTotalCost: tokenPrice * 3n,
    identityKey: reporterAuth.identityKey,
    signer: reporterAuth.signer,
  });
  record("token.directPurchase", {
    buyerId: idOf(purchase.buyerId),
    newBalance: purchase.newBalance?.toString?.(),
  });

  const claimDocument = new Document({
    properties: {
      title: `AI slop bounty test ${new Date().toISOString()}`,
      summary: "Network e2e claim proving token-paid document creation and 2-of-3 group-gated token controls.",
      severity: "medium",
      reportUrl: "https://github.com/thepastaclaw/bounty-desk-groups-demo",
      aiDisclosure: "Synthetic test claim created by the Bounty Desk network harness.",
      status: "pending-review",
    },
    documentTypeName: "bountyClaim",
    dataContractId: contract.contractId,
    ownerId: reporterAuth.identity.id,
  });
  await sdk.documents.create({
    document: claimDocument,
    identityKey: reporterAuth.identityKey,
    signer: reporterAuth.signer,
    tokenPaymentInfo: {
      tokenContractPosition: TOKEN_POSITION,
      maximumTokenCost: 1n,
      gasFeesPaidBy: "DocumentOwner",
    },
  });
  record("documents.create", {
    documentId: claimDocument.id?.toString?.() ?? claimDocument.toJSON?.()?.$id,
    tokenPayment: "1 BNTY transferred to contract owner",
  });

  const balancesAfterDocument = await sdk.tokens.balances([
    secret.identities.owner.identityId,
    secret.identities.reporter.identityId,
  ], tokenId);
  record("tokens.balances.afterDocument", { balances: mapToObject(balancesAfterDocument) });

  const activeBeforeFreeze = new Set(await activeActionIds(sdk, contract.contractId));
  const freezePropose = await sdk.tokens.freeze({
    dataContractId: contract.contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: secret.identities.reviewerA.identityId,
    frozenIdentityId: secret.identities.reporter.identityId,
    publicNote: "Freeze reporter BNTY while slop claim is reviewed",
    identityKey: reviewerAAuth.identityKey,
    signer: reviewerAAuth.signer,
    groupInfo: GroupStateTransitionInfoStatus.proposer(GROUP_POSITION),
  });
  record("tokens.freeze.propose", { groupPower: freezePropose.groupPower?.toString?.() });

  const freezeActionId = await getActiveActionId(sdk, contract.contractId, activeBeforeFreeze);
  const freezeSign = await sdk.tokens.freeze({
    dataContractId: contract.contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: secret.identities.reviewerB.identityId,
    frozenIdentityId: secret.identities.reporter.identityId,
    identityKey: reviewerBAuth.identityKey,
    signer: reviewerBAuth.signer,
    groupInfo: GroupStateTransitionInfoStatus.otherSigner(GROUP_POSITION, freezeActionId),
  });
  record("tokens.freeze.sign", {
    actionId: freezeActionId,
    groupPower: freezeSign.groupPower?.toString?.(),
  });

  const activeBeforeDestroy = new Set(await activeActionIds(sdk, contract.contractId));
  const destroyPropose = await sdk.tokens.destroyFrozen({
    dataContractId: contract.contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: secret.identities.reviewerA.identityId,
    frozenIdentityId: secret.identities.reporter.identityId,
    publicNote: "Destroy frozen BNTY for slop/spam claim",
    identityKey: reviewerAAuth.identityKey,
    signer: reviewerAAuth.signer,
    groupInfo: GroupStateTransitionInfoStatus.proposer(GROUP_POSITION),
  });
  record("tokens.destroyFrozen.propose", { groupPower: destroyPropose.groupPower?.toString?.() });

  const destroyActionId = await getActiveActionId(sdk, contract.contractId, activeBeforeDestroy);
  const destroySign = await sdk.tokens.destroyFrozen({
    dataContractId: contract.contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: secret.identities.reviewerB.identityId,
    frozenIdentityId: secret.identities.reporter.identityId,
    identityKey: reviewerBAuth.identityKey,
    signer: reviewerBAuth.signer,
    groupInfo: GroupStateTransitionInfoStatus.otherSigner(GROUP_POSITION, destroyActionId),
  });
  record("tokens.destroyFrozen.sign", {
    actionId: destroyActionId,
    groupPower: destroySign.groupPower?.toString?.(),
  });

  const finalBalances = await sdk.tokens.balances([
    secret.identities.owner.identityId,
    secret.identities.reporter.identityId,
  ], tokenId);
  record("tokens.balances.final", { balances: mapToObject(finalBalances) });

  const publicState = readJson(TESTNET_STATE_PATH, {});
  updatePublicState({
    network,
    identities: publicIdentitiesFromSecret(secret),
    contract,
    runs: [
      ...(publicState.runs || []),
      {
        at: new Date().toISOString(),
        status: "completed",
        trace,
      },
    ],
  });
});
