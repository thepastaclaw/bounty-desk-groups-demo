import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  EvoSDK,
  Identity,
  IdentityPublicKeyInCreation,
  IdentitySigner,
  Identifier,
  KeyType,
  PlatformAddressSigner,
  PrivateKey,
  Purpose,
  SecurityLevel,
  wallet,
} from "@dashevo/evo-sdk";
import dotenv from "dotenv";

dotenv.config();

export const ROOT = process.cwd();
export const SECRETS_DIR = path.join(ROOT, ".secrets");
export const DATA_DIR = path.join(ROOT, "data");
export const TESTNET_STATE_PATH = path.join(DATA_DIR, "testnet-state.json");
export const SECRET_ENV_PATH = path.join(SECRETS_DIR, "testnet.env");
export const SECRET_IDENTITIES_PATH = path.join(SECRETS_DIR, "testnet-identities.json");

export const ROLES = [
  { role: "owner", identityIndex: 0 },
  { role: "reporter", identityIndex: 1 },
  { role: "reviewerA", identityIndex: 2 },
  { role: "reviewerB", identityIndex: 3 },
  { role: "reviewerC", identityIndex: 4 },
  { role: "reviewerD", identityIndex: 5 },
];

export const KEY_SPECS = [
  { keyId: 0, purpose: Purpose.AUTHENTICATION, securityLevel: SecurityLevel.MASTER },
  { keyId: 1, purpose: Purpose.AUTHENTICATION, securityLevel: SecurityLevel.HIGH },
  { keyId: 2, purpose: Purpose.AUTHENTICATION, securityLevel: SecurityLevel.CRITICAL },
  { keyId: 3, purpose: Purpose.TRANSFER, securityLevel: SecurityLevel.CRITICAL },
  { keyId: 4, purpose: Purpose.ENCRYPTION, securityLevel: SecurityLevel.MEDIUM },
];

export function ensureDirs() {
  fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson(file, fallback = undefined) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value, secret = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: secret ? 0o700 : 0o755 });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: secret ? 0o600 : 0o644 });
}

export function updatePublicState(patch) {
  const previous = readJson(TESTNET_STATE_PATH, {
    network: networkName(),
    generatedAt: null,
    identities: {},
    contract: null,
    runs: [],
    notes: [],
  });
  writeJson(TESTNET_STATE_PATH, {
    ...previous,
    ...patch,
    generatedAt: new Date().toISOString(),
  });
}

export function networkName() {
  return process.env.NETWORK || "testnet";
}

export function mnemonicFromEnv() {
  const mnemonic = process.env.PLATFORM_MNEMONIC;
  if (!mnemonic) {
    throw new Error(`PLATFORM_MNEMONIC missing. Run npm run network:wallet, then fund the printed address.`);
  }
  return mnemonic;
}

export async function createClient(network = networkName()) {
  const sdk = network === "testnet"
    ? EvoSDK.testnetTrusted()
    : network === "mainnet"
      ? EvoSDK.mainnetTrusted()
      : EvoSDK.localTrusted();
  await sdk.connect();
  return sdk;
}

export async function dip13KeyPath(network, identityIndex, keyIndex) {
  const base = network === "testnet"
    ? await wallet.derivationPathDip13Testnet(5)
    : await wallet.derivationPathDip13Mainnet(5);
  return `${base.path}/0'/0'/${identityIndex}'/${keyIndex}'`;
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) {
    throw new Error("hexToBytes expected an even-length hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export class IdentityKeyManager {
  constructor(sdk, identityId, keys, identityIndex) {
    this.sdk = sdk;
    this.id = identityId;
    this.keys = keys;
    this.identityIndex = identityIndex;
  }

  static async createForNewIdentity({ sdk, mnemonic, network = networkName(), identityIndex }) {
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

  static async create({ sdk, mnemonic, network = networkName(), identityId, identityIndex }) {
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
    if (!this.id) throw new Error("Identity ID is not set");
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

  async getMaster() {
    return this.getSigner("master");
  }
}

export class AddressKeyManager {
  constructor(sdk, addresses, network) {
    this.sdk = sdk;
    this.addresses = addresses;
    this.network = network;
  }

  get primaryAddress() {
    return this.addresses[0];
  }

  static async create({ sdk, mnemonic, network = networkName(), count = 1 }) {
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
      addresses.push({
        address,
        bech32m: address.toBech32m(network),
        privateKeyWif,
        path: pathInfo.path,
      });
    }
    return new AddressKeyManager(sdk, addresses, network);
  }

  getSigner() {
    const signer = new PlatformAddressSigner();
    signer.addKey(PrivateKey.fromWIF(this.primaryAddress.privateKeyWif));
    return signer;
  }
}

export async function registerIdentity({ sdk, mnemonic, network, identityIndex, fundingAddressManager, credits }) {
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

export function publicIdentitiesFromSecret(secret) {
  return Object.fromEntries(Object.entries(secret.identities || {}).map(([role, entry]) => [
    role,
    { identityId: entry.identityId, identityIndex: entry.identityIndex },
  ]));
}
