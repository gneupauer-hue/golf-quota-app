export type QuotaHistoryRoundInput = {
  roundId: string;
  roundName: string;
  roundDate: string | Date;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  totalPoints: number;
  startQuota: number;
  plusMinus: number;
  nextQuota: number;
};

export type RebuiltQuotaHistoryRound = QuotaHistoryRoundInput & {
  startQuota: number;
  nextQuota: number;
  quotaMovement: number;
};

function getDateValue(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getRoundSortValue(round: {
  completedAt?: string | Date | null;
  roundDate?: string | Date | null;
  createdAt?: string | Date | null;
}) {
  return (
    getDateValue(round.completedAt) ??
    getDateValue(round.roundDate) ??
    getDateValue(round.createdAt) ??
    0
  );
}

function getQuotaMovement(round: Pick<QuotaHistoryRoundInput, "startQuota" | "nextQuota">) {
  return round.nextQuota - round.startQuota;
}

export function rebuildPlayerQuotaHistory<T extends QuotaHistoryRoundInput>(input: {
  startingQuota?: number | null;
  currentQuota?: number | null;
  rounds: T[];
}) {
  const chronologicalRounds = [...input.rounds].sort((left, right) => {
    return getRoundSortValue(left) - getRoundSortValue(right);
  });

  const fallbackBaseQuota = chronologicalRounds[0]?.startQuota ?? input.currentQuota ?? 0;
  const baseQuota = input.startingQuota ?? fallbackBaseQuota;

  let runningQuota = baseQuota;

  const rebuiltChronological = chronologicalRounds.map((round) => {
    const quotaMovement = getQuotaMovement(round);
    const rebuiltRound: RebuiltQuotaHistoryRound = {
      ...round,
      startQuota: runningQuota,
      nextQuota: runningQuota + quotaMovement,
      quotaMovement
    };

    runningQuota = rebuiltRound.nextQuota;
    return rebuiltRound;
  });

  const latestRound = rebuiltChronological[rebuiltChronological.length - 1] ?? null;

  return {
    baseQuota,
    currentQuota: rebuiltChronological.length
      ? runningQuota
      : (input.currentQuota ?? input.startingQuota ?? 0),
    latestRound,
    roundsAscending: rebuiltChronological,
    roundsDescending: [...rebuiltChronological].reverse()
  };
}
