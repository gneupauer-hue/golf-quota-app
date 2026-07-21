import type { CalculatedRoundRow } from "@/lib/quota";

export type SideMatchRecord = {
  id: string;
  roundId: string;
  name: string | null;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  createdAt: string;
};

export type SideMatchHoleWinner = "A" | "B" | "H" | null;

export type SideMatchHoleResult = {
  holeNumber: number;
  winner: SideMatchHoleWinner;
  teamABetterBall: number | null;
  teamBBetterBall: number | null;
  complete: boolean;
};

export type SideMatchSegmentStatus = {
  label: "Front" | "Back" | "Total";
  summary: string;
  stateText: string;
  completedHoles: number;
  holesRemaining: number;
  lead: number;
  winner: "A" | "B" | null;
  finished: boolean;
  notStarted: boolean;
};

export type DerivedSideMatch = {
  match: SideMatchRecord;
  title: string;
  teamAFullLabel: string;
  teamBFullLabel: string;
  teamAShortLabel: string;
  teamBShortLabel: string;
  holes: SideMatchHoleResult[];
  front: SideMatchSegmentStatus;
  back: SideMatchSegmentStatus;
  total: SideMatchSegmentStatus;
  skins: SideMatchSkinsStatus;
  payout: SideMatchPayout;
};

export const DEFAULT_SIDE_MATCH_STAKE = 5;

// Skins bet: count each team's birdies + eagles + aces (each = 1 skin, summed
// across the 2 partners). Higher total wins the stake; equal is a push.
export type SideMatchSkinsStatus = {
  teamACount: number;
  teamBCount: number;
  winner: "A" | "B" | null;
  settled: boolean;
  summary: string;
};

export type SideMatchBetKey = "front" | "back" | "total" | "skins";

export type SideMatchBetResult = {
  key: SideMatchBetKey;
  label: string;
  stake: number;
  winner: "A" | "B" | null; // null = push or not yet decided
  settled: boolean;
};

export type SideMatchPayout = {
  stake: number;
  bets: SideMatchBetResult[];
  teamAWon: number;
  teamBWon: number;
  net: number; // > 0: team A up by net; < 0: team B up by |net|
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function joinNames(names: string[]) {
  return names.join(" / ");
}

function formatMatchTitle(name: string | null, teamA: string[], teamB: string[]) {
  return name?.trim() ? name.trim() : `${joinNames(teamA)} vs ${joinNames(teamB)}`;
}

function getHoleResult(
  playerRowsById: Map<string, CalculatedRoundRow>,
  teamAPlayerIds: string[],
  teamBPlayerIds: string[],
  holeIndex: number
): SideMatchHoleResult {
  const teamAHoles = teamAPlayerIds.map((playerId) => playerRowsById.get(playerId)?.holeScores[holeIndex] ?? null);
  const teamBHoles = teamBPlayerIds.map((playerId) => playerRowsById.get(playerId)?.holeScores[holeIndex] ?? null);

  if (teamAHoles.some((score) => score == null) || teamBHoles.some((score) => score == null)) {
    return {
      holeNumber: holeIndex + 1,
      winner: null,
      teamABetterBall: null,
      teamBBetterBall: null,
      complete: false
    };
  }

  const teamABetterBall = Math.max(...teamAHoles.map((score) => score ?? Number.NEGATIVE_INFINITY));
  const teamBBetterBall = Math.max(...teamBHoles.map((score) => score ?? Number.NEGATIVE_INFINITY));

  return {
    holeNumber: holeIndex + 1,
    winner:
      teamABetterBall === teamBBetterBall ? "H" : teamABetterBall > teamBBetterBall ? "A" : "B",
    teamABetterBall,
    teamBBetterBall,
    complete: true
  };
}

function buildSegmentStatus({
  label,
  holes,
  teamAShortLabel,
  teamBShortLabel
}: {
  label: "Front" | "Back" | "Total";
  holes: SideMatchHoleResult[];
  teamAShortLabel: string;
  teamBShortLabel: string;
}): SideMatchSegmentStatus {
  const completedHoles = holes.filter((hole) => hole.complete);
  const segmentLength = holes.length;

  if (!completedHoles.length) {
    return {
      label,
      summary: label === "Back" ? "Not started" : `${label} match not started`,
      stateText: "NS",
      completedHoles: 0,
      holesRemaining: segmentLength,
      lead: 0,
      winner: null,
      finished: false,
      notStarted: true
    };
  }

  const teamAWins = completedHoles.filter((hole) => hole.winner === "A").length;
  const teamBWins = completedHoles.filter((hole) => hole.winner === "B").length;
  const lead = teamAWins - teamBWins;
  const winner = lead > 0 ? "A" : lead < 0 ? "B" : null;
  const leaderLabel = winner === "A" ? teamAShortLabel : teamBShortLabel;
  const holesRemaining = segmentLength - completedHoles.length;
  const absLead = Math.abs(lead);
  const throughLabel = label === "Total" ? `${completedHoles.length}` : `${completedHoles.length}`;
  const labelLower = label.toLowerCase();

  if (holesRemaining === 0) {
    if (!winner) {
      return {
        label,
        summary: `${label} ended all square`,
        stateText: "AS",
        completedHoles: completedHoles.length,
        holesRemaining,
        lead: 0,
        winner: null,
        finished: true,
        notStarted: false
      };
    }

    return {
      label,
      summary: `${leaderLabel} won the ${labelLower} ${absLead} up`,
      stateText: `${winner} won ${absLead} up`,
      completedHoles: completedHoles.length,
      holesRemaining,
      lead,
      winner,
      finished: true,
      notStarted: false
    };
  }

  if (winner && absLead > holesRemaining) {
    return {
      label,
      summary: `${leaderLabel} won the ${labelLower} ${absLead} and ${holesRemaining}`,
      stateText: `${winner} won ${absLead}&${holesRemaining}`,
      completedHoles: completedHoles.length,
      holesRemaining,
      lead,
      winner,
      finished: true,
      notStarted: false
    };
  }

  if (winner && absLead === holesRemaining) {
    return {
      label,
      summary:
        label === "Total"
          ? `Total match is dormie ${absLead} through ${throughLabel}`
          : `${leaderLabel} are dormie ${absLead} on the ${labelLower}`,
      stateText: `${winner} dormie ${absLead}`,
      completedHoles: completedHoles.length,
      holesRemaining,
      lead,
      winner,
      finished: false,
      notStarted: false
    };
  }

  if (!winner) {
    return {
      label,
      summary: `${label} match is all square through ${throughLabel}`,
      stateText: `AS thru ${throughLabel}`,
      completedHoles: completedHoles.length,
      holesRemaining,
      lead: 0,
      winner: null,
      finished: false,
      notStarted: false
    };
  }

  return {
    label,
    summary:
      label === "Total"
        ? `${leaderLabel} are ${absLead} up for the total through ${throughLabel}`
        : `${leaderLabel} are ${absLead} up on the ${labelLower} with ${holesRemaining} to play`,
    stateText:
      label === "Total"
        ? `${winner} ${absLead} up thru ${throughLabel}`
        : `${winner} ${absLead} up`,
    completedHoles: completedHoles.length,
    holesRemaining,
    lead,
    winner,
    finished: false,
    notStarted: false
  };
}

// A "skin" is a birdie or better, read straight from the per-hole points
// (4 = birdie, 6 = eagle). In hole-by-hole scoring these derive automatically —
// no separate birdie/eagle/ace entry needed.
function countHoleSkins(row: CalculatedRoundRow): number {
  return row.holeScores.reduce<number>(
    (count, score) => (score != null && score >= 4 ? count + 1 : count),
    0
  );
}

function buildSkinsStatus(
  teamARows: CalculatedRoundRow[],
  teamBRows: CalculatedRoundRow[],
  teamAShortLabel: string,
  teamBShortLabel: string,
  settled: boolean
): SideMatchSkinsStatus {
  const teamACount = teamARows.reduce((sum, row) => sum + countHoleSkins(row), 0);
  const teamBCount = teamBRows.reduce((sum, row) => sum + countHoleSkins(row), 0);
  const winner = teamACount > teamBCount ? "A" : teamBCount > teamACount ? "B" : null;
  const summary = winner
    ? `${winner === "A" ? teamAShortLabel : teamBShortLabel} win skins ${Math.max(teamACount, teamBCount)}-${Math.min(teamACount, teamBCount)}`
    : `Skins tied ${teamACount}-${teamBCount}`;
  return { teamACount, teamBCount, winner, settled, summary };
}

function buildPayout(
  stake: number,
  front: SideMatchSegmentStatus,
  back: SideMatchSegmentStatus,
  total: SideMatchSegmentStatus,
  skins: SideMatchSkinsStatus
): SideMatchPayout {
  const bets: SideMatchBetResult[] = [
    { key: "front", label: "Front", stake, winner: front.finished ? front.winner : null, settled: front.finished },
    { key: "back", label: "Back", stake, winner: back.finished ? back.winner : null, settled: back.finished },
    { key: "total", label: "Total", stake, winner: total.finished ? total.winner : null, settled: total.finished },
    { key: "skins", label: "Skins", stake, winner: skins.settled ? skins.winner : null, settled: skins.settled }
  ];
  let teamAWon = 0;
  let teamBWon = 0;
  for (const bet of bets) {
    if (!bet.settled || !bet.winner) {
      continue;
    }
    if (bet.winner === "A") {
      teamAWon += bet.stake;
    } else {
      teamBWon += bet.stake;
    }
  }
  return { stake, bets, teamAWon, teamBWon, net: teamAWon - teamBWon };
}

export function deriveSideMatch(
  match: SideMatchRecord,
  rows: CalculatedRoundRow[],
  stake: number = DEFAULT_SIDE_MATCH_STAKE
): DerivedSideMatch {
  const playerRowsById = new Map(rows.map((row) => [row.playerId, row]));
  const teamARows = match.teamAPlayerIds
    .map((playerId) => playerRowsById.get(playerId))
    .filter(Boolean) as CalculatedRoundRow[];
  const teamBRows = match.teamBPlayerIds
    .map((playerId) => playerRowsById.get(playerId))
    .filter(Boolean) as CalculatedRoundRow[];
  const teamAFullNames = teamARows.map((row) => row.playerName);
  const teamBFullNames = teamBRows.map((row) => row.playerName);
  const teamAShortNames = teamAFullNames.map(firstName);
  const teamBShortNames = teamBFullNames.map(firstName);
  const holes = Array.from({ length: 18 }, (_, holeIndex) =>
    getHoleResult(playerRowsById, match.teamAPlayerIds, match.teamBPlayerIds, holeIndex)
  );

  const shortA = teamAShortNames.join(" / ");
  const shortB = teamBShortNames.join(" / ");
  const front = buildSegmentStatus({ label: "Front", holes: holes.slice(0, 9), teamAShortLabel: shortA, teamBShortLabel: shortB });
  const back = buildSegmentStatus({ label: "Back", holes: holes.slice(9, 18), teamAShortLabel: shortA, teamBShortLabel: shortB });
  const total = buildSegmentStatus({ label: "Total", holes, teamAShortLabel: shortA, teamBShortLabel: shortB });
  const skins = buildSkinsStatus(teamARows, teamBRows, shortA, shortB, total.finished);
  const payout = buildPayout(stake, front, back, total, skins);

  return {
    match,
    title: formatMatchTitle(match.name, teamAFullNames, teamBFullNames),
    teamAFullLabel: joinNames(teamAFullNames),
    teamBFullLabel: joinNames(teamBFullNames),
    teamAShortLabel: teamAShortNames.join(" and "),
    teamBShortLabel: teamBShortNames.join(" and "),
    holes,
    front,
    back,
    total,
    skins,
    payout
  };
}
