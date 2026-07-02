import {
  AuthorizedActionTakers,
  ChangeControlRules,
  DataContract,
  Document,
  EvoSDK,
  Group,
  GroupStateTransitionInfoStatus,
  Identity,
  IdentityPublicKeyInCreation,
  IdentitySigner,
  Identifier,
  KeyType,
  PlatformAddressSigner,
  PrivateKey,
  Purpose,
  SecurityLevel,
  TokenConfiguration,
  TokenConfigurationConvention,
  TokenConfigurationLocalization,
  TokenDistributionRules,
  TokenKeepsHistoryRules,
  TokenMarketplaceRules,
  TokenTradeMode,
  wallet,
} from "../vendor/evo-sdk.module.js";

const LIVE_KEY = "bounty-desk-groups-demo:live-testnet:v1";
const NETWORK = "testnet";
const TOKEN_POSITION = 0;
const GROUP_POSITION = 0;
const TOKEN_PRICE = 1000n;

const ROLES = [
  { role: "owner", identityIndex: 0, credits: 30_000_000_000n },
  { role: "reporter", identityIndex: 1, credits: 10_000_000_000n },
  { role: "reviewerA", identityIndex: 2, credits: 1_000_000_000n },
  { role: "reviewerB", identityIndex: 3, credits: 1_000_000_000n },
  { role: "reviewerC", identityIndex: 4, credits: 1_000_000_000n },
  { role: "reviewerD", identityIndex: 5, credits: 1_000_000_000n },
];

const KEY_SPECS = [
  { keyId: 0, purpose: Purpose.AUTHENTICATION, securityLevel: SecurityLevel.MASTER },
  { keyId: 1, purpose: Purpose.AUTHENTICATION, securityLevel: SecurityLevel.HIGH },
  { keyId: 2, purpose: Purpose.AUTHENTICATION, securityLevel: SecurityLevel.CRITICAL },
  { keyId: 3, purpose: Purpose.TRANSFER, securityLevel: SecurityLevel.CRITICAL },
  { keyId: 4, purpose: Purpose.ENCRYPTION, securityLevel: SecurityLevel.MEDIUM },
];

const els = {
  status: document.querySelector("#live-status"),
  log: document.querySelector("#live-log"),
  generate: document.querySelector("#live-generate-wallet"),
  register: document.querySelector("#live-register-identities"),
  deploy: document.querySelector("#live-deploy-contract"),
  run: document.querySelector("#live-run-flow"),
  membership: document.querySelector("#live-membership"),
  clear: document.querySelector("#live-clear"),
};

let state = loadState();
let sdkPromise;

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LIVE_KEY)) || freshState();
  } catch {
    return freshState();
  }
}

function freshState() {
  return {
    network: NETWORK,
    mnemonic: "",
    fundingAddress: "",
    identities: {},
    contract: null,
    lastRun: null,
    membershipUpdate: null,
    log: [],
  };
}

function saveState() {
  localStorage.setItem(LIVE_KEY, JSON.stringify(state));
}

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.dataset.busy = busy ? "true" : "false";
}

async function runWithLog(button, label, fn) {
  setBusy(button, true);
  log(`${label} started`);
  try {
    await fn();
    log(`${label} completed`);
  } catch (error) {
    log(`${label} failed: ${errorMessage(error)}`, "error");
  } finally {
    setBusy(button, false);
    saveState();
    render();
  }
}

function log(message, type = "info") {
  state.log.unshift({ at: new Date().toISOString(), type, message });
  state.log = state.log.slice(0, 80);
  saveState();
  render();
}

function render() {
  if (!els.status) return;
  const isBusy = [els.generate, els.register, els.deploy, els.run, els.membership]
    .some((button) => button?.dataset.busy === "true");
  const bridgeUrl = state.fundingAddress
    ? `https://bridge.thepasta.org/?network=testnet&address=${encodeURIComponent(state.fundingAddress)}`
    : "";

  els.status.innerHTML = `
    <div class="live-grid">
      ${liveCard("Wallet", [
    ["Status", state.mnemonic ? "generated in this browser" : "not generated"],
    ["Funding address", state.fundingAddress || "not generated"],
    ["Bridge", bridgeUrl ? `<a href="${bridgeUrl}" target="_blank" rel="noreferrer">fund this testnet address</a>` : "generate wallet first"],
  ])}
      ${liveCard("Identities", roleRows())}
      ${liveCard("Contract", [
    ["Contract", state.contract?.contractId || "not deployed"],
    ["Token", state.contract?.tokenId || "not deployed"],
    ["Group", state.contract ? "reviewerA + reviewerB + reviewerC, 2-of-3" : "not deployed"],
  ])}
      ${liveCard("Latest network result", resultRows())}
    </div>
  `;

  if (els.log) {
    els.log.innerHTML = state.log.map((entry) => `
      <li class="${entry.type}">
        <time>${new Date(entry.at).toLocaleTimeString()}</time>
        <span>${escapeHtml(entry.message)}</span>
      </li>
    `).join("") || `<li class="empty-log">No live actions run yet.</li>`;
  }

  if (els.generate) els.generate.disabled = isBusy;
  if (els.register) els.register.disabled = isBusy || !state.mnemonic;
  if (els.deploy) els.deploy.disabled = isBusy || !state.identities.owner;
  if (els.run) els.run.disabled = isBusy || !state.contract;
  if (els.membership) els.membership.disabled = isBusy || !state.contract;
  if (els.clear) els.clear.disabled = isBusy;
}

function roleRows() {
  return ROLES.map(({ role }) => [role, state.identities[role]?.identityId || "not registered"]);
}

function resultRows() {
  return [
    ["Run", state.lastRun?.status || "not run"],
    ["Document", state.lastRun?.documentId || "not created"],
    ["Freeze action", state.lastRun?.freezeActionId || "not run"],
    ["Destroy action", state.lastRun?.destroyActionId || "not run"],
    ["Membership", state.membershipUpdate?.status || "not attempted"],
  ];
}

function liveCard(title, rows) {
  return `
    <article class="live-card">
      <h3>${escapeHtml(title)}</h3>
      <dl>
        ${rows.map(([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${typeof value === "string" && value.includes("<a ") ? value : `<code>${escapeHtml(value)}</code>`}</dd>
          </div>
        `).join("")}
      </dl>
    </article>
  `;
}

async function createClient() {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();
      return sdk;
    })();
  }
  return sdkPromise;
}

async function generateWallet() {
  const sdk = await createClient();
  const mnemonic = await wallet.generateMnemonic();
  const addressManager = await AddressKeyManager.create({ sdk, mnemonic, network: NETWORK });
  state = {
    ...freshState(),
    mnemonic,
    fundingAddress: addressManager.primaryAddress.bech32m,
    log: state.log,
  };
  log(`Generated testnet wallet funding address ${state.fundingAddress}`);
}

async function registerIdentities() {
  const sdk = await createClient();
  const fundingAddressManager = await AddressKeyManager.create({ sdk, mnemonic: state.mnemonic, network: NETWORK });
  state.identities = {};

  for (const role of ROLES) {
    log(`Registering ${role.role} with ${role.credits.toString()} credits`);
    const result = await registerIdentity({
      sdk,
      mnemonic: state.mnemonic,
      network: NETWORK,
      identityIndex: role.identityIndex,
      fundingAddressManager,
      credits: role.credits,
    });
    state.identities[role.role] = {
      identityId: result.identityId,
      identityIndex: result.identityIndex,
    };
    saveState();
    render();
  }
}

async function deployContract() {
  const sdk = await createClient();
  const ownerManager = await managerFor("owner", sdk);
  const { identity, identityKey, signer } = await ownerManager.getAuth();
  const reviewerIds = ["reviewerA", "reviewerB", "reviewerC"].map((role) => state.identities[role].identityId);
  const dataContract = await buildBountyContract({ sdk, ownerId: identity.id.toString(), reviewerIds });
  const published = await sdk.contracts.publish({ dataContract, identityKey, signer });
  const contractId = published.id?.toString() || published.toJSON?.()?.id;
  const tokenId = await sdk.tokens.calculateId(contractId, TOKEN_POSITION);

  state.contract = {
    contractId,
    tokenId: tokenId.toString(),
    tokenPosition: TOKEN_POSITION,
    groupPosition: GROUP_POSITION,
    deployedAt: new Date().toISOString(),
  };
  log(`Deployed contract ${contractId}`);
}

async function runBountyFlow() {
  const sdk = await createClient();
  const ownerAuth = await (await managerFor("owner", sdk)).getAuth();
  const reporterAuth = await (await managerFor("reporter", sdk)).getAuth();
  const reviewerAAuth = await (await managerFor("reviewerA", sdk)).getAuth();
  const reviewerBAuth = await (await managerFor("reviewerB", sdk)).getAuth();
  const contractId = state.contract.contractId;
  const tokenId = state.contract.tokenId;

  await sdk.tokens.setPrice({
    dataContractId: contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: state.identities.owner.identityId,
    price: TOKEN_PRICE,
    publicNote: "Set BNTY direct purchase price from Bounty Desk browser app",
    identityKey: ownerAuth.identityKey,
    signer: ownerAuth.signer,
  });
  log("Set BNTY direct purchase price");

  await sdk.tokens.directPurchase({
    dataContractId: contractId,
    tokenPosition: TOKEN_POSITION,
    buyerId: state.identities.reporter.identityId,
    amount: 3n,
    maxTotalCost: TOKEN_PRICE * 3n,
    identityKey: reporterAuth.identityKey,
    signer: reporterAuth.signer,
  });
  log("Reporter bought 3 BNTY");

  const claimDocument = new Document({
    properties: {
      title: `Browser bounty test ${new Date().toISOString()}`,
      summary: "Bounty claim submitted from the static GitHub Pages app with tokenPaymentInfo.",
      severity: "medium",
      reportUrl: "https://github.com/thepastaclaw/bounty-desk-groups-demo",
      aiDisclosure: "Synthetic browser test claim.",
      status: "pending-review",
    },
    documentTypeName: "bountyClaim",
    dataContractId: contractId,
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
  const documentId = claimDocument.id?.toString?.() ?? claimDocument.toJSON?.()?.$id;
  log(`Created token-paid bountyClaim document ${documentId}`);

  const activeBeforeFreeze = new Set(await activeActionIds(sdk, contractId));
  await sdk.tokens.freeze({
    dataContractId: contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: state.identities.reviewerA.identityId,
    frozenIdentityId: state.identities.reporter.identityId,
    publicNote: "Freeze reporter BNTY while slop claim is reviewed",
    identityKey: reviewerAAuth.identityKey,
    signer: reviewerAAuth.signer,
    groupInfo: GroupStateTransitionInfoStatus.proposer(GROUP_POSITION),
  });
  const freezeActionId = await getActiveActionId(sdk, contractId, activeBeforeFreeze);
  await sdk.tokens.freeze({
    dataContractId: contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: state.identities.reviewerB.identityId,
    frozenIdentityId: state.identities.reporter.identityId,
    identityKey: reviewerBAuth.identityKey,
    signer: reviewerBAuth.signer,
    groupInfo: GroupStateTransitionInfoStatus.otherSigner(GROUP_POSITION, freezeActionId),
  });
  log(`2-of-3 freeze executed via action ${freezeActionId}`);

  const activeBeforeDestroy = new Set(await activeActionIds(sdk, contractId));
  await sdk.tokens.destroyFrozen({
    dataContractId: contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: state.identities.reviewerA.identityId,
    frozenIdentityId: state.identities.reporter.identityId,
    publicNote: "Destroy frozen BNTY for slop/spam claim",
    identityKey: reviewerAAuth.identityKey,
    signer: reviewerAAuth.signer,
    groupInfo: GroupStateTransitionInfoStatus.proposer(GROUP_POSITION),
  });
  const destroyActionId = await getActiveActionId(sdk, contractId, activeBeforeDestroy);
  await sdk.tokens.destroyFrozen({
    dataContractId: contractId,
    tokenPosition: TOKEN_POSITION,
    authorityId: state.identities.reviewerB.identityId,
    frozenIdentityId: state.identities.reporter.identityId,
    identityKey: reviewerBAuth.identityKey,
    signer: reviewerBAuth.signer,
    groupInfo: GroupStateTransitionInfoStatus.otherSigner(GROUP_POSITION, destroyActionId),
  });
  log(`2-of-3 destroyFrozen executed via action ${destroyActionId}`);

  const finalBalances = await sdk.tokens.balances([
    state.identities.owner.identityId,
    state.identities.reporter.identityId,
  ], tokenId);
  state.lastRun = {
    at: new Date().toISOString(),
    status: "completed",
    documentId,
    freezeActionId,
    destroyActionId,
    balances: mapToObject(finalBalances),
  };
}

async function attemptMembershipUpdate() {
  const sdk = await createClient();
  const ownerAuth = await (await managerFor("owner", sdk)).getAuth();
  const dataContract = await sdk.contracts.fetch(state.contract.contractId);
  dataContract.version = Number(dataContract.version) + 1;
  dataContract.groups = {
    [GROUP_POSITION]: createReviewGroup([
      state.identities.reviewerA.identityId,
      state.identities.reviewerB.identityId,
      state.identities.reviewerD.identityId,
    ]),
  };
  try {
    await sdk.contracts.update({
      dataContract,
      identityKey: ownerAuth.identityKey,
      signer: ownerAuth.signer,
    });
    state.membershipUpdate = { at: new Date().toISOString(), status: "completed" };
    log("Membership update completed");
  } catch (error) {
    const message = errorMessage(error);
    state.membershipUpdate = { at: new Date().toISOString(), status: "rejected", error: message };
    log(`Membership update rejected: ${message}`, "warn");
  }
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

async function managerFor(role, sdk) {
  const entry = state.identities[role];
  if (!entry) throw new Error(`${role} identity is not registered`);
  return IdentityKeyManager.create({
    sdk,
    mnemonic: state.mnemonic,
    network: NETWORK,
    identityId: entry.identityId,
    identityIndex: entry.identityIndex,
  });
}

async function dip13KeyPath(network, identityIndex, keyIndex) {
  const base = network === "testnet"
    ? await wallet.derivationPathDip13Testnet(5)
    : await wallet.derivationPathDip13Mainnet(5);
  return `${base.path}/0'/0'/${identityIndex}'/${keyIndex}'`;
}

function randomBytes(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

class IdentityKeyManager {
  constructor(sdk, identityId, keys, identityIndex) {
    this.sdk = sdk;
    this.id = identityId;
    this.keys = keys;
    this.identityIndex = identityIndex;
  }

  static async createForNewIdentity({ sdk, mnemonic, network, identityIndex }) {
    const derive = async (keyIndex) => wallet.deriveKeyFromSeedWithPath({
      mnemonic,
      path: await dip13KeyPath(network, identityIndex, keyIndex),
      network,
    });
    const derived = await Promise.all(KEY_SPECS.map((spec) => derive(spec.keyId)));
    const byIndex = Object.fromEntries(derived.map((key, index) => [KEY_SPECS[index].keyId, key.toObject()]));
    return new IdentityKeyManager(sdk, null, {
      master: { keyId: 0, privateKeyWif: byIndex[0].privateKeyWif, publicKey: byIndex[0].publicKey },
      authHigh: { keyId: 1, privateKeyWif: byIndex[1].privateKeyWif, publicKey: byIndex[1].publicKey },
      auth: { keyId: 2, privateKeyWif: byIndex[2].privateKeyWif, publicKey: byIndex[2].publicKey },
      transfer: { keyId: 3, privateKeyWif: byIndex[3].privateKeyWif, publicKey: byIndex[3].publicKey },
      encryption: { keyId: 4, privateKeyWif: byIndex[4].privateKeyWif, publicKey: byIndex[4].publicKey },
    }, identityIndex);
  }

  static async create({ sdk, mnemonic, network, identityId, identityIndex }) {
    const manager = await IdentityKeyManager.createForNewIdentity({ sdk, mnemonic, network, identityIndex });
    manager.id = identityId;
    return manager;
  }

  getKeysInCreation() {
    return KEY_SPECS.map((spec) => {
      const key = Object.values(this.keys).find((candidate) => candidate.keyId === spec.keyId);
      return new IdentityPublicKeyInCreation({
        keyId: spec.keyId,
        purpose: spec.purpose,
        securityLevel: spec.securityLevel,
        keyType: KeyType.ECDSA_SECP256K1,
        data: hexToBytes(key.publicKey),
      });
    });
  }

  getFullSigner() {
    const signer = new IdentitySigner();
    Object.values(this.keys).forEach((key) => signer.addKeyFromWif(key.privateKeyWif));
    return signer;
  }

  async getSigner(keyName) {
    const key = this.keys[keyName];
    const identity = await this.sdk.identities.fetch(this.id);
    if (!identity) throw new Error(`Identity ${this.id} not found`);
    const signer = new IdentitySigner();
    signer.addKeyFromWif(key.privateKeyWif);
    return { identity, identityKey: identity.getPublicKeyById(key.keyId), signer };
  }

  async getAuth() {
    return this.getSigner("auth");
  }
}

class AddressKeyManager {
  constructor(addresses, network) {
    this.addresses = addresses;
    this.network = network;
  }

  get primaryAddress() {
    return this.addresses[0];
  }

  static async create({ mnemonic, network, count = 1 }) {
    const addresses = [];
    for (let index = 0; index < count; index += 1) {
      const pathInfo = network === "testnet"
        ? await wallet.derivationPathBip44Testnet(0, 0, index)
        : await wallet.derivationPathBip44Mainnet(0, 0, index);
      const keyInfo = await wallet.deriveKeyFromSeedWithPath({ mnemonic, path: pathInfo.path, network });
      const privateKeyWif = keyInfo.toObject().privateKeyWif;
      const privateKey = PrivateKey.fromWIF(privateKeyWif);
      const signer = new PlatformAddressSigner();
      const address = signer.addKey(privateKey);
      addresses.push({ address, bech32m: address.toBech32m(network), privateKeyWif, path: pathInfo.path });
    }
    return new AddressKeyManager(addresses, network);
  }

  getSigner() {
    const signer = new PlatformAddressSigner();
    signer.addKey(PrivateKey.fromWIF(this.primaryAddress.privateKeyWif));
    return signer;
  }
}

async function registerIdentity({ sdk, mnemonic, network, identityIndex, fundingAddressManager, credits }) {
  const manager = await IdentityKeyManager.createForNewIdentity({ sdk, mnemonic, network, identityIndex });
  const identity = new Identity(new Identifier(randomBytes(32)));
  manager.getKeysInCreation().forEach((key) => identity.addPublicKey(key.toIdentityPublicKey()));
  const result = await sdk.addresses.createIdentity({
    identity,
    inputs: [{ address: fundingAddressManager.primaryAddress.bech32m, amount: BigInt(credits) }],
    identitySigner: manager.getFullSigner(),
    addressSigner: fundingAddressManager.getSigner(),
  });
  const identityId = result.identity.id.toString();
  manager.id = identityId;
  return { identityId, identityIndex, manager };
}

const BOUNTY_SCHEMAS = {
  bountyClaim: {
    type: "object",
    documentsMutable: true,
    canBeDeleted: false,
    transferable: 0,
    tradeMode: 0,
    creationRestrictionMode: 0,
    tokenCost: {
      create: {
        tokenPosition: TOKEN_POSITION,
        amount: 1,
        effect: 0,
        gasFeesPaidBy: 0,
      },
    },
    properties: {
      title: { type: "string", minLength: 4, maxLength: 120, position: 0 },
      summary: { type: "string", minLength: 20, maxLength: 1000, position: 1 },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"], maxLength: 16, position: 2 },
      reportUrl: { type: "string", maxLength: 256, position: 3 },
      aiDisclosure: { type: "string", maxLength: 256, position: 4 },
      status: { type: "string", enum: ["pending-review", "frozen-for-review", "eligible-for-payout", "slop-rejected"], maxLength: 32, position: 5 },
    },
    required: ["title", "summary", "severity", "status"],
    additionalProperties: false,
    indices: [
      { name: "owner", properties: [{ $ownerId: "asc" }] },
      { name: "status", properties: [{ status: "asc" }] },
      { name: "severity", properties: [{ severity: "asc" }] },
    ],
  },
};

function createReviewGroup(identityIds) {
  return new Group(new Map(identityIds.map((id) => [id, 1])), 2);
}

function createBountyTokenConfiguration(ownerId) {
  const contractOwner = AuthorizedActionTakers.ContractOwner();
  const reviewGroup = AuthorizedActionTakers.Group(GROUP_POSITION);
  const noOne = AuthorizedActionTakers.NoOne();
  const ownerRules = new ChangeControlRules({
    authorizedToMakeChange: contractOwner,
    adminActionTakers: contractOwner,
    isChangingAuthorizedActionTakersToNoOneAllowed: true,
    isChangingAdminActionTakersToNoOneAllowed: true,
    isSelfChangingAdminActionTakersAllowed: true,
  });
  const groupRules = new ChangeControlRules({
    authorizedToMakeChange: reviewGroup,
    adminActionTakers: reviewGroup,
    isChangingAuthorizedActionTakersToNoOneAllowed: true,
    isChangingAdminActionTakersToNoOneAllowed: true,
    isSelfChangingAdminActionTakersAllowed: true,
  });
  const lockedRules = new ChangeControlRules({ authorizedToMakeChange: noOne, adminActionTakers: noOne });
  return new TokenConfiguration({
    conventions: new TokenConfigurationConvention({
      en: new TokenConfigurationLocalization(false, "BountyStake", "BountyStakes"),
    }, 0),
    conventionsChangeRules: ownerRules,
    baseSupply: 0n,
    maxSupply: 1_000_000n,
    keepsHistory: new TokenKeepsHistoryRules({
      isKeepingTransferHistory: true,
      isKeepingFreezingHistory: true,
      isKeepingBurningHistory: true,
      isKeepingDirectPurchaseHistory: true,
      isKeepingDestroyedFrozenFundsHistory: true,
    }),
    maxSupplyChangeRules: lockedRules,
    distributionRules: new TokenDistributionRules({
      newTokensDestinationIdentity: ownerId,
      newTokensDestinationIdentityRules: ownerRules,
      mintingAllowChoosingDestination: true,
      mintingAllowChoosingDestinationRules: ownerRules,
      perpetualDistributionRules: lockedRules,
      changeDirectPurchasePricingRules: ownerRules,
    }),
    marketplaceRules: new TokenMarketplaceRules(TokenTradeMode.NotTradeable(), lockedRules),
    manualMintingRules: ownerRules,
    manualBurningRules: ownerRules,
    freezeRules: groupRules,
    unfreezeRules: groupRules,
    destroyFrozenFundsRules: groupRules,
    emergencyActionRules: groupRules,
    mainControlGroup: GROUP_POSITION,
    mainControlGroupCanBeModified: noOne,
    description: "BNTY tokens pay for bounty claim documents and can be frozen/destroyed by a 2-of-3 review group.",
  });
}

async function buildBountyContract({ sdk, ownerId, reviewerIds }) {
  const identityNonce = await sdk.identities.nonce(ownerId);
  const dataContract = new DataContract({
    ownerId,
    identityNonce: (identityNonce || 0n) + 1n,
    schemas: BOUNTY_SCHEMAS,
    tokens: { [TOKEN_POSITION]: createBountyTokenConfiguration(ownerId) },
    fullValidation: true,
  });
  dataContract.groups = { [GROUP_POSITION]: createReviewGroup(reviewerIds) };
  return dataContract;
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].map(([key, value]) => [
    key,
    typeof value === "bigint" ? value.toString() : value?.toJSON?.() ?? String(value),
  ]));
}

function errorMessage(error) {
  return error?.message || String(error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

els.generate?.addEventListener("click", () => runWithLog(els.generate, "Generate wallet", generateWallet));
els.register?.addEventListener("click", () => runWithLog(els.register, "Register identities", registerIdentities));
els.deploy?.addEventListener("click", () => runWithLog(els.deploy, "Deploy contract", deployContract));
els.run?.addEventListener("click", () => runWithLog(els.run, "Run bounty flow", runBountyFlow));
els.membership?.addEventListener("click", () => runWithLog(els.membership, "Attempt membership update", attemptMembershipUpdate));
els.clear?.addEventListener("click", () => {
  localStorage.removeItem(LIVE_KEY);
  state = freshState();
  render();
});

render();
