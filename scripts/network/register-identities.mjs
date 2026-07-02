import {
  AddressKeyManager,
  ROLES,
  SECRET_IDENTITIES_PATH,
  createClient,
  ensureDirs,
  mnemonicFromEnv,
  networkName,
  publicIdentitiesFromSecret,
  registerIdentity,
  updatePublicState,
  writeJson,
} from "./lib/sdk-helpers.mjs";

ensureDirs();

const network = networkName();
const mnemonic = mnemonicFromEnv();
const credits = Number(process.env.IDENTITY_REGISTER_CREDITS || 5_000_000);
const sdk = await createClient(network);
const fundingAddressManager = await AddressKeyManager.create({ sdk, mnemonic, network });

const secret = { network, fundingAddress: fundingAddressManager.primaryAddress.bech32m, identities: {} };

for (const role of ROLES) {
  console.log(`Registering ${role.role} at identity index ${role.identityIndex}...`);
  const result = await registerIdentity({
    sdk,
    mnemonic,
    network,
    identityIndex: role.identityIndex,
    fundingAddressManager,
    credits,
  });
  secret.identities[role.role] = {
    identityId: result.identityId,
    identityIndex: result.identityIndex,
  };
  console.log(`${role.role}: ${result.identityId}`);
}

writeJson(SECRET_IDENTITIES_PATH, secret, true);
updatePublicState({
  network,
  fundingAddress: secret.fundingAddress,
  identities: publicIdentitiesFromSecret(secret),
  notes: [
    "Public identity IDs only. Mnemonic and signing material are local in .secrets/ and not committed.",
  ],
});

console.log(`Wrote public IDs to data/testnet-state.json`);
