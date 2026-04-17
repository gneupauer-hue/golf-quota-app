import { SectionCard } from "@/components/section-card";
import { formatPlusMinus, type TeamCode } from "@/lib/quota";
import { classNames } from "@/lib/utils";

type LeaderboardScoreboardProps = {
  round: {
    id: string;
    roundName: string;
    roundMode: "MATCH_QUOTA" | "SKINS_ONLY";
    completedAt: string | null;
  };
  teamStandings?: Array<{
    team: TeamCode;
    players: string[];
    frontPlusMinus: number;
    backPlusMinus: number;
    totalPlusMinus: number;
    frontPoints: number;
    backPoints: number;
    totalPoints: number;
  }>;
  entries?: Array<{
    playerId: string;
    playerName: string;
    team: TeamCode | null;
    frontNine: number;
    backNine: number;
    totalPoints: number;
    plusMinus: number;
    rank: number;
  }>;
  leaders?: {
    frontTeam: { team: TeamCode; frontPlusMinus: number } | null;
    backTeam: { team: TeamCode; backPlusMinus: number } | null;
    totalTeam: { team: TeamCode; totalPlusMinus: number } | null;
    leaderGroup: Array<{ playerName: string; plusMinus: number }>;
    payoutGroup: Array<{ playerName: string; plusMinus: number }>;
  };
};

function entryTone(rank: number, plusMinus: number) {
  if (plusMinus < 0) return "border-[#D7655D] bg-[#FCE5E2]";
  if (rank === 1) return "border-[#5A9764] bg-[#E2F4E6]";
  if (rank === 2) return "border-[#D5B154] bg-[#FFF1BF]";
  if (rank === 3) return "border-[#D37A47] bg-[#FCE0D2]";
  return "border-[color:var(--club-card-border)] bg-white";
}

export function LeaderboardScoreboard({
  round,
  teamStandings,
  entries,
  leaders
}: LeaderboardScoreboardProps) {
  const safeTeams = Array.isArray(teamStandings) ? teamStandings : [];
  const safeEntries = Array.isArray(entries) ? entries : [];
  const isSkinsOnly = round.roundMode === "SKINS_ONLY";
  const hasTeamData = isSkinsOnly || safeTeams.length > 0;
  const hasPlayerData = safeEntries.length > 0;
  const hasScoreboardData = hasTeamData && hasPlayerData;

  console.info("[scoreboard] leaderboard-scoreboard", {
    round,
    teamData: safeTeams,
    playerScores: safeEntries.map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      team: entry.team,
      frontNine: entry.frontNine,
      backNine: entry.backNine,
      totalPoints: entry.totalPoints,
      plusMinus: entry.plusMinus,
      rank: entry.rank
    }))
  });

  if (!hasScoreboardData) {
    return (
      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
          Scoreboard
        </p>
        <div className="rounded-[22px] border border-[color:var(--club-card-border)] bg-[color:var(--club-card)] px-4 py-4">
          <p className="text-sm font-semibold text-ink">Scoreboard unavailable</p>
          <p className="mt-1 text-xs text-ink/65">
            Team or player result data is missing for this round.
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
          Scoreboard
        </p>
        <h3 className="mt-1 text-xl font-semibold text-ink">
          {round.completedAt ? "Final round results" : "Live standings"}
        </h3>
        <p className="mt-1 text-sm text-ink/65">
          {round.completedAt
            ? "Final team and player standings for this round."
            : "Current team and player standings for the active round."}
        </p>
      </div>

      {!isSkinsOnly ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
            Team Results
          </p>
          {safeTeams.length ? (
            safeTeams.map((team) => {
              const frontWinner = leaders?.frontTeam?.team === team.team;
              const backWinner = leaders?.backTeam?.team === team.team;
              const totalWinner = leaders?.totalTeam?.team === team.team;

              return (
                <div
                  key={team.team}
                  className={classNames(
                    "rounded-[22px] border px-4 py-4",
                    totalWinner
                      ? "border-[#5A9764] bg-[#E2F4E6]"
                      : "border-[color:var(--club-card-border)] bg-white"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-ink">{`Team ${team.team}`}</p>
                      <p className="mt-1 text-xs text-ink/65">{team.players.join(", ")}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {frontWinner ? (
                        <span className="club-pill">Front Winner</span>
                      ) : null}
                      {backWinner ? (
                        <span className="club-pill">Back Winner</span>
                      ) : null}
                      {totalWinner ? (
                        <span className="club-pill">Total Winner</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { label: "Front", points: team.frontPoints, value: team.frontPlusMinus },
                      { label: "Back", points: team.backPoints, value: team.backPlusMinus },
                      { label: "Total", points: team.totalPoints, value: team.totalPlusMinus }
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl bg-[color:var(--club-card)] px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">
                          {item.label}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-ink">
                          {formatPlusMinus(item.value)}
                        </p>
                        <p className="mt-1 text-xs text-ink/60">{`${item.points} pts`}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[22px] border border-[color:var(--club-card-border)] bg-[color:var(--club-card)] px-4 py-4">
              <p className="text-sm font-semibold text-ink">Scoreboard unavailable</p>
              <p className="mt-1 text-xs text-ink/65">
                Team results are missing for this round.
              </p>
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
          Player Standings
        </p>
        {safeEntries.length ? (
          safeEntries.map((entry) => (
            <div
              key={entry.playerId}
              className={classNames("rounded-[22px] border px-4 py-4", entryTone(entry.rank, entry.plusMinus))}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-ink">{entry.playerName}</p>
                  <p className="mt-1 text-xs text-ink/65">
                    {isSkinsOnly
                      ? `Rank ${entry.rank}`
                      : `Rank ${entry.rank} | Team ${entry.team ?? "-"}`}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">+/-</p>
                  <p className="mt-1 text-xl font-semibold text-ink">
                    {formatPlusMinus(entry.plusMinus)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white/80 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Front</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{entry.frontNine}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Back</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{entry.backNine}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{entry.totalPoints}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-[color:var(--club-card-border)] bg-[color:var(--club-card)] px-4 py-4">
            <p className="text-sm font-semibold text-ink">Scoreboard unavailable</p>
            <p className="mt-1 text-xs text-ink/65">
              Player standings are missing for this round.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
