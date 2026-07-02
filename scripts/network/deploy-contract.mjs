import {
  IdentityKeyManager,
  SECRET_IDENTITIES_PATH,
  createClient,
  ensureDirs,
  mnemonicFromEnv,
  networkName,
  publicIdentitiesFromSecret,
  readJson,
  updatePublicState,
  writeJson,
} from "./lib/sdk-helpers.mjs";
import { GROUP_POSITION, TOKEN_POSITION, buildBountyContract } from "./lib/contract.mjs";
import { main } from "./lib/errors.mjs";

await main(async () => {
  ensureDirs();

  const network = networkName();
  const mnemonic = mnemonicFromEnv();
  const secret = readJson(SECRET_IDENTITIES_PATH);
  if (!secret?.identities?.owner) throw new Error("Missing identities. Run npm run network:identities first.");

  const sdk = await createClient(network);
  const owner = secret.identities.owner;
  const ownerManager = await IdentityKeyManager.create({
    sdk,
    mnemonic,
    network,
    identityId: owner.identityId,
    identityIndex: owner.identityIndex,
  });
  const { identity, identityKey, signer } = await ownerManager.getAuth();
  const reviewerIds = ["reviewerA", "reviewerB", "reviewerC"].map((role) => secret.identities[role].identityId);
  const dataContract = await buildBountyContract({ sdk, ownerId: identity.id.toString(), reviewerIds });

  console.log("Publishing bounty desk contract...");
  const published = await sdk.contracts.publish({ dataContract, identityKey, signer });
  const contractId = published.id?.toString() || published.toJSON?.()?.id;
  if (!contractId) throw new Error(`Contract publish returned no id: ${JSON.stringify(published.toJSON?.() ?? published)}`);
  const tokenId = await sdk.tokens.calculateId(contractId, TOKEN_POSITION);

  secret.contract = {
    contractId,
    tokenId: tokenId.toString(),
    tokenPosition: TOKEN_POSITION,
    groupPosition: GROUP_POSITION,
    deployedAt: new Date().toISOString(),
  };
  writeJson(SECRET_IDENTITIES_PATH, secret, true);
  updatePublicState({
    network,
    identities: publicIdentitiesFromSecret(secret),
    contract: secret.contract,
  });

  console.log(`Contract: ${contractId}`);
  console.log(`Token: ${tokenId.toString()}`);
});
