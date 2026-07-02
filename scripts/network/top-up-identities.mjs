import {
  AddressKeyManager,
  SECRET_IDENTITIES_PATH,
  createClient,
  ensureDirs,
  mnemonicFromEnv,
  networkName,
  readJson,
} from "./lib/sdk-helpers.mjs";
import { main } from "./lib/errors.mjs";

await main(async () => {
  ensureDirs();
  const network = networkName();
  const mnemonic = mnemonicFromEnv();
  const secret = readJson(SECRET_IDENTITIES_PATH);
  if (!secret?.identities) throw new Error("Missing identities. Run npm run network:identities first.");

  const sdk = await createClient(network);
  const addressManager = await AddressKeyManager.create({ sdk, mnemonic, network });
  const roles = process.argv.slice(2);
  const targetRoles = roles.length ? roles : ["owner", "reporter", "reviewerA", "reviewerB", "reviewerC", "reviewerD"];

  for (const roleSpec of targetRoles) {
    const [role, amountText] = roleSpec.split(":");
    const amount = BigInt(amountText || process.env.TOP_UP_CREDITS || "30000000000");
    const entry = secret.identities[role];
    if (!entry) throw new Error(`Unknown identity role ${role}`);
    const identity = await sdk.identities.fetch(entry.identityId);
    if (!identity) throw new Error(`Identity ${entry.identityId} not found`);
    console.log(`Topping up ${role} (${entry.identityId}) by ${amount} credits...`);
    const result = await sdk.addresses.topUpIdentity({
      identity,
      inputs: [{ address: addressManager.primaryAddress.bech32m, amount }],
      signer: addressManager.getSigner(),
    });
    console.log(`${role} new balance: ${result.newBalance?.toString?.() ?? result.newBalance}`);
  }
});
