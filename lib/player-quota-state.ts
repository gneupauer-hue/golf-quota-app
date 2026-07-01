import { getBaselineQuota2026 } from "@/lib/baseline-quotas-2026";

export type PlayerQuotaFields = {
  quota?: number | null;
  currentQuota?: number | null;
  startingQuota?: number | null;
};

export type PlayerQuotaBaselineInput = PlayerQuotaFields & {
  name: string;
  _count?: { roundEntries?: number };
};

export function buildNewPlayerQuotaFields(quota: number) {
  return {
    quota,
    currentQuota: quota,
    startingQuota: quota
  };
}

export function buildEditedPlayerQuotaFields(quota: number, finalizedRoundCount: number) {
  return {
    quota,
    currentQuota: quota,
    ...(finalizedRoundCount === 0 ? { startingQuota: quota } : {})
  };
}

export function resolveSavedQuota(player: PlayerQuotaFields) {
  return player.currentQuota ?? player.quota ?? player.startingQuota ?? 0;
}

export function resolvePlayerBaselineQuota(player: PlayerQuotaBaselineInput) {
  if (player._count?.roundEntries === 0) {
    return resolveSavedQuota(player);
  }

  return getBaselineQuota2026(player.name) ?? player.startingQuota ?? resolveSavedQuota(player);
}
