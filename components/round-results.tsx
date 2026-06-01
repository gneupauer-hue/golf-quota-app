"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import type { QuotaValidationSummary } from "@/lib/quota-history";
import {
  calculatePayoutAudit,
  calculateFinalPayoutSummary,
  formatPayoutAuditStatus,
  formatPlusMinus,
  goodSkinTypeLabels,
  holeNumbers,
  type GoodSkinEntry,
  type GoodSkinType,
  type TeamCode
} from "@/lib/quota";
import { classNames, formatDisplayDate, getRoundDisplayDate } from "@/lib/utils";

type ResultsData = {
  round: {
    id: string;
    roundName: string;
    roundDate: Date | string;
    roundMode: "MATCH_QUOTA" | "SKINS_ONLY";
    scoringEntryMode?: "QUICK" | "DETAILED";
    isTestRound?: boolean;
    isPayoutLocked: boolean;
    paidPlayerIds: string[];
    notes: string | null;
    createdAt?: Date | string | null;
    completedAt: Date | string | null;
    canEditFinalizedRound?: boolean;
    finalizedEditBlockedReason?: string | null;
  };
  entries: Array<{
    id: string;
    playerId: string;
    playerName: string;
    team: TeamCode | null;
    groupNumber?: number | null;
    teeTime?: string | null;
    holeScores: Array<number | null>;
    goodSkinEntries: GoodSkinEntry[];
    startQuota: number;
    frontQuota: number;
    backQuota: number;
    frontNine: number;
    backNine: number;
    frontPlusMinus: number;
    backPlusMinus: number;
    totalPoints: number;
    plusMinus: number;
    nextQuota: number;
    rank: number;
  }>;
  teamStandings: Array<{
    team: TeamCode;
    players: string[];
    frontPoints: number;
    backPoints: number;
    totalPoints: number;
    frontQuota: number;
    backQuota: number;
    totalQuota: number;
    frontPlusMinus: number;
    backPlusMinus: number;
    totalPlusMinus: number;
  }>;
  leaders: {
    frontTeam: { team: TeamCode; frontPlusMinus: number } | null;
    backTeam: { team: TeamCode; backPlusMinus: number } | null;
    totalTeam: { team: TeamCode; totalPlusMinus: number } | null;
  };
  money: {
    overallPot: {
      playerCount: number;
      totalPot: number;
      teamPot: number;
      frontPot: number;
      backPot: number;
      totalTeamPot: number;
      indyPot: number;
      skinsPot: number;
      placesPaid: number;
    };
    individualPayouts: Array<{
      playerId: string;
      playerName: string;
      rank: number;
      plusMinus: number;
      totalPoints: number;
      tied: boolean;
      placeLabel: string;
      payout: number;
    }>;
    individualRankings: Array<{
      playerId: string;
      playerName: string;
      rank: number;
      plusMinus: number;
      totalPoints: number;
      startQuota: number;
      tied: boolean;
    }>;
    skins: {
      totalPot: number;
      totalSkinSharesWon: number;
      valuePerSkin: number;
      totalDistributed: number;
      leftover: number;
      holes: Array<{
        holeNumber: number;
        carryover: boolean;
        skinAwarded: boolean;
        winnerPlayerId: string | null;
        winnerName: string | null;
      }>;
    };
  };
  storedSkinHoles?: Array<{
    holeNumber: number;
    eligibleNames: string | null;
    skinAwarded: boolean;
    winnerPlayerId: string | null;
    winnerName: string | null;
  }>;
  quotaAudit?: QuotaValidationSummary;
};

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  featured?: boolean;
  children: React.ReactNode;
};

type AllSkinEntry = {
  playerId: string;
  playerName: string;
  holeNumber: number;
  type: GoodSkinType | null;
  score: number;
  typeLabel: string;
};

type RoundCorrectionRow = {
  playerId: string;
  playerName: string;
  team: TeamCode | null;
  groupNumber: number | null;
  frontNineText: string;
  backNineText: string;
  goodSkinEntries: GoodSkinEntry[];
  activeSkinType: GoodSkinType | null;
};

const goodSkinTypeOrder: GoodSkinType[] = ["birdie", "eagle", "ace"];

const allSkinGroupTitles: Record<GoodSkinType, string> = {
  birdie: "Birdies",
  eagle: "Eagles",
  ace: "Hole-in-Ones"
};

function getGoodSkinScore(type: GoodSkinType) {
  if (type === "ace") return 8;
  if (type === "eagle") return 6;
  return 4;
}

function parseStoredSkinNames(value: string | null | undefined, winnerName: string | null | undefined) {
  const names = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (!names.length && winnerName) {
    names.push(winnerName);
  }

  return [...new Set(names)];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function teamCardTone(isWinner: boolean) {
  return isWinner ? "border-[#7A1E2C] bg-[#FBF7F0]" : "border-ink/10 bg-canvas";
}

function formatQuotaResult(value: number) {
  return value === 0 ? "Even" : formatPlusMinus(value);
}

function formatGoodSkins(entries: GoodSkinEntry[]) {
  return entries.length
    ? entries.map((entry) => `Hole ${entry.holeNumber} - ${goodSkinTypeLabels[entry.type]}`).join(", ")
    : "None";
}

function getGoodSkinTypeClasses(label: string) {
  if (label === "Hole-in-One") return "bg-[#1B6B3A] text-white";
  if (label === "Eagle") return "bg-[#4A0F1A] text-white";
  if (label === "Birdie") return "bg-[#FBF7F0] text-pine";
  return "bg-[#FBF7F0] text-pine";
}

function formatOrdinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function buildIndyRankings<T extends { playerId: string; playerName: string; startQuota: number; totalPoints: number; plusMinus: number }>(rows: T[]) {
  const sorted = [...rows].sort((left, right) => {
    if (right.plusMinus !== left.plusMinus) {
      return right.plusMinus - left.plusMinus;
    }

    if (right.totalPoints !== left.totalPoints) {
      return right.totalPoints - left.totalPoints;
    }

    return left.playerName.localeCompare(right.playerName);
  });

  let previousKey = "";
  let currentRank = 0;

  return sorted.map((row, index) => {
    const rankKey = `${row.plusMinus}:${row.totalPoints}`;
    if (rankKey !== previousKey) {
      currentRank = index + 1;
      previousKey = rankKey;
    }

    return {
      ...row,
      rank: currentRank
    };
  });
}

function ResultStatCard({
  title,
  value,
  detail
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[18px] border border-mist bg-card px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/45">{title}</p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-pine">{value}</p>
      {detail ? <p className="mt-1.5 text-sm font-medium text-ink/65">{detail}</p> : null}
    </div>
  );
}

function CollapsibleSection({ title, subtitle, badge, defaultOpen = false, featured = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <SectionCard className={classNames("overflow-hidden px-0 py-0 shadow-sm", featured ? "border border-[#1B6B3A]/25 bg-[#FFF8F9]" : "border border-mist bg-card")}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className={classNames("font-extrabold uppercase tracking-[0.12em]", featured ? "text-xl text-[#4A0F1A]" : "text-lg text-[#4A0F1A]")}>{title}</p>
            {badge ? (
              <span className={classNames("rounded-full px-3 py-1 text-xs font-bold", featured ? "bg-[#1B6B3A] text-white" : "bg-canvas text-ink/70")}>
                {badge}
              </span>
            ) : null}
          </div>
          <div className={classNames("mt-2 h-1 w-16 rounded-full", featured ? "bg-[#1B6B3A]" : "bg-[#4A0F1A]/25")} />
          {subtitle ? <p className="mt-2 text-sm font-medium text-ink/65">{subtitle}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-ink/60">
          {open ? "Collapse" : "Expand"}
        </span>
      </button>
      <div
        className={classNames(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-ink/10 px-4 py-4">{children}</div>
        </div>
      </div>
    </SectionCard>
  );
}

function QuotaAuditWarning({ quotaAudit }: { quotaAudit?: QuotaValidationSummary }) {
  const showAdminQuotaAudit = process.env.NODE_ENV !== "production";

  if (!showAdminQuotaAudit || !quotaAudit || quotaAudit.mismatchCount === 0) {
    return null;
  }

  return (
    <SectionCard className="border border-danger/20 bg-[#FCE5E2] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-danger/80">
        Quota Audit Warning
      </p>
      <p className="mt-1 text-sm text-ink/80">
        {`Quota audit warning: ${quotaAudit.mismatchCount} mismatch${quotaAudit.mismatchCount === 1 ? "" : "es"} found.`}
      </p>
    </SectionCard>
  );
}

export function RoundResults({ data }: { data: ResultsData }) {
  const router = useRouter();
  const [isDeletingTestRound, setIsDeletingTestRound] = useState(false);
  const [testRoundMessage, setTestRoundMessage] = useState<string | null>(null);
  const [skinOverridesByPlayerId, setSkinOverridesByPlayerId] = useState<Record<string, GoodSkinEntry[]>>({});
  const [isSkinEditorOpen, setIsSkinEditorOpen] = useState(false);
  const [skinEditorPlayerId, setSkinEditorPlayerId] = useState(data.entries[0]?.playerId ?? "");
  const [skinEditorHole, setSkinEditorHole] = useState("1");
  const [skinEditorType, setSkinEditorType] = useState<GoodSkinType>("birdie");
  const [skinEditorMessage, setSkinEditorMessage] = useState<string | null>(null);
  const [isSavingSkins, setIsSavingSkins] = useState(false);
  const [isRoundEditOpen, setIsRoundEditOpen] = useState(false);
  const [roundEditRows, setRoundEditRows] = useState<RoundCorrectionRow[]>([]);
  const [roundEditMessage, setRoundEditMessage] = useState<string | null>(null);
  const [isSavingRoundCorrections, setIsSavingRoundCorrections] = useState(false);
  const isIndividualQuotaSkins = data.round.roundMode === "SKINS_ONLY";
  const isTestRound = Boolean(data.round.isTestRound);
  const canEditSkins = !data.round.completedAt;
  const canEditFinalizedRound = Boolean(data.round.canEditFinalizedRound);
  const displayEntries = data.entries.map((entry) => ({
    ...entry,
    goodSkinEntries: skinOverridesByPlayerId[entry.playerId] ?? entry.goodSkinEntries
  }));
  const payoutSummary = calculateFinalPayoutSummary(data.entries, data.round.roundMode);
  const payoutAudit = calculatePayoutAudit(data.entries, data.round.roundMode);
  const displayRoundDate = getRoundDisplayDate({
    roundName: data.round.roundName,
    roundDate: data.round.roundDate,
    completedAt: data.round.completedAt,
    createdAt: data.round.createdAt
  });
  const indyCashers = data.money.individualPayouts.filter((player) => player.payout > 0);
  const indyRankings = buildIndyRankings(
    data.entries.map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      startQuota: entry.startQuota,
      totalPoints: entry.totalPoints,
      plusMinus: entry.plusMinus
    }))
  );
  const indyPayoutsByPlayerId = new Map(
    data.money.individualPayouts.map((player) => [player.playerId, player.payout])
  );
  const indyWinnerIds = new Set(indyCashers.map((player) => player.playerId));
  const goodSkins = data.money.skins.holes.filter((hole) => hole.skinAwarded && hole.winnerName);
  const typedAllSkins = displayEntries
    .flatMap((entry) =>
      entry.goodSkinEntries.map((skinEntry) => ({
        holeNumber: skinEntry.holeNumber,
        type: skinEntry.type,
        score: skinEntry.score,
        typeLabel: goodSkinTypeLabels[skinEntry.type] ?? "Skin",
        playerId: entry.playerId,
        playerName: entry.playerName
      }))
    );
  const storedFallbackSkins =
    typedAllSkins.length > 0
      ? []
      : (data.storedSkinHoles ?? []).flatMap((hole) =>
          parseStoredSkinNames(hole.eligibleNames, hole.winnerName).map((playerName, index) => ({
            playerId: hole.winnerPlayerId && playerName === hole.winnerName
              ? hole.winnerPlayerId
              : `stored-skin-${hole.holeNumber}-${index}-${playerName}`,
            playerName,
            holeNumber: hole.holeNumber,
            type: null,
            score: 0,
            typeLabel: "Skin"
          }))
        );
  const allSkins = [...typedAllSkins, ...storedFallbackSkins].sort(
    (left, right) =>
      (left.type == null ? 999 : goodSkinTypeOrder.indexOf(left.type)) -
        (right.type == null ? 999 : goodSkinTypeOrder.indexOf(right.type)) ||
      left.holeNumber - right.holeNumber ||
      left.playerName.localeCompare(right.playerName)
  );
  const goodSkinTypeByPlayerHole = new Map<string, string>();
  for (const entry of displayEntries) {
    for (const skinEntry of entry.goodSkinEntries) {
      goodSkinTypeByPlayerHole.set(`${entry.playerId}:${skinEntry.holeNumber}`, goodSkinTypeLabels[skinEntry.type] ?? "Skin");
    }
  }

  async function deleteTestRound() {
    if (!isTestRound || isDeletingTestRound) {
      return;
    }

    const confirmed = window.confirm(
      "Delete Test Round\n\nThis will remove the test round. Real quotas were not changed."
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingTestRound(true);
    setTestRoundMessage(null);

    try {
      const response = await fetch(`/api/rounds/${data.round.id}?force=1`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not delete test round.");
      }

      router.push("/current-round");
      router.refresh();
    } catch (error) {
      setTestRoundMessage(error instanceof Error ? error.message : "Could not delete test round.");
      setIsDeletingTestRound(false);
    }
  }

  async function savePlayerSkinEntries(playerId: string, nextEntries: GoodSkinEntry[]) {
    if (!canEditSkins || isSavingSkins) {
      return;
    }

    setIsSavingSkins(true);
    setSkinEditorMessage(null);

    try {
      const response = await fetch(`/api/rounds/${data.round.id}/skins`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          goodSkinEntries: nextEntries
        })
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        goodSkinEntries?: GoodSkinEntry[];
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not update skins.");
      }

      setSkinOverridesByPlayerId((current) => ({
        ...current,
        [playerId]: payload?.goodSkinEntries ?? nextEntries
      }));
      setSkinEditorMessage("Skins updated. Payouts recalculated.");
      router.refresh();
    } catch (error) {
      setSkinEditorMessage(error instanceof Error ? error.message : "Could not update skins.");
    } finally {
      setIsSavingSkins(false);
    }
  }

  function addSkinEntry() {
    const player = displayEntries.find((entry) => entry.playerId === skinEditorPlayerId);
    const holeNumber = Number(skinEditorHole);

    if (!player || !Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      setSkinEditorMessage("Choose a player, hole, and skin type.");
      return;
    }

    const nextEntries = [
      ...player.goodSkinEntries.filter((entry) => entry.holeNumber !== holeNumber),
      {
        holeNumber,
        type: skinEditorType,
        score: getGoodSkinScore(skinEditorType)
      }
    ].sort((left, right) => left.holeNumber - right.holeNumber);

    void savePlayerSkinEntries(player.playerId, nextEntries);
  }

  function removeSkinEntry(entryToRemove: AllSkinEntry) {
    const player = displayEntries.find((entry) => entry.playerId === entryToRemove.playerId);

    if (!player) {
      return;
    }

    void savePlayerSkinEntries(
      player.playerId,
      player.goodSkinEntries.filter((entry) => entry.holeNumber !== entryToRemove.holeNumber)
    );
  }

  function openRoundEditMode() {
    setRoundEditMessage(null);

    if (!canEditFinalizedRound) {
      setRoundEditMessage(
        data.round.finalizedEditBlockedReason ??
          "Only the most recent finalized round can be edited right now to protect quota history."
      );
      return;
    }

    const confirmed = window.confirm(
      "Editing a finalized round will recalculate results, payouts, and quota history."
    );

    if (!confirmed) {
      return;
    }

    setRoundEditRows(
      displayEntries.map((entry) => ({
        playerId: entry.playerId,
        playerName: entry.playerName,
        team: entry.team,
        groupNumber: entry.groupNumber ?? null,
        frontNineText: String(isIndividualQuotaSkins ? entry.totalPoints : entry.frontNine),
        backNineText: String(isIndividualQuotaSkins ? "" : entry.backNine),
        goodSkinEntries: entry.goodSkinEntries,
        activeSkinType: null
      }))
    );
    setIsRoundEditOpen(true);
  }

  function updateRoundEditText(playerId: string, field: "frontNineText" | "backNineText", value: string) {
    setRoundEditRows((current) =>
      current.map((row) => (row.playerId === playerId ? { ...row, [field]: value } : row))
    );
  }

  function setRoundEditSkinType(playerId: string, type: GoodSkinType, active: boolean) {
    setRoundEditRows((current) =>
      current.map((row) => {
        if (row.playerId !== playerId) {
          return row;
        }

        return {
          ...row,
          activeSkinType: active ? type : row.activeSkinType === type ? null : row.activeSkinType,
          goodSkinEntries: active
            ? row.goodSkinEntries
            : row.goodSkinEntries.filter((entry) => entry.type !== type)
        };
      })
    );
  }

  function toggleRoundEditSkinHole(playerId: string, type: GoodSkinType, holeNumber: number) {
    setRoundEditRows((current) =>
      current.map((row) => {
        if (row.playerId !== playerId) {
          return row;
        }

        const currentEntry = row.goodSkinEntries.find((entry) => entry.holeNumber === holeNumber);
        const nextEntries =
          currentEntry?.type === type
            ? row.goodSkinEntries.filter((entry) => entry.holeNumber !== holeNumber)
            : [
                ...row.goodSkinEntries.filter((entry) => entry.holeNumber !== holeNumber),
                {
                  holeNumber,
                  type,
                  score: getGoodSkinScore(type)
                }
              ];

        return {
          ...row,
          goodSkinEntries: nextEntries.sort((left, right) => left.holeNumber - right.holeNumber)
        };
      })
    );
  }

  async function saveRoundCorrections() {
    if (isSavingRoundCorrections) {
      return;
    }

    setIsSavingRoundCorrections(true);
    setRoundEditMessage(null);

    try {
      const response = await fetch(`/api/rounds/${data.round.id}/corrections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: roundEditRows.map((row) => ({
            playerId: row.playerId,
            frontNine: row.frontNineText,
            backNine: isIndividualQuotaSkins ? null : row.backNineText,
            goodSkinEntries: row.goodSkinEntries
          }))
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save round corrections.");
      }

      setRoundEditMessage("Round corrections saved. Results and quota history recalculated.");
      setIsRoundEditOpen(false);
      setSkinOverridesByPlayerId({});
      router.refresh();
    } catch (error) {
      setRoundEditMessage(error instanceof Error ? error.message : "Could not save round corrections.");
    } finally {
      setIsSavingRoundCorrections(false);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <PageTitle
        title={isTestRound ? "TEST RESULTS \u2014 quotas not updated" : "Results"}
        subtitle={`Completed ${formatDisplayDate(displayRoundDate)}`}
      />
      <Link
        href="/past-games"
        className="inline-flex min-h-11 items-center rounded-2xl border border-ink/10 bg-canvas px-4 py-2 text-sm font-semibold text-ink shadow-sm"
      >
        ← See All Results
      </Link>

      <SectionCard className="border-[#7A1E2C]/20 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#7A1E2C]">
              Finalized Round Corrections
            </p>
            <p className="mt-1 text-sm font-semibold text-ink/65">
              Edit only when a finalized score or skin was entered incorrectly.
            </p>
          </div>
          <button
            type="button"
            onClick={openRoundEditMode}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#7A1E2C] px-4 py-2 text-sm font-extrabold text-white shadow-sm"
          >
            Edit Round
          </button>
        </div>
        {roundEditMessage ? (
          <p
            className={classNames(
              "mt-3 rounded-2xl px-3 py-2 text-sm font-semibold",
              roundEditMessage.includes("saved") ? "bg-[#ECFDF3] text-pine" : "bg-[#FEE2E2] text-[#991B1B]"
            )}
          >
            {roundEditMessage}
          </p>
        ) : null}
      </SectionCard>

      {isTestRound ? (
        <SectionCard className="border-[#7A1E2C]/30 bg-[#FBF7F0]">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#7A1E2C]">
                TEST ROUND
              </p>
              <p className="mt-1 text-sm font-semibold text-ink/75">
                Test results only. Real quotas, official past games, player history, and stats were not updated.
              </p>
            </div>
            <button
              type="button"
              onClick={deleteTestRound}
              disabled={isDeletingTestRound}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-danger/20 bg-white px-4 py-2 text-sm font-extrabold text-danger shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeletingTestRound ? "Deleting Test Round..." : "Delete Test Round"}
            </button>
            <p className="text-xs font-semibold text-ink/60">
              This will remove the test round. Real quotas were not changed.
            </p>
            {testRoundMessage ? (
              <p className="text-sm font-semibold text-danger">{testRoundMessage}</p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <CollapsibleSection
        title="Payout Summary"
        subtitle="Paid players and winning categories."
        badge={formatCurrency(payoutAudit.overallPaidOut)}
        defaultOpen
        featured
      >
        {payoutSummary.players.length ? (
          <div className="space-y-2">
            {payoutSummary.players.map((player) => {
              const categories = [
                { label: "Front", value: player.front },
                { label: "Back", value: player.back },
                { label: "Total", value: player.total },
                { label: "Indy", value: player.indy },
                { label: "Skins", value: player.skins }
              ].filter((category) => category.value > 0);
              const categorySummary = categories
                .map((category) => `${category.label} ${formatCurrency(category.value)}`)
                .join(" • ");

              return (
                <details
                  key={player.playerId}
                  className="group rounded-[18px] border border-[#1B6B3A]/20 bg-card px-3 py-2 shadow-sm [&>summary::-webkit-details-marker]:hidden"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-extrabold text-ink">{player.playerName}</p>
                      <p className="shrink-0 text-base font-extrabold tracking-tight text-[#1B6B3A]">
                        {formatCurrency(player.totalWon)}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-ink/65">{categorySummary}</p>
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink/10 pt-2">
                    {categories.map((category) => (
                      <span
                        key={`${player.playerId}-${category.label}`}
                        className="rounded-full bg-[#FBF7F0] px-2.5 py-1 text-[11px] font-bold text-[#4A0F1A]"
                      >
                        {`${category.label}: ${formatCurrency(category.value)}`}
                      </span>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No payouts were earned in this round.</p>
        )}

        {payoutSummary.skinsLeftover > 0 ? (
          <div className="mt-2 rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Leftover</p>
            <p className="mt-1 text-base font-semibold text-ink">
              {`${formatCurrency(payoutSummary.skinsLeftover)} discretionary / possible bartender tip`}
            </p>
          </div>
        ) : null}
      </CollapsibleSection>

      {!isIndividualQuotaSkins ? (
      <CollapsibleSection
        title="Team Results"
        subtitle="Final front, back, and total team performance."
      >
        {data.teamStandings.length ? (
          <div className="space-y-2">
            {data.teamStandings.map((team) => {
              const winningFront = data.leaders.frontTeam?.team === team.team;
              const winningBack = data.leaders.backTeam?.team === team.team;
              const winningTotal = data.leaders.totalTeam?.team === team.team;
              const winners = [
                winningFront ? "Front" : null,
                winningBack ? "Back" : null,
                winningTotal ? "Total" : null
              ].filter(Boolean);

              return (
                <details
                  key={team.team}
                  className={classNames(
                    "group rounded-[18px] border px-3 py-2 shadow-sm [&>summary::-webkit-details-marker]:hidden",
                    winningTotal ? "border-[#7A1E2C]/30 bg-[#FBF7F0]" : "border-ink/10 bg-canvas"
                  )}
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-extrabold text-ink">{`Team ${team.team}`}</p>
                      <p className="shrink-0 text-base font-extrabold tracking-tight text-[#1B6B3A]">
                        {formatPlusMinus(team.totalPlusMinus)}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-ink/70">{team.players.join(", ")}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-ink/65">
                      {`Front: ${team.frontPoints}/${team.frontQuota} • Back: ${team.backPoints}/${team.backQuota} • Total: ${team.totalPoints}/${team.totalQuota}`}
                    </p>
                    {winners.length ? (
                      <p className="mt-1 text-xs font-bold text-pine">{`Winners: ${winners.join(", ")}`}</p>
                    ) : null}
                  </summary>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-ink/10 pt-2">
                    <div className={classNames("rounded-xl px-2 py-1.5", teamCardTone(winningFront))}>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-ink/45">Front</p>
                      <p className="mt-0.5 text-xs font-bold">{`${team.frontPoints}/${team.frontQuota}`}</p>
                      <p className="text-[11px] font-semibold text-ink/60">{formatPlusMinus(team.frontPlusMinus)}</p>
                    </div>
                    <div className={classNames("rounded-xl px-2 py-1.5", teamCardTone(winningBack))}>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-ink/45">Back</p>
                      <p className="mt-0.5 text-xs font-bold">{`${team.backPoints}/${team.backQuota}`}</p>
                      <p className="text-[11px] font-semibold text-ink/60">{formatPlusMinus(team.backPlusMinus)}</p>
                    </div>
                    <div className={classNames("rounded-xl px-2 py-1.5", teamCardTone(winningTotal))}>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-ink/45">Total</p>
                      <p className="mt-0.5 text-xs font-bold">{`${team.totalPoints}/${team.totalQuota}`}</p>
                      <p className="text-[11px] font-semibold text-ink/60">{formatPlusMinus(team.totalPlusMinus)}</p>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No team results available.</p>
        )}
      </CollapsibleSection>
      ) : null}

      <CollapsibleSection title="Individual Quota Standings" subtitle="Ranked final standings versus quota." badge={`${indyRankings.length} players`}>
        {indyRankings.length ? (
          <div className="space-y-2">
            {indyRankings.map((player) => {
              const isIndyWinner = indyWinnerIds.has(player.playerId);
              const indyPayout = indyPayoutsByPlayerId.get(player.playerId) ?? 0;

              return (
                <div
                  key={player.playerId}
                  className={classNames(
                    "rounded-[22px] border px-4 py-3",
                    isIndyWinner ? "border-[#7A1E2C]/20 bg-[#FBF7F0]" : "border-ink/10 bg-canvas"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#4A0F1A] text-sm font-extrabold text-white">
                        {formatOrdinal(player.rank)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-extrabold text-ink">{player.playerName}</p>
                        <p className="mt-1 text-sm font-semibold text-ink/65">{`${player.totalPoints} pts - ${formatQuotaResult(player.plusMinus)}`}</p>
                      </div>
                    </div>
                    {indyPayout > 0 ? (
                      <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-pine shadow-sm">
                        {formatCurrency(indyPayout)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No Indy results.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Good Skins"
        subtitle="Awarded winners only after tie and carryover resolution."
      >
        {goodSkins.length ? (
          <div className="space-y-2">
            {goodSkins.map((hole) => {
              const typeLabel = hole.winnerPlayerId
                ? goodSkinTypeByPlayerHole.get(`${hole.winnerPlayerId}:${hole.holeNumber}`) ?? "Skin"
                : "Skin";

              return (
                <div
                  key={hole.holeNumber}
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold text-ink">{hole.winnerName}</p>
                    <p className="mt-1 text-sm font-semibold text-ink/60">Skin awarded</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-[#4A0F1A] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white">{`Hole ${hole.holeNumber}`}</span>
                    <span className={classNames("rounded-full px-3 py-1.5 text-xs font-extrabold", getGoodSkinTypeClasses(typeLabel))}>{typeLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No good skins awarded.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="All Skins"
        subtitle="Every recorded birdie, eagle, and hole-in-one for review."
        badge={`${allSkins.length} recorded`}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink/65">
              {canEditSkins
                ? "Review or edit recorded skins before finalizing."
                : "Review only. Editing is disabled after finalizing."}
            </p>
            <button
              type="button"
              onClick={() => {
                setSkinEditorMessage(null);
                setIsSkinEditorOpen(true);
              }}
              disabled={!canEditSkins}
              className="min-h-10 rounded-2xl border border-[#7A1E2C]/20 bg-white px-3 py-2 text-xs font-extrabold text-[#7A1E2C] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit Skins
            </button>
          </div>

          {allSkins.length ? (
            <div className="space-y-3">
              {[...goodSkinTypeOrder, null].map((type) => {
                const typeEntries = allSkins.filter((entry) => entry.type === type);

                if (!typeEntries.length) {
                  return null;
                }

                return (
                  <div key={type ?? "skin"} className="rounded-[18px] border border-ink/10 bg-canvas px-3 py-2">
                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#4A0F1A]">
                      {type == null ? "Skins" : allSkinGroupTitles[type]}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {typeEntries.map((entry) => (
                        <div
                          key={`${entry.playerId}-${entry.holeNumber}-${entry.type ?? "skin"}`}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <p className="min-w-0 truncate font-semibold text-ink">{entry.playerName}</p>
                          <p className="shrink-0 font-bold text-ink/70">{`Hole ${entry.holeNumber} - ${entry.typeLabel}`}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-[18px] border border-ink/10 bg-canvas px-3 py-2 text-sm font-semibold text-ink/65">
              No skins recorded.
            </p>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Pot Summary"
        subtitle="Round pots and paid-player summary."
        badge={`${payoutSummary.players.length} paid`}
      >
        <div className="grid grid-cols-2 gap-2.5">
          {!isIndividualQuotaSkins ? (
            <ResultStatCard
              title="Team Pots"
              value={formatCurrency(data.money.overallPot.teamPot)}
              detail={`${formatCurrency(data.money.overallPot.frontPot)} / ${formatCurrency(data.money.overallPot.backPot)} / ${formatCurrency(data.money.overallPot.totalTeamPot)}`}
            />
          ) : null}
          <ResultStatCard
            title="Indy Pot"
            value={formatCurrency(data.money.overallPot.indyPot)}
            detail={`${data.money.overallPot.placesPaid} places paid`}
          />
          <ResultStatCard
            title="Skins Pot"
            value={formatCurrency(data.money.overallPot.skinsPot)}
            detail={
              data.money.skins.totalSkinSharesWon
                ? `${data.money.skins.totalSkinSharesWon} awarded`
                : "No skins won"
            }
          />
          <ResultStatCard
            title="Total Pot"
            value={formatCurrency(isIndividualQuotaSkins ? payoutAudit.overallPot : data.money.overallPot.totalPot)}
            detail={`${data.money.overallPot.playerCount} players`}
          />
        </div>
      </CollapsibleSection>





      <CollapsibleSection
        title="Skins Pot"
        subtitle="Awarded skins, paid total, and leftover."
        badge={`${data.money.skins.totalSkinSharesWon} awarded`}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Skins Pot" value={formatCurrency(data.money.skins.totalPot)} />
          <ResultStatCard title="Per Skin" value={formatCurrency(data.money.skins.valuePerSkin)} />
          <ResultStatCard title="Total Paid" value={formatCurrency(data.money.skins.totalDistributed)} />
          <ResultStatCard title="Leftover" value={formatCurrency(data.money.skins.leftover)} />
        </div>
      </CollapsibleSection>





      <CollapsibleSection
        title="Pot Check"
        subtitle="Final reconciliation of pots, payouts, skins, and leftover."
        badge={payoutAudit.passed ? "Passed" : "Needs review"}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Front Pot" value={formatCurrency(payoutAudit.frontPot)} />
          <ResultStatCard title="Back Pot" value={formatCurrency(payoutAudit.backPot)} />
          <ResultStatCard title="Total Pot" value={formatCurrency(payoutAudit.totalPot)} />
          <ResultStatCard title="Indy Pot" value={formatCurrency(payoutAudit.indyPot)} />
          <ResultStatCard title="Skins Pot" value={formatCurrency(payoutAudit.skinsPot)} />
          <ResultStatCard title="Overall Pot" value={formatCurrency(payoutAudit.overallPot)} />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Good Skins Awarded" value={`${payoutAudit.goodSkinsAwarded}`} />
          <ResultStatCard title="Per Skin Value" value={formatCurrency(payoutAudit.perSkinValue)} />
          <ResultStatCard title="Total Skins Paid" value={formatCurrency(payoutAudit.skinsPaid)} />
          <ResultStatCard title="Leftover" value={formatCurrency(payoutAudit.leftover)} />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Total Front Paid" value={formatCurrency(payoutAudit.frontPaid)} />
          <ResultStatCard title="Total Back Paid" value={formatCurrency(payoutAudit.backPaid)} />
          <ResultStatCard title="Total Match Paid" value={formatCurrency(payoutAudit.totalMatchPaid)} />
          <ResultStatCard title="Total Indy Paid" value={formatCurrency(payoutAudit.indyPaid)} />
          <ResultStatCard title="Total Skins Paid" value={formatCurrency(payoutAudit.skinsPaid)} />
          <ResultStatCard title="Overall Paid Out" value={formatCurrency(payoutAudit.overallPaidOut)} />
        </div>

        <div className="mt-2.5 space-y-2">
          {payoutAudit.checks.map((check) => (
            <div
              key={check.label}
              className={classNames(
                "rounded-[22px] border px-4 py-3",
                check.passed ? "border-[#7A1E2C]/20 bg-[#FBF7F0]" : "border-danger/20 bg-[#FCE5E2]"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{check.label}</p>
                <p className={classNames("text-sm font-semibold", check.passed ? "text-pine" : "text-danger")}>
                  {formatPayoutAuditStatus(check.label, check.difference)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <QuotaAuditWarning quotaAudit={data.quotaAudit} />

      {isRoundEditOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/45 px-3 pb-3 pt-6 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-[28px] bg-hero shadow-[0_24px_80px_rgba(26,38,59,0.22)]">
            <div className="space-y-4 px-4 pb-4 pt-5 sm:px-5 sm:pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Edit Round</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">Correct finalized scores</h3>
                <p className="mt-1 rounded-2xl bg-[#FEE2E2] px-3 py-2 text-sm font-semibold text-[#991B1B]">
                  Editing a finalized round will recalculate results, payouts, and quota history.
                </p>
              </div>

              <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                {Array.from(
                  roundEditRows.reduce((groups, row) => {
                    const key = row.groupNumber == null ? "Unassigned" : `Group ${row.groupNumber}`;
                    groups.set(key, [...(groups.get(key) ?? []), row]);
                    return groups;
                  }, new Map<string, RoundCorrectionRow[]>())
                ).map(([groupLabel, groupRows]) => (
                  <div key={`round-edit-${groupLabel}`} className="space-y-2">
                    <p className="px-1 text-xs font-extrabold uppercase tracking-[0.18em] text-[#4A0F1A]">
                      {groupLabel}
                    </p>
                    {groupRows.map((row) => (
                      <div key={`round-edit-${row.playerId}`} className="rounded-[18px] border border-ink/10 bg-white/90 px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-extrabold text-ink">{row.playerName}</p>
                          {row.team ? (
                            <span className="rounded-full bg-canvas px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/55">
                              Team {row.team}
                            </span>
                          ) : null}
                        </div>
                        <div className={classNames("mt-2 grid gap-2", isIndividualQuotaSkins ? "grid-cols-1" : "grid-cols-2")}>
                          <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/50">
                            {isIndividualQuotaSkins ? "Total" : "Front"}
                            <input
                              type="number"
                              inputMode="numeric"
                              value={row.frontNineText}
                              onChange={(event) => updateRoundEditText(row.playerId, "frontNineText", event.target.value)}
                              className="mt-1 h-11 w-full rounded-2xl border border-sand bg-white px-3 text-sm font-extrabold text-ink"
                            />
                          </label>
                          {!isIndividualQuotaSkins ? (
                            <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/50">
                              Back
                              <input
                                type="number"
                                inputMode="numeric"
                                value={row.backNineText}
                                onChange={(event) => updateRoundEditText(row.playerId, "backNineText", event.target.value)}
                                className="mt-1 h-11 w-full rounded-2xl border border-sand bg-white px-3 text-sm font-extrabold text-ink"
                              />
                            </label>
                          ) : null}
                        </div>

                        <div className="mt-2 space-y-1.5">
                          {goodSkinTypeOrder.map((type) => {
                            const hasType = row.goodSkinEntries.some((entry) => entry.type === type);
                            const isActiveType = row.activeSkinType === type;
                            const yesSelected = hasType || isActiveType;

                            return (
                              <div key={`${row.playerId}-${type}`} className="grid grid-cols-[4.6rem_1fr] items-center gap-2">
                                <span className="text-[11px] font-bold text-ink/65">
                                  {type === "ace" ? "HIO" : goodSkinTypeLabels[type]}?
                                </span>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    className={classNames(
                                      "min-h-8 rounded-xl border px-2 text-[11px] font-extrabold",
                                      !yesSelected ? "border-[#1B6B3A] bg-[#1B6B3A] text-white" : "border-sand bg-canvas text-ink/70"
                                    )}
                                    onClick={() => setRoundEditSkinType(row.playerId, type, false)}
                                  >
                                    No
                                  </button>
                                  <button
                                    type="button"
                                    className={classNames(
                                      "min-h-8 rounded-xl border px-2 text-[11px] font-extrabold",
                                      yesSelected ? "border-[#1B6B3A] bg-[#1B6B3A] text-white" : "border-sand bg-canvas text-ink/70"
                                    )}
                                    onClick={() => setRoundEditSkinType(row.playerId, type, true)}
                                  >
                                    Yes
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {row.activeSkinType ? (
                          <div className="mt-2 rounded-2xl bg-canvas/80 px-2 py-2">
                            <p className="text-[11px] font-bold text-ink/60">
                              Select {row.activeSkinType === "ace" ? "HIO" : goodSkinTypeLabels[row.activeSkinType]} hole(s)
                            </p>
                            <div className="mt-2 grid grid-cols-9 gap-1.5">
                              {holeNumbers.map((holeNumber) => {
                                const selected = row.goodSkinEntries.some(
                                  (entry) => entry.holeNumber === holeNumber && entry.type === row.activeSkinType
                                );

                                return (
                                  <button
                                    key={`${row.playerId}-${row.activeSkinType}-${holeNumber}`}
                                    type="button"
                                    className={classNames(
                                      "min-h-9 rounded-xl border text-xs font-extrabold",
                                      selected ? "border-[#1B6B3A] bg-[#1B6B3A] text-white" : "border-sand bg-white text-ink/70"
                                    )}
                                    onClick={() => toggleRoundEditSkinHole(row.playerId, row.activeSkinType!, holeNumber)}
                                  >
                                    {holeNumber}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {row.goodSkinEntries.length ? (
                          <p className="mt-2 truncate text-xs font-semibold text-ink/65">
                            {formatGoodSkins(row.goodSkinEntries)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {roundEditMessage ? (
                <p className={classNames("text-sm font-semibold", roundEditMessage.includes("saved") ? "text-pine" : "text-danger")}>
                  {roundEditMessage}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="min-h-12 rounded-2xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                  disabled={isSavingRoundCorrections}
                  onClick={() => setIsRoundEditOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveRoundCorrections}
                  disabled={isSavingRoundCorrections}
                  className="club-btn-primary min-h-12 text-sm disabled:opacity-60"
                >
                  {isSavingRoundCorrections ? "Saving..." : "Save Corrected Round"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isSkinEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/45 px-3 pb-3 pt-6 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-hidden rounded-[28px] bg-hero shadow-[0_24px_80px_rgba(26,38,59,0.22)]">
            <div className="space-y-4 px-4 pb-4 pt-5 sm:px-5 sm:pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">All Skins</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">Edit skins before finalizing</h3>
                <p className="mt-1 text-sm font-semibold text-ink/65">
                  Add missed entries or remove incorrect entries. Winners and payouts recalculate after saving.
                </p>
              </div>

              <div className="grid grid-cols-[1fr_80px] gap-2">
                <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/50">
                  Player
                  <select
                    value={skinEditorPlayerId}
                    onChange={(event) => setSkinEditorPlayerId(event.target.value)}
                    className="mt-1 h-11 w-full rounded-2xl border border-sand bg-white px-3 text-sm font-semibold text-ink"
                  >
                    {displayEntries.map((entry) => (
                      <option key={`skin-player-${entry.playerId}`} value={entry.playerId}>
                        {entry.playerName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/50">
                  Hole
                  <select
                    value={skinEditorHole}
                    onChange={(event) => setSkinEditorHole(event.target.value)}
                    className="mt-1 h-11 w-full rounded-2xl border border-sand bg-white px-3 text-sm font-semibold text-ink"
                  >
                    {Array.from({ length: 18 }, (_, index) => index + 1).map((holeNumber) => (
                      <option key={`skin-hole-${holeNumber}`} value={holeNumber}>
                        {holeNumber}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {goodSkinTypeOrder.map((type) => (
                  <button
                    key={`skin-type-${type}`}
                    type="button"
                    onClick={() => setSkinEditorType(type)}
                    className={classNames(
                      "min-h-11 rounded-2xl border px-2 text-xs font-extrabold",
                      skinEditorType === type
                        ? "border-[#7A1E2C] bg-[#7A1E2C] text-white"
                        : "border-sand bg-white text-ink/70"
                    )}
                  >
                    {type === "ace" ? "HIO" : goodSkinTypeLabels[type]}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={addSkinEntry}
                disabled={isSavingSkins || !canEditSkins}
                className="club-btn-primary min-h-12 w-full text-sm disabled:opacity-60"
              >
                {isSavingSkins ? "Saving..." : "Add Skin Entry"}
              </button>

              <div className="max-h-[30vh] space-y-2 overflow-y-auto pr-1">
                {allSkins.length ? (
                  allSkins.map((entry) => (
                    <div
                      key={`edit-${entry.playerId}-${entry.holeNumber}-${entry.type}`}
                      className="flex items-center justify-between gap-3 rounded-[18px] bg-white/90 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-ink">{entry.playerName}</p>
                        <p className="text-xs font-semibold text-ink/60">
                          {`Hole ${entry.holeNumber} - ${entry.typeLabel}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSkinEntry(entry)}
                        disabled={isSavingSkins || !canEditSkins}
                        className="shrink-0 rounded-2xl border border-danger/20 bg-white px-3 py-2 text-xs font-extrabold text-danger disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[18px] bg-white/90 px-3 py-2 text-sm font-semibold text-ink/65">
                    No skins recorded.
                  </p>
                )}
              </div>

              {skinEditorMessage ? (
                <p className={classNames("text-sm font-semibold", skinEditorMessage.includes("updated") ? "text-pine" : "text-danger")}>
                  {skinEditorMessage}
                </p>
              ) : null}

              <button
                type="button"
                className="min-h-12 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                disabled={isSavingSkins}
                onClick={() => setIsSkinEditorOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Link
        href="/past-games"
        className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-ink/10 bg-canvas px-4 py-2 text-sm font-semibold text-ink shadow-sm"
      >
        ← See All Results
      </Link>
    </div>
  );
}
