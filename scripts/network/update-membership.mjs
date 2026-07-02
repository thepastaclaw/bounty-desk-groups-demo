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
} from "./lib/sdk-helpers.mjs";
import { describeError, main } from "./lib/errors.mjs";
import { GROUP_POSITION, createReviewGroup } from "./lib/contract.mjs";

function groupToObject(group) {
  return {
    requiredPower: group.requiredPower,
    members: Object.fromEntries([...group.members.entries()].map(([id, power]) => [id, Number(power)])),
  };
}

await main(async () => {
  ensureDirs();
  const network = networkName();
  const mnemonic = mnemonicFromEnv();
  const secret = readJson(SECRET_IDENTITIES_PATH);
  const contract = secret?.contract;
  if (!contract?.contractId) throw new Error("Missing contract. Run npm run network:contract first.");

  const sdk = await createClient(network);
  const ownerManager = await IdentityKeyManager.create({
    sdk,
    mnemonic,
    network,
    identityId: secret.identities.owner.identityId,
    identityIndex: secret.identities.owner.identityIndex,
  });
  const { identityKey, signer } = await ownerManager.getAuth();

  const dataContract = await sdk.contracts.fetch(contract.contractId);
  if (!dataContract) throw new Error(`Contract ${contract.contractId} not found`);

  const before = await sdk.group.infos({
    dataContractId: contract.contractId,
    startAt: { position: GROUP_POSITION, included: true },
    limit: 1,
  });

  const beforeGroup = before.get(GROUP_POSITION) ?? before.get(Number(GROUP_POSITION));
  const publicState = readJson("data/testnet-state.json", {});

  dataContract.version = Number(dataContract.version) + 1;
  dataContract.groups = {
    [GROUP_POSITION]: createReviewGroup([
      secret.identities.reviewerA.identityId,
      secret.identities.reviewerB.identityId,
      secret.identities.reviewerD.identityId,
    ]),
  };

  try {
    await sdk.contracts.update({ dataContract, identityKey, signer });

    const after = await sdk.group.infos({
      dataContractId: contract.contractId,
      startAt: { position: GROUP_POSITION, included: true },
      limit: 1,
    });
    const afterGroup = after.get(GROUP_POSITION) ?? after.get(Number(GROUP_POSITION));

    updatePublicState({
      network,
      identities: publicIdentitiesFromSecret(secret),
      contract,
      membershipUpdate: {
        at: new Date().toISOString(),
        status: "completed",
        changed: "reviewerC -> reviewerD",
        before: beforeGroup ? groupToObject(beforeGroup) : null,
        after: afterGroup ? groupToObject(afterGroup) : null,
      },
      runs: publicState.runs || [],
    });

    console.log("Membership updated: reviewerC -> reviewerD");
    console.log(JSON.stringify({ before: beforeGroup && groupToObject(beforeGroup), after: afterGroup && groupToObject(afterGroup) }, null, 2));
    return;
  } catch (error) {
    const message = describeError(error)
      .split("\n")
      .find((line) => line.includes("change group at position"))
      || describeError(error).split("\n")[0]
      || "Membership update rejected by Platform protocol";
    updatePublicState({
      network,
      identities: publicIdentitiesFromSecret(secret),
      contract,
      membershipUpdate: {
        at: new Date().toISOString(),
        status: "rejected",
        attempted: "reviewerC -> reviewerD",
        before: beforeGroup ? groupToObject(beforeGroup) : null,
        error: message,
        note: "Platform rejected changing group membership through a data-contract update; this is the current live test result for mutable groups.",
      },
      runs: publicState.runs || [],
    });
    console.log("Membership update rejected by Platform protocol.");
    console.log(message);
  }
});
