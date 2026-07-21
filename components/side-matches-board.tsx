"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { classNames, formatDateInput } from "@/lib/utils";
import { deriveSideMatch, type SideMatchRecord } from "@/lib/side-matches";
import type { CalculatedRoundRow } from "@/lib/quota";

type SideMatchesBoardProps = {
  round:
    | {
        id: string;
        roundName: string;
        roundDate: string;
        roundMode: string;
      }
    | null;
  entries: CalculatedRoundRow[];
  sideMatches: SideMatchRecord[];
  archiveHref: string;
  readOnly?: boolean;
  showHeader?: boolean;
  showArchiveLink?: boolean;
  autoRefresh?: boolean;
};

type MatchFormState = {
  name: string;
  teamAPlayer1: string;
  teamAPlayer2: string;
  teamBPlayer1: string;
  teamBPlayer2: string;
};

const emptyFormState: MatchFormState = {
  name: "",
  teamAPlayer1: "",
  teamAPlayer2: "",
  teamBPlayer1: "",
  teamBPlayer2: ""
};

function holeWinnerClasses(winner: "A" | "B" | "H" | null) {
  if (winner === "A") return "bg-pine text-white";
  if (winner === "B") return "bg-ink text-white";
  if (winner === "H") return "bg-canvas text-ink";
  return "bg-white text-ink/40";
}

function buildDefaultMatchName(
  formState: MatchFormState,
  playerNameById: Map<string, string>
) {
  const teamA = [formState.teamAPlayer1, formState.teamAPlayer2]
    .map((playerId) => playerNameById.get(playerId))
    .filter(Boolean);
  const teamB = [formState.teamBPlayer1, formState.teamBPlayer2]
    .map((playerId) => playerNameById.get(playerId))
    .filter(Boolean);

  return teamA.length >= 1 && teamB.length >= 1 ? `${teamA.join(" / ")} vs ${teamB.join(" / ")}` : "";
}

export function SideMatchesBoard({
  round,
  entries,
  sideMatches,
  archiveHref,
  readOnly = false,
  showHeader = true,
  showArchiveLink = true,
  autoRefresh = true
}: SideMatchesBoardProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [formState, setFormState] = useState<MatchFormState>(emptyFormState);
  const [message, setMessage] = useState("");
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  function toggleExpanded(matchId: string) {
    setExpandedMatches((current) => {
      const next = new Set(current);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  }
  const playerNameById = useMemo(
    () => new Map(entries.map((entry) => [entry.playerId, entry.playerName])),
    [entries]
  );
  const sortedPlayers = useMemo(
    () =>
      [...entries]
        .map((entry) => ({ id: entry.playerId, name: entry.playerName }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [entries]
  );
  const derivedMatches = useMemo(
    () => sideMatches.map((match) => deriveSideMatch(match, entries)),
    [entries, sideMatches]
  );
  const sideMatchMoneyDecided = useMemo(
    () => derivedMatches.reduce((sum, match) => sum + match.payout.teamAWon + match.payout.teamBWon, 0),
    [derivedMatches]
  );

  useEffect(() => {
    if (readOnly || !round || !autoRefresh) {
      return;
    }

    const interval = window.setInterval(() => {
      router.refresh();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [autoRefresh, readOnly, round, router]);

  function openCreateForm() {
    setEditingMatchId(null);
    setFormState(emptyFormState);
    setMessage("");
    setFormOpen(true);
  }

  function openEditForm(match: SideMatchRecord) {
    setEditingMatchId(match.id);
    setFormState({
      name: match.name ?? "",
      teamAPlayer1: match.teamAPlayerIds[0] ?? "",
      teamAPlayer2: match.teamAPlayerIds[1] ?? "",
      teamBPlayer1: match.teamBPlayerIds[0] ?? "",
      teamBPlayer2: match.teamBPlayerIds[1] ?? ""
    });
    setMessage("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingMatchId(null);
    setFormState(emptyFormState);
  }

  const teamAIds = [formState.teamAPlayer1, formState.teamAPlayer2].filter(Boolean);
  const teamBIds = [formState.teamBPlayer1, formState.teamBPlayer2].filter(Boolean);
  const selectedPlayerIds = [...teamAIds, ...teamBIds];
  const hasDuplicatePlayer = new Set(selectedPlayerIds).size !== selectedPlayerIds.length;
  const matchReady = teamAIds.length >= 1 && teamBIds.length >= 1 && !hasDuplicatePlayer;

  async function submitMatch() {
    if (!round) {
      return;
    }

    if (!matchReady) {
      setMessage(hasDuplicatePlayer ? "Each player can only be in the match once." : "Pick at least one player on each side.");
      return;
    }

    const payload = {
      name: formState.name.trim() || buildDefaultMatchName(formState, playerNameById),
      teamAPlayerIds: teamAIds,
      teamBPlayerIds: teamBIds
    };

    startTransition(async () => {
      try {
        const response = await fetch(
          editingMatchId
            ? `/api/rounds/${round.id}/side-matches/${editingMatchId}`
            : `/api/rounds/${round.id}/side-matches`,
          {
            method: editingMatchId ? "PUT" : "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          }
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not save side match.");
        }

        setMessage(editingMatchId ? "Side match updated." : "Side match added.");
        closeForm();
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save side match.");
      }
    });
  }

  async function deleteMatch(matchId: string) {
    if (!round) {
      return;
    }

    const confirmed = window.confirm("Delete this side match?");
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/rounds/${round.id}/side-matches/${matchId}`, {
          method: "DELETE"
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not delete side match.");
        }

        setMessage("Side match deleted.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not delete side match.");
      }
    });
  }

  if (!round) {
    return (
      <div className="space-y-4">
        {showHeader ? (
          <PageTitle
            title="Side Matches"
            subtitle="Track live 2v2 Nassau side matches for the current round."
          />
        ) : null}
        <SectionCard className="space-y-4 border border-pine/20 bg-[#FBF7F0]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine">No Active Round</p>
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold text-ink">Start a round to use side matches</h3>
            <p className="text-sm text-ink/70">
              Side matches only appear for the current active round. Start the round first, then come here to add live Nassau matches.
            </p>
          </div>
          <Link href="/round-setup" className="club-btn-primary min-h-14">
            Go To Round Setup
          </Link>
        </SectionCard>
        {showArchiveLink ? (
          <div className="pt-1 text-center">
            <Link href={archiveHref} className="text-sm font-semibold text-pine">
              View Archived Side Matches
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader ? (
        <PageTitle
          title="Side Matches"
          subtitle={`${round.roundName} • ${formatDateInput(round.roundDate)}`}
          action={
            readOnly ? null : (
              <button
                type="button"
                onClick={openCreateForm}
                className="min-h-11 rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white"
              >
                Add Side Match
              </button>
            )
          }
        />
      ) : null}

      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              {readOnly ? "Archived Round" : "Current Active Round"}
            </p>
            <h3 className="mt-1 text-xl font-semibold">{round.roundName}</h3>
            <p className="mt-1 text-sm text-ink/65">
              {readOnly
                ? "Final side match results from this completed round."
                : "Side matches live only here while the round is active. Completed rounds move to the archive view."}
            </p>
          </div>
          <div className="rounded-2xl bg-canvas px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Matches</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{sideMatches.length}</p>
          </div>
        </div>
        {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
      </SectionCard>

      {!readOnly && formOpen ? (
        <SectionCard className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
                {editingMatchId ? "Edit Side Match" : "Add Side Match"}
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                {editingMatchId ? "Update 2v2 Nassau match" : "Build a new 2v2 Nassau match"}
              </h3>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="text-sm font-semibold text-ink/55"
            >
              Cancel
            </button>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-ink">Match name</span>
            <input
              value={formState.name}
              onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
              placeholder="Lou & Dave vs Marty & Bobby"
              className="h-12 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Team A Player 1", key: "teamAPlayer1" },
              { label: "Team A Player 2 (optional)", key: "teamAPlayer2" },
              { label: "Team B Player 1", key: "teamBPlayer1" },
              { label: "Team B Player 2 (optional)", key: "teamBPlayer2" }
            ].map((field) => (
              <label key={field.key} className="block">
                <span className="mb-2 block text-sm font-semibold text-ink">{field.label}</span>
                <select
                  value={formState[field.key as keyof MatchFormState]}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      [field.key]: event.target.value
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none"
                >
                  <option value="">Choose player</option>
                  {sortedPlayers.map((player) => (
                    <option key={`${field.key}-${player.id}`} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {hasDuplicatePlayer ? (
            <p className="text-sm font-medium text-danger">Each player can only be in the match once.</p>
          ) : null}
          <p className="text-xs text-ink/60">One player per side for a 1v1, or two per side for a 2v2.</p>

          <button
            type="button"
            onClick={submitMatch}
            disabled={isPending || !matchReady}
            className="club-btn-primary min-h-14 w-full disabled:opacity-45"
          >
            {isPending ? "Saving Match..." : editingMatchId ? "Save Match" : "Save Match"}
          </button>
        </SectionCard>
      ) : null}

      {derivedMatches.length ? (
        <SectionCard className="space-y-1 border border-pine/15 bg-[#FBF7F0]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine">Side Match Money</p>
          <p className="text-sm text-ink/70">Settled separately — not part of the round&apos;s game or quotas.</p>
          <p className="text-lg font-bold text-ink">
            {`$${sideMatchMoneyDecided} decided so far • ${derivedMatches.length} ${derivedMatches.length === 1 ? "match" : "matches"}`}
          </p>
        </SectionCard>
      ) : null}

      {derivedMatches.length ? (
        <div className="space-y-4">
          {derivedMatches.map((match) => {
            const expanded = expandedMatches.has(match.match.id);
            const moneyText =
              match.payout.net === 0
                ? "All square"
                : match.payout.net > 0
                  ? `${match.teamAShortLabel} up $${match.payout.net}`
                  : `${match.teamBShortLabel} up $${Math.abs(match.payout.net)}`;
            return (
            <SectionCard key={match.match.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleExpanded(match.match.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
                    Side Match
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-ink">{match.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-pine">{moneyText}</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink/45">
                    {expanded ? "Tap to collapse ▲" : "Tap for details ▼"}
                  </p>
                </button>
                {!readOnly && expanded ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(match.match)}
                      className="rounded-2xl bg-canvas px-3 py-2 text-xs font-semibold text-ink"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMatch(match.match.id)}
                      className="rounded-2xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger"
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              {expanded ? (
                <>
              <div
                className={classNames(
                  "rounded-[22px] px-4 py-3",
                  match.total.winner === "A"
                    ? "bg-[#EAF6EC]"
                    : match.total.winner === "B"
                      ? "bg-[#FCE5E2]"
                      : "bg-canvas"
                )}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Live Status</p>
                <p className="mt-1 text-base font-bold text-ink">
                  {match.total.notStarted ? "Not started yet" : match.total.summary}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-[22px] bg-canvas px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Team A</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{match.teamAFullLabel}</p>
                </div>
                <div className="rounded-[22px] bg-canvas px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Team B</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{match.teamBFullLabel}</p>
                </div>
              </div>

              <div className="space-y-2">
                {[match.front, match.back, match.total].map((segment) => (
                  <div key={`${match.match.id}-${segment.label}`} className="rounded-[22px] bg-canvas px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{segment.label}</p>
                        <p className="mt-1 text-sm font-semibold text-ink">{segment.summary}</p>
                      </div>
                      <span
                        className={classNames(
                          "rounded-full px-3 py-1.5 text-xs font-semibold",
                          segment.notStarted
                            ? "bg-white text-ink/60"
                            : segment.winner === "A"
                              ? "bg-[#FBF7F0] text-pine"
                              : segment.winner === "B"
                                ? "bg-[#FCE5E2] text-danger"
                                : "bg-white text-ink"
                        )}
                      >
                        {segment.stateText}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[22px] bg-canvas px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Skins</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{match.skins.summary}</p>
                  </div>
                  <span
                    className={classNames(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      match.skins.winner === "A"
                        ? "bg-[#FBF7F0] text-pine"
                        : match.skins.winner === "B"
                          ? "bg-[#FCE5E2] text-danger"
                          : "bg-white text-ink"
                    )}
                  >
                    {`${match.skins.teamACount}-${match.skins.teamBCount}`}
                  </span>
                </div>
              </div>

              <div className="rounded-[22px] bg-ink px-4 py-3 text-white">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">
                    {`Money ($${match.payout.stake} each)`}
                  </p>
                  <p className="text-sm font-bold">
                    {match.payout.net === 0
                      ? "All square"
                      : match.payout.net > 0
                        ? `${match.teamAShortLabel} up $${match.payout.net}`
                        : `${match.teamBShortLabel} up $${Math.abs(match.payout.net)}`}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                  {match.payout.bets.map((bet) => (
                    <div key={`${match.match.id}-bet-${bet.key}`} className="rounded-xl bg-white/10 px-2 py-1.5">
                      <p className="text-[9px] uppercase tracking-[0.1em] text-white/55">{bet.label}</p>
                      <p className="mt-0.5 text-xs font-bold">
                        {!bet.settled ? "–" : bet.winner === "A" ? "A" : bet.winner === "B" ? "B" : "Push"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Hole by Hole</p>
                <div className="overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-1">
                    {match.holes.map((hole) => (
                      <div
                        key={`${match.match.id}-hole-${hole.holeNumber}`}
                        className={classNames(
                          "flex h-12 w-12 flex-col items-center justify-center rounded-2xl text-center",
                          holeWinnerClasses(hole.winner)
                        )}
                      >
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-75">
                          {hole.holeNumber}
                        </p>
                        <p className="mt-0.5 text-sm font-bold">{hole.winner ?? "-"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
                </>
              ) : null}
            </SectionCard>
          );
          })}
        </div>
      ) : (
        <SectionCard className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">No Side Matches Yet</p>
          <p className="text-sm text-ink/65">
            Add a 2v2 Nassau match and it will update automatically from the live hole scores in Current Round.
          </p>
          {!readOnly ? (
            <button type="button" onClick={openCreateForm} className="club-btn-primary min-h-12 w-full">
              Add Side Match
            </button>
          ) : null}
        </SectionCard>
      )}

      {showArchiveLink ? (
        <div className="pt-1 text-center">
          <Link href={archiveHref} className="text-sm font-semibold text-pine">
            View Archived Side Matches
          </Link>
        </div>
      ) : null}
    </div>
  );
}
