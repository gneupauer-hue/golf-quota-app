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

function getShortRoundDateLabel(player: PlayerItem) {
  const latestRound = getLatestRound(player);
  if (!latestRound) {
    return "Base";
  }

  const displayDate = getRoundDisplayDate({
    roundName: latestRound.roundName,
    roundDate: latestRound.roundDate,
    completedAt: latestRound.completedAt,
    createdAt: latestRound.createdAt
  });
  const parsed = displayDate instanceof Date ? displayDate : new Date(displayDate);

  if (Number.isNaN(parsed.getTime())) {
    return getLastRoundLabel(player);
  }

  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
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

function PlayerRosterHeader() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem] items-center gap-x-2 border-b border-ink/10 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">
      <span>Player</span>
      <span className="text-center">Quota</span>
      <span className="text-center">Adj</span>
      <span className="text-right">Date</span>
    </div>
  );
}

function PlayerRosterCard({
  player,
  isHistoryOpen,
  onToggleHistory
}: {
  player: PlayerItem;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
}) {
  const latestChange = getLatestQuotaChange(player.history);
  const latestChangeLabel = latestChange == null ? "Base" : formatMovement(latestChange);
  const lastUpdatedLabel = getShortRoundDateLabel(player);
  const latestChangeBadgeClass =
    latestChange == null
      ? "bg-ink/10 text-ink/60"
      : latestChange > 0
        ? "bg-pine text-white"
        : latestChange < 0
          ? "bg-[#FEE2E2] text-[#991B1B]"
          : "bg-ink/10 text-ink/70";

  return (
    <SectionCard className="overflow-hidden px-0 py-0">
      <button
        type="button"
        onClick={onToggleHistory}
        className="grid w-full grid-cols-[minmax(0,1fr)_3rem_3rem_3rem] items-center gap-x-2 px-3 py-1 text-left"
      >
        <p className="min-w-0 truncate text-sm font-semibold leading-5 text-ink">{player.name}</p>
        <span className="justify-self-center rounded-full bg-pine px-2.5 py-1 text-sm font-bold leading-none text-white">
          {player.quota}
        </span>
        <span
          className={classNames(
            "inline-flex min-w-8 justify-self-center items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold leading-none",
            latestChangeBadgeClass
          )}
        >
          {latestChangeLabel}
        </span>
        <span className="text-right text-[11px] font-semibold leading-none text-ink/55">{lastUpdatedLabel}</span>
      </button>

      {isHistoryOpen ? (
        <div className="border-t border-ink/10 bg-canvas px-4 py-3">
          <div className="space-y-3">
            <div className="rounded-2xl bg-white px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/45">
                Player snapshot
              </p>
              <div className="mt-2 grid gap-2 text-sm text-ink/80 sm:grid-cols-2">
                <p>{`Previous quota: ${getStartingQuotaLastRound(player) ?? "-"}`}</p>
                <p>{`Last adjustment: ${getLastAdjustmentLabel(player)}`}</p>
              </div>
            </div>

            {player.history.length ? (
              <div className="space-y-2">
                {player.history.map((item) => (
                  <div key={player.id + "-" + item.roundId} className="rounded-2xl bg-white px-3 py-3 shadow-sm">
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
                    <p className="mt-2 text-sm text-ink/80">{`Starting quota: ${item.startQuota}`}</p>
                    <p className="mt-1 text-sm text-ink/80">{`Points: ${item.totalPoints}`}</p>
                    <p className="mt-1 text-sm text-ink/80">{`Result: ${formatQuotaResult(item.plusMinus)}`}</p>
                    <p className="mt-1 text-sm text-ink/80">{`Adjustment: ${formatMovement(item.quotaMovement)}`}</p>
                    <p className="mt-1 text-sm text-ink/80">{`New quota: ${item.nextQuota}`}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink/65">No completed rounds this year. Using baseline quota only.</p>
            )}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
export function PlayersManager({
  initialPlayers,
  initialQuotaAudit,
  initialBaselineRows
}: {
  initialPlayers: PlayerItem[];
  initialQuotaAudit: QuotaValidationSummary;
  initialBaselineRows: BaselineQuotaRow[];
}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [quotaAudit, setQuotaAudit] = useState(initialQuotaAudit);
  const [baselineRows] = useState(initialBaselineRows);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isDormantPlayersOpen, setIsDormantPlayersOpen] = useState(false);
  const [isRepairPending, startRepairTransition] = useTransition();
  const hasPlayers = players.length > 0;
  const showAdminQuotaAudit = process.env.NODE_ENV !== "production" || isEditUnlocked;

  const groupedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const shouldFilterPlayerResults = normalizedSearchQuery.length >= 2;

  const visiblePlayers = useMemo(() => {
    if (!shouldFilterPlayerResults) {
      return groupedPlayers;
    }

    return groupedPlayers.filter((player) => player.name.toLowerCase().includes(normalizedSearchQuery));
  }, [groupedPlayers, normalizedSearchQuery, shouldFilterPlayerResults]);

  const currentPlayers = useMemo(
    () => visiblePlayers.filter((player) => getRoundsThisYear(player) > 0),
    [visiblePlayers]
  );

  const dormantPlayers = useMemo(
    () => visiblePlayers.filter((player) => getRoundsThisYear(player) === 0),
    [visiblePlayers]
  );
  function applyPlayersResponse(result: {
  players: PlayerItem[];
  quotaAudit: QuotaValidationSummary;
  message?: string;
}) {
  setPlayers(result.players);
  setQuotaAudit(result.quotaAudit);
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

              {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
            </div>
          </SectionCard>

          <div className="space-y-3">
            {shouldFilterPlayerResults && currentPlayers.length === 0 && dormantPlayers.length === 0 ? (
              <SectionCard className="p-4">
                <p className="text-sm text-ink/70">No players found.</p>
              </SectionCard>
            ) : null}

            <SectionCard className="overflow-hidden px-0 py-0">
              <div className="border-b border-ink/10 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/50">Current Players</p>
                    <p className="mt-1 text-sm text-ink/65">
                      {`${currentPlayers.length} player${currentPlayers.length === 1 ? "" : "s"} with completed rounds this year.`}
                    </p>
                  </div>
                  <span className="rounded-full bg-pine px-3 py-1 text-sm font-bold text-white">
                    {currentPlayers.length}
                  </span>
                </div>
              </div>
              <div className="space-y-1 px-2 py-1">
                {currentPlayers.length ? (
                  <>
                    <PlayerRosterHeader />
                    {currentPlayers.map((player) => (
                      <PlayerRosterCard
                        key={player.id}
                        player={player}
                        isHistoryOpen={openHistoryPlayerId === player.id}
                        onToggleHistory={() => toggleHistory(player.id)}
                      />
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-ink/65">
                    {shouldFilterPlayerResults ? "No current players match this search." : "No current players yet for this year."}
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard className="overflow-hidden px-0 py-0">
              <button
                type="button"
                onClick={() => setIsDormantPlayersOpen((current) => !current)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/50">
                    {`Dormant Players (${dormantPlayers.length})`}
                  </p>
                  <p className="mt-1 text-sm text-ink/65">
                    Roster players without a completed round this year.
                  </p>
                </div>
                <span className="shrink-0 pt-0.5 text-xs font-semibold text-ink/55">
                  {isDormantPlayersOpen ? "Tap to collapse" : "Tap to expand"}
                </span>
              </button>
              <div
                className={classNames(
                  "grid transition-all duration-200 ease-out",
                  isDormantPlayersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="space-y-1 border-t border-ink/10 px-2 py-1">
                    {dormantPlayers.length ? (
                      <>
                        <PlayerRosterHeader />
                        {dormantPlayers.map((player) => (
                          <PlayerRosterCard
                            key={player.id}
                            player={player}
                            isHistoryOpen={openHistoryPlayerId === player.id}
                            onToggleHistory={() => toggleHistory(player.id)}
                          />
                        ))}
                      </>
                    ) : (
                      <p className="text-sm text-ink/65">
                        {shouldFilterPlayerResults ? "No dormant players match this search." : "No dormant players."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
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
              <div className="space-y-3 border-t border-ink/10 pt-3">
                <p className="text-sm text-ink/70">Only use this if quotas become inconsistent.</p>
                <button
                  type="button"
                  disabled={isRepairPending}
                  className="club-btn-primary min-h-12 w-full text-base disabled:opacity-60"
                  onClick={handleRepairButtonPress}
                >
                  {isRepairPending ? "Rebuilding..." : "Rebuild All Quotas From 2026 Baseline"}
                </button>
              </div>
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








