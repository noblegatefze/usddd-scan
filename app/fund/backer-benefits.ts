export type BackerBadge = "legacy_backer" | "backer" | "legacy" | "explorer";
export type BackerBonus = {
  kind: "legacy_backer" | "legacy_explorer" | "first_new_backing";
  practiceUsddd: 50 | 25 | 10;
};

type BackerEligibility = {
  legacyAccount: boolean;
  fundedBeforeTransition: boolean;
  firstFundingConfirmedAfterTransition: boolean;
};

export function getBackerBenefits({
  legacyAccount,
  fundedBeforeTransition,
  firstFundingConfirmedAfterTransition,
}: BackerEligibility): { badge: BackerBadge; eligibleBonuses: BackerBonus[] } {
  if (legacyAccount && fundedBeforeTransition) {
    return { badge: "legacy_backer", eligibleBonuses: [{ kind: "legacy_backer", practiceUsddd: 50 }] };
  }

  const eligibleBonuses: BackerBonus[] = [];
  if (legacyAccount) eligibleBonuses.push({ kind: "legacy_explorer", practiceUsddd: 25 });
  if (firstFundingConfirmedAfterTransition && !fundedBeforeTransition) {
    eligibleBonuses.push({ kind: "first_new_backing", practiceUsddd: 10 });
    return { badge: "backer", eligibleBonuses };
  }

  return { badge: legacyAccount ? "legacy" : "explorer", eligibleBonuses };
}
