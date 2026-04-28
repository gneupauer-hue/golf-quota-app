"use client";

import { useMemo, useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import type { QuotaValidationSummary } from "@/lib/quota-history";
import { classNames, formatDisplayDate, getRoundDisplayDate } from "@/lib/utils";

type PlayerHistoryItem = {
  roundId: string;
  roundName: string;
  roundDate: string | Date;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  totalPoints: number;
  startQuota: number;
  plusMinus: number;
  nextQuota: number;
  quotaMovement: number;
};

type PlayerItem = {
  id: string;
  name: string;
  quota: number;
  isRegular: boolean;
  isActive: boolean;
  conflictIds: string[];
  history: PlayerHistoryItem[];
};

type BaselineQuotaRow = {
  playerName: string;
  baselineQuota: number;
};

type CurrentQuotaAuditIssue = {
  roundLabel: string;
  fieldLabel: string;
  expected: string;
  actual: string;
};

type CurrentQuotaRow = {
  id: string;
  name: string;
  quota: number;
  baselineQuota: number;
  persistedCurrentQuota: number;
  mismatchCount: number;
  auditIssues: CurrentQuotaAuditIssue[];
  history: PlayerHistoryItem[];
  lastRoundPlayed: string;
};

function getLatestQuotaChange(history: PlayerHistoryItem[]) {
  return history[0]?.quotaMovement ?? null;
}

type FormState = {
  id?: string;
  name: string;
  quota: string;
  isRegular: boolean;
  isActive: boolean;
  conflictIds: string[];
};

const emptyForm: FormState = {
  name: "",
  quota: "",
  isRegular: true,
  isActive: true,
  conflictIds: []
};

function formatSignedValue(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

function formatQuotaResult(value: number) {
  return value === 0 ? "Even" : formatSignedValue(value);
}

function formatMovement(value: number | null) {
  if (value == null) {
    return "-";
  }

  return value === 0 ? "0" : formatSignedValue(value);
}

function getLatestRound(player: PlayerItem) {
  return player.history[0] ?? null;
}

function getRoundDateLabel(round: PlayerHistoryItem | null) {
  if (!round) {
    return "No rounds yet";
  }

  return formatDisplayDate(
    getRoundDisplayDate({
      roundName: round.roundName,
      roundDate: round.roundDate,
      completedAt: round.completedAt,
      createdAt: round.createdAt
    })
  );
}

function getLastRoundLabel(player: PlayerItem) {
  return getRoundDateLabel(getLatestRound(player));
}

function getStartingQuotaLastRound(player: PlayerItem) {
  const latestRound = getLatestRound(player);
  return latestRound ? latestRound.startQuota : null;
}

function getLastAdjustmentLabel(player: PlayerItem) {
  const latestRound = getLatestRound(player);
  if (!latestRound) {
    return "No history yet";
  }

  return `${formatMovement(latestRound.quotaMovement)} on ${getRoundDateLabel(latestRound)}`;
}

function getRoundsThisYear(player: PlayerItem) {
  const currentYear = new Date().getFullYear();

  return player.history.filter((item) => {
    const displayDate = getRoundDisplayDate({
      roundName: item.roundName,
      roundDate: item.roundDate,
      completedAt: item.completedAt,
      createdAt: item.createdAt
    });
    const parsed =
      displayDate instanceof Date ? displayDate.getTime() : Date.parse(displayDate);
    return !Number.isNaN(parsed) && new Date(parsed).getFullYear() === currentYear;
  }).length;
}

function ReferenceSection({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <SectionCard className="overflow-hidden px-0 py-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/50">{title}</p>
          <p className="mt-1 text-sm text-ink/65">{subtitle}</p>
        </div>
        <span className="shrink-0 pt-0.5 text-xs font-semibold text-ink/55">
          {open ? "Tap to collapse" : "Click to expand"}
        </span>
      </button>
      <div
        className={classNames(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-ink/10 px-4 py-3">{children}</div>
        </div>
      </div>
    </SectionCard>
  );
}

function QuotaAuditWarning({
  quotaAudit,
  canManage,
  isRepairPending,
  onRepair
}: {
  quotaAudit: QuotaValidationSummary;
  canManage: boolean;
  isRepairPending: boolean;
  onRepair: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (quotaAudit.mismatchCount === 0 || !canManage) {
    return null;
  }

  return (
    <SectionCard className="border border-danger/20 bg-[#FCE5E2] p-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-danger/80">
            Baseline Quota Warning
          </p>
          <p className="text-sm text-ink/80">
            {`Quota mismatch detected - consider rebuild from baseline. ${quotaAudit.mismatchCount} mismatch${quotaAudit.mismatchCount === 1 ? "" : "es"} found.`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="club-btn-secondary min-h-11 text-sm"
            onClick={() => setShowDetails((current) => !current)}
          >
            {showDetails ? "Hide Details" : "View Details"}
          </button>
          <button
            type="button"
            disabled={isRepairPending}
            className="club-btn-primary min-h-11 text-sm disabled:opacity-60"
            onClick={onRepair}
          >
            {isRepairPending ? "Rebuilding..." : "Rebuild Quotas From Baseline"}
          </button>
        </div>

        {showDetails ? (
          <div className="space-y-2">
            {quotaAudit.issues.map((issue, index) => (
              <div
                key={`${issue.playerId}-${issue.roundId ?? "current"}-${issue.fieldLabel}-${index}`}
                className="rounded-2xl bg-white/80 px-3 py-3 text-sm text-ink/80"
              >
                <p className="font-semibold text-ink">{issue.playerName}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-danger/80">
                  {issue.roundLabel}
                </p>
                <p className="mt-1">{issue.fieldLabel}</p>
                <p className="mt-1 text-danger">{`Expected ${issue.expected}, found ${issue.actual}.`}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function PlayersManager({
  initialPlayers,
  initialQuotaAudit,
  initialBaselineRows,
  initialCurrentQuotaRows
}: {
  initialPlayers: PlayerItem[];
  initialQuotaAudit: QuotaValidationSummary;
  initialBaselineRows: BaselineQuotaRow[];
  initialCurrentQuotaRows: CurrentQuotaRow[];
}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [quotaAudit, setQuotaAudit] = useState(initialQuotaAudit);
  const [baselineRows] = useState(initialBaselineRows);
  const [currentQuotaRows, setCurrentQuotaRows] = useState(initialCurrentQuotaRows);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isEditUnlocked, setIsEditUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [pendingEditPlayer, setPendingEditPlayer] = useState<PlayerItem | null>(null);
  const [pendingUnlockAction, setPendingUnlockAction] = useState<"repair" | null>(null);
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [openHistoryPlayerId, setOpenHistoryPlayerId] = useState<string | null>(null);
  const [openCurrentQuotaPlayerId, setOpenCurrentQuotaPlayerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRepairPending, startRepairTransition] = useTransition();
  const hasPlayers = players.length > 0;
  const showAdminQuotaAudit = process.env.NODE_ENV !== "production" || isEditUnlocked;

  const groupedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (a.isRegular !== b.isRegular) {
        return a.isRegular ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }, [players]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const shouldShowPlayerResults = normalizedSearchQuery.length >= 2;

  const filteredPlayers = useMemo(() => {
    if (!shouldShowPlayerResults) {
      return [];
    }

    return groupedPlayers.filter((player) => player.name.toLowerCase().includes(normalizedSearchQuery));
  }, [groupedPlayers, normalizedSearchQuery, shouldShowPlayerResults]);

  const playerSections = useMemo(() => {
    const sections = new Map<string, PlayerItem[]>();

    for (const player of filteredPlayers) {
      const normalized = player.name.trim().charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(normalized) ? normalized : "#";
      const existing = sections.get(letter);

      if (existing) {
        existing.push(player);
      } else {
        sections.set(letter, [player]);
      }
    }

    return Array.from(sections.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([letter, items]) => ({ letter, items }));
  }, [filteredPlayers]);

  const availableLetters = useMemo(
    () => playerSections.map((section) => section.letter),
    [playerSections]
  );
  function applyPlayersResponse(result: {
  players: PlayerItem[];
  quotaAudit: QuotaValidationSummary;
  currentQuotaRows?: CurrentQuotaRow[];
  message?: string;
}) {
  setPlayers(result.players);
  setQuotaAudit(result.quotaAudit);
  if (result.currentQuotaRows) {
    setCurrentQuotaRows(result.currentQuotaRows);
  }
  if (result.message) {
    setMessage(result.message);
  }
}

  function openCreateEditor() {
    setForm(emptyForm);
    setIsManageOpen(false);
    setIsEditorOpen(true);
    setMessage("");
  }

  function openEditorForPlayer(player: PlayerItem) {
    setForm({
      id: player.id,
      name: player.name,
      quota: String(player.quota),
      isRegular: player.isRegular,
      isActive: player.isActive,
      conflictIds: player.conflictIds
    });
    setIsManageOpen(false);
    setIsEditorOpen(true);
    setMessage("");
  }

  function requestEditAccess(player: PlayerItem | null = null) {
    if (!isEditUnlocked) {
      setPendingEditPlayer(player);
      setPasswordInput("");
      setPasswordMessage("");
      setIsUnlockOpen(true);
      return false;
    }

    return true;
  }

  function openPlayerManagement() {
    if (!requestEditAccess()) {
      return;
    }

    setIsManageOpen(true);
    setMessage("");
  }

  function handleEdit(player: PlayerItem) {
    if (!requestEditAccess(player)) {
      return;
    }

    openEditorForPlayer(player);
  }

  function toggleHistory(playerId: string) {
    setOpenHistoryPlayerId((current) => (current === playerId ? null : playerId));
  }

  function toggleCurrentQuotaDetails(playerId: string) {
    setOpenCurrentQuotaPlayerId((current) => (current === playerId ? null : playerId));
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setForm(emptyForm);
  }

  function closeManagement() {
    setIsManageOpen(false);
  }

  function closeUnlock() {
    setIsUnlockOpen(false);
    setPendingEditPlayer(null);
    setPasswordInput("");
    setPasswordMessage("");
  }

  function handleUnlockEdit() {
    startTransition(async () => {
      try {
        setPasswordMessage("");
        const response = await fetch("/api/players/unlock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ password: passwordInput })
        });
        const result = await response.json();

        if (!response.ok) {
          setPasswordMessage(result.error ?? "Incorrect password.");
          return;
        }

        setIsEditUnlocked(true);
        const playerToEdit = pendingEditPlayer;
        const unlockAction = pendingUnlockAction;
        closeUnlock();
        if (unlockAction === "repair") {
          handleRepairQuotas();
          return;
        }
        if (playerToEdit) {
          openEditorForPlayer(playerToEdit);
        } else {
          setIsManageOpen(true);
        }
      } catch (error) {
        setPasswordMessage(error instanceof Error ? error.message : "Could not unlock editing.");
      }
    });
  }

  function handleRepairQuotas() {
    startRepairTransition(async () => {
      try {
        setMessage("");
        const response = await fetch("/api/players/recalculate-quotas", {
          method: "POST"
        });
        const result = await response.json();

        if (!response.ok) {
          setMessage(result.error ?? "Could not rebuild quotas from baseline.");
          return;
        }

        applyPlayersResponse(result);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not rebuild quotas from baseline.");
      }
    });
  }
function handleRepairButtonPress() {
    if (showAdminQuotaAudit) {
      handleRepairQuotas();
      return;
    }

    setPendingEditPlayer(null);
    setPendingUnlockAction("repair");
    setPasswordInput("");
    setPasswordMessage("");
    setIsUnlockOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (form.id && !isEditUnlocked) {
      setMessage("Unlock quota editing before saving changes.");
      return;
    }

    startTransition(async () => {
      const payload = {
        name: form.name.trim(),
        quota: Number(form.quota),
        isRegular: form.isRegular,
        isActive: form.isActive,
        conflictIds: form.conflictIds
      };

      const response = await fetch(form.id ? `/api/players/${form.id}` : "/api/players", {
        method: form.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Could not save player.");
        return;
      }

      applyPlayersResponse(result);
      setIsEditorOpen(false);
      setForm(emptyForm);
      setIsManageOpen(true);
      setMessage(form.id ? "Player updated" : "Player added");
    });
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Players" />

      <QuotaAuditWarning
        quotaAudit={quotaAudit}
        canManage={showAdminQuotaAudit}
        isRepairPending={isRepairPending}
        onRepair={handleRepairQuotas}
      />

      {!hasPlayers ? (
        <SectionCard className="p-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-ink">No players yet</h3>
              <p className="text-sm leading-6 text-ink/75">
                Add players here to build the live roster and keep quota tracking ready to use.
              </p>
            </div>

            <button
              type="button"
              className="club-btn-primary min-h-12 w-full text-base"
              onClick={openCreateEditor}
            >
              Add Player
            </button>

            {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
          </div>
        </SectionCard>
      ) : null}

      {hasPlayers ? (
        <>
          <SectionCard className="p-4">
            <div className="space-y-3">
              <label className="block">
                <span className="sr-only">Search players</span>
                <input
                  type="search"
                  className="club-input h-12 px-4 text-sm"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>

              {shouldShowPlayerResults && availableLetters.length > 1 ? (
                <div className="flex flex-wrap gap-1.5">
                  {availableLetters.map((letter) => (
                    <a
                      key={letter}
                      href={"#players-letter-" + letter}
                      className="rounded-full border border-mist bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/65"
                    >
                      {letter}
                    </a>
                  ))}
                </div>
              ) : null}

              {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
            </div>
          </SectionCard>

          <div className="space-y-3">
            {!shouldShowPlayerResults ? (
              <SectionCard className="p-4">
                <p className="text-sm text-ink/70">Type at least 2 characters to search players.</p>
              </SectionCard>
            ) : null}

            {shouldShowPlayerResults && playerSections.length === 0 ? (
              <SectionCard className="p-4">
                <p className="text-sm text-ink/70">No players found.</p>
              </SectionCard>
            ) : null}

            {playerSections.map((section) => (
              <div key={section.letter} id={"players-letter-" + section.letter} className="space-y-2">
                <div className="px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">
                    {section.letter}
                  </p>
                </div>

                <div className="space-y-2">
                  {section.items.map((player) => {
                    const isHistoryOpen = openHistoryPlayerId === player.id;

                    return (
                      <SectionCard key={player.id} className="p-2">
                        <div className="space-y-1.5">
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-semibold leading-5 text-ink">{player.name}</h3>
                            <div className="mt-1 grid gap-x-3 gap-y-0 text-[12px] leading-5 text-ink/72 sm:grid-cols-2">
                              <p>
                                Current quota: <span className="font-semibold text-ink">{player.quota}</span>
                              </p>
                              <p>
                                Previous quota: <span className="font-semibold text-ink">{getStartingQuotaLastRound(player) ?? "-"}</span>
                              </p>
                              <p>
                                Last adjustment: <span className="font-semibold text-ink">{getLastAdjustmentLabel(player)}</span>
                              </p>
                              <p>
                                Rounds this year: <span className="font-semibold text-ink">{getRoundsThisYear(player)}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <p className="text-[12px] text-ink/55">
                              Last played: <span className="font-medium text-ink/75">{getLastRoundLabel(player)}</span>
                            </p>
                            <button
                              className="club-btn-primary min-h-9 px-3.5 text-sm"
                              type="button"
                              onClick={() => toggleHistory(player.id)}
                            >
                              {isHistoryOpen ? "Hide History" : "See History"}
                            </button>
                          </div>

                          {isHistoryOpen ? (
                            <div className="rounded-[20px] border border-ink/10 bg-canvas px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">
                                  Round History
                                </p>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/70">
                                  {player.history.length} {player.history.length === 1 ? "round" : "rounds"}
                                </span>
                              </div>

                              {player.history.length ? (
                                <div className="mt-2 space-y-2">
                                  {player.history.map((item) => (
                                    <div key={player.id + "-" + item.roundId} className="rounded-2xl bg-white px-3 py-2.5 shadow-sm">
                                      <p className="text-sm font-semibold text-ink">
                                        {formatDisplayDate(
                                          getRoundDisplayDate({
                                            roundName: item.roundName,
                                            roundDate: item.roundDate,
                                            completedAt: item.completedAt,
                                            createdAt: item.createdAt
                                          })
                                        )}
                                      </p>
                                      <p className="mt-1.5 text-sm text-ink/80">{`Points scored: ${item.totalPoints}`}</p>
                                      <p className="mt-1 text-sm text-ink/80">{`Starting quota: ${item.startQuota}`}</p>
                                      <p className="mt-1 text-sm text-ink/80">{`Result vs quota: ${formatQuotaResult(item.plusMinus)}`}</p>
                                      <p className="mt-1 text-sm text-ink/65">{`Quota moved: ${formatMovement(item.quotaMovement)}`}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2.5 text-sm text-ink/65">No rounds yet.</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </SectionCard>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <ReferenceSection
            title="2026 Current Quotas"
            subtitle="Read-only quota snapshot from completed 2026 rounds."
          >
            <div className="space-y-2">
              <button
                type="button"
                disabled={isRepairPending}
                className="club-btn-primary min-h-12 w-full text-base disabled:opacity-60"
                onClick={handleRepairButtonPress}
              >
                {isRepairPending ? "Rebuilding..." : "Rebuild All Quotas From 2026 Baseline"}
              </button>

              {repairDebugLines.length ? (
                <div className="rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/45">Rebuild Debug</p>
                  <div className="mt-2 space-y-1 whitespace-pre-wrap break-words font-mono text-xs text-ink/75">
                    {repairDebugLines.map((line, index) => (
                      <p key={"repair-debug-" + index}>{line}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              {currentQuotaRows.map((row) => {
                const isOpen = openCurrentQuotaPlayerId === row.id;

                return (
                  <div
                    key={row.id}
                    className={classNames(
                      "overflow-hidden rounded-2xl border bg-white",
                      row.mismatchCount > 0 ? "border-danger/30" : "border-mist"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCurrentQuotaDetails(row.id)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 py-3 text-left sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                        {row.mismatchCount > 0 ? (
                          <p className="mt-1 text-xs font-semibold text-danger">
                            {"Audit warning: " + row.mismatchCount + " mismatch" + (row.mismatchCount === 1 ? "" : "es")}
                          </p>
                        ) : null}
                      </div>
                      <span className="justify-self-start rounded-full bg-pine px-3 py-1 text-sm font-bold text-white sm:justify-self-center">
                        {row.quota}
                      </span>
                      <div className="col-span-2 text-right sm:col-span-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">Last updated</p>
                        <p className="mt-1 text-xs text-ink/60">
                          {row.lastRoundPlayed === "-" ? "Baseline only" : row.lastRoundPlayed}
                        </p>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-ink/10 bg-canvas px-4 py-3">
                        <div className="space-y-3">
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/45">
                              2026 baseline quota
                            </p>
                            <p className="mt-1 text-base font-semibold text-ink">{row.baselineQuota}</p>
                            {row.mismatchCount > 0 ? (
                              <p className="mt-2 text-sm text-danger">
                                {"Persisted current quota " + row.persistedCurrentQuota + ", expected " + row.quota + "."}
                              </p>
                            ) : null}
                          </div>

                          {row.auditIssues.length ? (
                            <div className="space-y-2 rounded-2xl border border-danger/20 bg-[#FCE5E2] px-3 py-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-danger/80">
                                Audit mismatches
                              </p>
                              {row.auditIssues.map((issue, index) => (
                                <div key={row.id + "-issue-" + index} className="text-sm text-ink/80">
                                  <p className="font-semibold text-ink">{issue.roundLabel}</p>
                                  <p className="mt-1">{issue.fieldLabel}</p>
                                  <p className="mt-1 text-danger">{"Expected " + issue.expected + ", found " + issue.actual + "."}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {row.history.length ? (
                            <div className="space-y-2">
                              {row.history.map((item) => (
                                <div key={row.id + "-quota-history-" + item.roundId} className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                                  <p className="text-sm font-semibold text-ink">
                                    {formatDisplayDate(
                                      getRoundDisplayDate({
                                        roundName: item.roundName,
                                        roundDate: item.roundDate,
                                        completedAt: item.completedAt,
                                        createdAt: item.createdAt
                                      })
                                    )}
                                  </p>
                                  <p className="mt-2 text-sm text-ink/80">{"Starting quota: " + item.startQuota}</p>
                                  <p className="mt-1 text-sm text-ink/80">{"Points: " + item.totalPoints}</p>
                                  <p className="mt-1 text-sm text-ink/80">{"Result: " + formatQuotaResult(item.plusMinus)}</p>
                                  <p className="mt-1 text-sm text-ink/80">{"Adjustment: " + formatMovement(item.quotaMovement)}</p>
                                  <p className="mt-1 text-sm text-ink/80">{"New quota: " + item.nextQuota}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-ink/65">No completed 2026 rounds. Using baseline quota only.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </ReferenceSection>

          <SectionCard className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="club-btn-secondary min-h-12 text-base"
                onClick={openPlayerManagement}
              >
                Edit Players
              </button>
              <button
                type="button"
                className="club-btn-primary min-h-12 text-base"
                onClick={openCreateEditor}
              >
                Add Player
              </button>
            </div>
          </SectionCard>

          <ReferenceSection
            title="2026 Starting Quotas"
            subtitle="Locked baseline before Apr 19, 2026"
          >
            <div className="space-y-2">

              {baselineRows.map((row) => (
                <div
                  key={row.playerName}
                  className="flex items-center justify-between rounded-2xl border border-mist bg-white px-4 py-3"
                >
                  <p className="text-sm font-semibold text-ink">{row.playerName}</p>
                  <span className="rounded-full bg-pine px-3 py-1 text-sm font-bold text-white">
                    {row.baselineQuota}
                  </span>
                </div>
              ))}
            </div>
          </ReferenceSection>
        </>
      ) : null}

      {isManageOpen ? (
        <div className="fixed inset-0 z-40 bg-ink/35 px-3 py-4">
          <div className="mx-auto flex h-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-mist bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">Edit Players</h3>
                <p className="mt-1 text-sm text-ink/65">
                  Choose a player to edit quotas and settings, or add someone new.
                </p>
              </div>
              <button
                type="button"
                className="club-btn-secondary min-h-11"
                onClick={closeManagement}
              >
                Done
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                <button
                  type="button"
                  className="club-btn-primary min-h-12 w-full text-base"
                  onClick={openCreateEditor}
                >
                  Add Player
                </button>

                {showAdminQuotaAudit ? (
                  <button
                    type="button"
                    disabled={isRepairPending}
                    className="club-btn-secondary min-h-12 w-full text-base disabled:opacity-60"
                    onClick={handleRepairQuotas}
                  >
                    {isRepairPending ? "Rebuilding..." : "Rebuild Quotas From Baseline"}
                  </button>
                ) : null}

                <div className="space-y-2">
                  {groupedPlayers.map((player) => (
                    <button
                      key={`manage-${player.id}`}
                      type="button"
                      className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-mist bg-card px-4 text-left"
                      onClick={() => handleEdit(player)}
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">{player.name}</p>
                        <p className="text-xs text-ink/60">Current quota: {player.quota}</p>
                      </div>
                      <span className="text-sm font-semibold text-pine">Edit</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isEditorOpen ? (
        <div className="fixed inset-0 z-40 bg-ink/35 px-3 py-4">
          <div className="mx-auto flex h-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-mist bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  {form.id ? "Edit Player" : "Add Player"}
                </h3>
                <p className="mt-1 text-sm text-ink/65">
                  Update player details and save right away.
                </p>
              </div>
              <button
                type="button"
                className="club-btn-secondary min-h-11"
                onClick={closeEditor}
              >
                Cancel
              </button>
            </div>

            <form className="flex-1 overflow-y-auto px-5 py-4" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink">Name</span>
                  <input
                    required
                    className="club-input h-14 placeholder:text-ink/45"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Player name"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink">Quota</span>
                  <input
                    required
                    type="number"
                    className="club-input h-14"
                    value={form.quota}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, quota: event.target.value }))
                    }
                    placeholder="27"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={classNames(
                      "min-h-12 rounded-2xl border px-4 text-sm font-semibold",
                      form.isRegular
                        ? "border-pine bg-pine text-white"
                        : "border-mist bg-card text-ink"
                    )}
                    onClick={() => setForm((current) => ({ ...current, isRegular: !current.isRegular }))}
                  >
                    {form.isRegular ? "Roster" : "Guest"}
                  </button>

                  <button
                    type="button"
                    className={classNames(
                      "min-h-12 rounded-2xl border px-4 text-sm font-semibold",
                      form.isActive
                        ? "border-pine bg-pine text-white"
                        : "border-mist bg-card text-ink"
                    )}
                    onClick={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}
                  >
                    {form.isActive ? "Active" : "Inactive"}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ink">Avoid pairing with</p>
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-mist bg-card p-3">
                    {players
                      .filter((player) => player.id !== form.id)
                      .map((player) => {
                        const selected = form.conflictIds.includes(player.id);

                        return (
                          <button
                            key={player.id}
                            type="button"
                            className={classNames(
                              "flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-left text-sm font-semibold",
                              selected ? "bg-pine text-white" : "bg-white text-ink"
                            )}
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                conflictIds: selected
                                  ? current.conflictIds.filter((id) => id !== player.id)
                                  : [...current.conflictIds, player.id]
                              }))
                            }
                          >
                            <span>{player.name}</span>
                            <span>{selected ? "Avoid" : "Allow"}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 mt-6 border-t border-mist bg-white pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="club-btn-secondary min-h-12 text-base"
                    onClick={closeEditor}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="club-btn-primary min-h-12 text-base disabled:opacity-60"
                  >
                    {isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isUnlockOpen ? (
        <div className="fixed inset-0 z-50 bg-ink/35 px-3 py-4">
          <div className="mx-auto flex h-full max-w-md items-center justify-center">
            <div className="w-full rounded-[28px] border border-mist bg-white p-5 shadow-card">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-ink">Unlock quota editing</h3>
                <p className="text-sm text-ink/65">
                  Enter the password to edit player quotas for this session.
                </p>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-semibold text-ink">Password</span>
                <input
                  type="password"
                  className="club-input h-14"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder="Enter password"
                />
              </label>

              {passwordMessage ? <p className="mt-3 text-sm font-medium text-danger">{passwordMessage}</p> : null}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="club-btn-secondary min-h-12 text-base"
                  onClick={closeUnlock}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending || !passwordInput}
                  className="club-btn-primary min-h-12 text-base disabled:opacity-60"
                  onClick={handleUnlockEdit}
                >
                  {isPending ? "Unlocking..." : "Unlock"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}




