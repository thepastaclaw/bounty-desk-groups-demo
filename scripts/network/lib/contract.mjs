import {
  AuthorizedActionTakers,
  ChangeControlRules,
  DataContract,
  Group,
  TokenConfiguration,
  TokenConfigurationConvention,
  TokenConfigurationLocalization,
  TokenDistributionRules,
  TokenKeepsHistoryRules,
  TokenMarketplaceRules,
  TokenTradeMode,
} from "@dashevo/evo-sdk";

export const TOKEN_POSITION = 0;
export const GROUP_POSITION = 0;

export const BOUNTY_SCHEMAS = {
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

export function groupMembersMap(...identityIds) {
  return new Map(identityIds.map((id) => [id, 1]));
}

export function createReviewGroup(identityIds) {
  return new Group(groupMembersMap(...identityIds), 2);
}

export function createBountyTokenConfiguration(ownerId) {
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
  const lockedRules = new ChangeControlRules({
    authorizedToMakeChange: noOne,
    adminActionTakers: noOne,
  });

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

export async function buildBountyContract({ sdk, ownerId, reviewerIds }) {
  const identityNonce = await sdk.identities.nonce(ownerId);
  const dataContract = new DataContract({
    ownerId,
    identityNonce: (identityNonce || 0n) + 1n,
    schemas: BOUNTY_SCHEMAS,
    tokens: {
      [TOKEN_POSITION]: createBountyTokenConfiguration(ownerId),
    },
    fullValidation: true,
  });
  dataContract.groups = {
    [GROUP_POSITION]: createReviewGroup(reviewerIds),
  };
  return dataContract;
}
