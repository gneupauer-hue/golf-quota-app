import { calculateNextQuota } from "@/lib/quota";
import { formatDisplayDate, getRoundDisplayDate } from "@/lib/utils";

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

export type RebuiltQuotaHistoryRound = Omit<QuotaHistoryRoundInput, "startQuota" | "plusMinus" | "nextQuota"> & {
  startQuota: number;
  plusMinus: number;
  nextQuota: number;
  quotaMovement: number;
};

export type PlayerQuotaValidationInput<T extends QuotaHistoryRoundInput = QuotaHistoryRoundInput> = {
  playerId: string;
  playerName: string;
  startingQuota?: number | null;
  currentQuota?: number | null;
  rounds: T[];
};

export type QuotaValidationIssue = {
  playerId: string;
  playerName: string;
  roundId: string | null;
  roundLabel: string;
  fieldLabel: string;
  expected: string;
  actual: string;
  expectedQuota: number | null;
  actualQuota: number | null;
};

export type QuotaValidationSummary = {
  totalPlayersChecked: number;
  totalRoundsChecked: number;
  mismatchCount: number;
  issues: QuotaValidationIssue[];
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
  return getDateValue(round.completedAt) ?? getDateValue(round.roundDate) ?? getDateValue(round.createdAt) ?? 0;
}

function getRoundLabel(round: {
  roundName?: string | null;
  roundDate?: string | Date | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
}) {
  return formatDisplayDate(
    getRoundDisplayDate({
      roundName: round.roundName,
      roundDate: round.roundDate,
      completedAt: round.completedAt,
      createdAt: round.createdAt
    })
  );
}

function formatSignedValue(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

function buildRoundIssue(args: {
  playerId: string;
  playerName: string;
  round: QuotaHistoryRoundInput | null;
  fieldLabel: string;
  expected: string;
  actual: string;
  expectedQuota?: number | null;
  actualQuota?: number | null;
}): QuotaValidationIssue {
  return {
    playerId: args.playerId,
    playerName: args.playerName,
    roundId: args.round?.roundId ?? null,
    roundLabel: args.round ? getRoundLabel(args.round) : "Current quota",
    fieldLabel: args.fieldLabel,
    expected: args.expected,
    actual: args.actual,
    expectedQuota: args.expectedQuota ?? null,
    actualQuota: args.actualQuota ?? null
  };
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
    const calculated = calculateNextQuota(runningQuota, round.totalPoints);
    const rebuiltRound: RebuiltQuotaHistoryRound = {
      ...round,
      startQuota: runningQuota,
      plusMinus: calculated.plusMinus,
      nextQuota: calculated.nextQuota,
      quotaMovement: calculated.nextQuota - runningQuota
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

export function validatePlayerQuotaHistory<T extends QuotaHistoryRoundInput>(
  input: PlayerQuotaValidationInput<T>
) {
  const rebuilt = rebuildPlayerQuotaHistory(input);
  const chronologicalRounds = [...input.rounds].sort((left, right) => {
    return getRoundSortValue(left) - getRoundSortValue(right);
  });
  const issues: QuotaValidationIssue[] = [];

  chronologicalRounds.forEach((round, index) => {
    const rebuiltRound = rebuilt.roundsAscending[index];
    if (!rebuiltRound) {
      return;
    }

    if (round.startQuota !== rebuiltRound.startQuota) {
      issues.push(
        buildRoundIssue({
          playerId: input.playerId,
          playerName: input.playerName,
          round,
          fieldLabel: "Starting quota",
          expected: `${rebuiltRound.startQuota}`,
          actual: `${round.startQuota}`,
          expectedQuota: rebuiltRound.startQuota,
          actualQuota: round.startQuota
        })
      );
    }

    if (round.plusMinus !== rebuiltRound.plusMinus) {
      issues.push(
        buildRoundIssue({
          playerId: input.playerId,
          playerName: input.playerName,
          round,
          fieldLabel: "Result vs quota",
          expected: formatSignedValue(rebuiltRound.plusMinus),
          actual: formatSignedValue(round.plusMinus)
        })
      );
    }

    if (round.nextQuota - round.startQuota !== rebuiltRound.quotaMovement) {
      issues.push(
        buildRoundIssue({
          playerId: input.playerId,
          playerName: input.playerName,
          round,
          fieldLabel: "Quota adjustment",
          expected: formatSignedValue(rebuiltRound.quotaMovement),
          actual: formatSignedValue(round.nextQuota - round.startQuota)
        })
      );
    }

    if (round.nextQuota !== rebuiltRound.nextQuota) {
      issues.push(
        buildRoundIssue({
          playerId: input.playerId,
          playerName: input.playerName,
          round,
          fieldLabel: "New quota",
          expected: `${rebuiltRound.nextQuota}`,
          actual: `${round.nextQuota}`,
          expectedQuota: rebuiltRound.nextQuota,
          actualQuota: round.nextQuota
        })
      );
    }
  });

  if (input.currentQuota != null && rebuilt.currentQuota !== input.currentQuota) {
    issues.push(
      buildRoundIssue({
        playerId: input.playerId,
        playerName: input.playerName,
        round: rebuilt.latestRound,
        fieldLabel: "Current quota",
        expected: `${rebuilt.currentQuota}`,
        actual: `${input.currentQuota}`,
        expectedQuota: rebuilt.currentQuota,
        actualQuota: input.currentQuota
      })
    );
  }

  return {
    rebuilt,
    issues,
    roundsChecked: chronologicalRounds.length
  };
}

export function validateAllPlayerQuotas<T extends QuotaHistoryRoundInput>(
  players: Array<PlayerQuotaValidationInput<T>>
): QuotaValidationSummary {
  const results = players.map((player) => validatePlayerQuotaHistory(player));
  const totalRoundsChecked = results.reduce((sum, result) => sum + result.roundsChecked, 0);
  const issues = results.flatMap((result) => result.issues);
  const summary = {
    totalPlayersChecked: players.length,
    totalRoundsChecked,
    mismatchCount: issues.length,
    issues
  } satisfies QuotaValidationSummary;

  if (summary.mismatchCount > 0) {
    console.warn("[quota-audit] mismatches found", {
      totalPlayersChecked: summary.totalPlayersChecked,
      totalRoundsChecked: summary.totalRoundsChecked,
      mismatchCount: summary.mismatchCount,
      issues: summary.issues
    });
  } else {
    console.warn("[quota-audit] validation passed", {
      totalPlayersChecked: summary.totalPlayersChecked,
      totalRoundsChecked: summary.totalRoundsChecked,
      mismatchCount: 0
    });
  }

  return summary;
}
