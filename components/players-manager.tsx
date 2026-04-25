"use client";

import { useMemo, useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { classNames, formatDisplayDate, getRoundDisplayDate, getRoundDisplayName } from "@/lib/utils";

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

function getLastRoundLabel(player: PlayerItem) {
  const latestRound = getLatestRound(player);
  if (!latestRound) {
    return "No rounds yet";
  }

  return getRoundDisplayName({
    roundName: latestRound.roundName,
    roundDate: latestRound.roundDate,
    completedAt: latestRound.completedAt,
    createdAt: latestRound.createdAt
  });
}

function getPreviousQuota(player: PlayerItem) {
  const latestRound = getLatestRound(player);
  return latestRound ? latestRound.startQuota : null;
}

function getAdjustmentLabel(player: PlayerItem) {
  const latestRound = getLatestRound(player);
  if (!latestRound) {
    return "No history yet";
  }

  return `${formatMovement(latestRound.quotaMovement)} on ${getLastRoundLabel(player)}`;
}

export function PlayersManager({ initialPlayers }: { initialPlayers: PlayerItem[] }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditUnlocked, setIsEditUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [pendingEditPlayer, setPendingEditPlayer] = useState<PlayerItem | null>(null);
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [openHistoryPlayerId, setOpenHistoryPlayerId] = useState<string | null>(null);
  const hasPlayers = players.length > 0;

  const groupedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (a.isRegular !== b.isRegular) {
        return a.isRegular ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }, [players]);

  function openCreateEditor() {
    setForm(emptyForm);
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
    setIsEditorOpen(true);
    setMessage("");
  }

  function handleEdit(player: PlayerItem) {
    if (!isEditUnlocked) {
      setPendingEditPlayer(player);
      setPasswordInput("");
      setPasswordMessage("");
      setIsUnlockOpen(true);
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
        closeUnlock();
        if (playerToEdit) {
          openEditorForPlayer(playerToEdit);
        }
      } catch (error) {
        setPasswordMessage(error instanceof Error ? error.message : "Could not unlock editing.");
      }
    });
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

      setPlayers(result.players);
      setIsEditorOpen(false);
      setForm(emptyForm);
      setMessage(form.id ? "Player updated" : "Player added");
    });
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Players" />

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
          <SectionCard className="p-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-ink">Player Actions</h3>
                <p className="text-sm leading-6 text-ink/75">
                  Add a player, view round history, or update player details. Editing existing quotas remains password protected.
                </p>
              </div>

              <div>
                <button
                  type="button"
                  className="club-btn-primary min-h-12 w-full text-base"
                  onClick={openCreateEditor}
                >
                  Add Player
                </button>
              </div>

              {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
            </div>
          </SectionCard>

          <div className="space-y-3">
            {groupedPlayers.map((player) => {
              const isHistoryOpen = openHistoryPlayerId === player.id;

              return (
                <SectionCard key={player.id} className="p-3">
                  <div className="space-y-2.5">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-ink">{player.name}</h3>
                      <div className="mt-1.5 space-y-0.5 text-sm leading-5 text-ink/70">
                        <p>
                          Current quota: <span className="font-semibold text-ink">{player.quota}</span>
                        </p>
                        <p>
                          Previous quota: <span className="font-semibold text-ink">{getPreviousQuota(player) ?? "-"}</span>
                        </p>
                        <p>
                          Adjustment: <span className="font-semibold text-ink">{getAdjustmentLabel(player)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="club-btn-primary min-h-11 text-sm"
                        type="button"
                        onClick={() => toggleHistory(player.id)}
                      >
                        {isHistoryOpen ? "Hide History" : "See History"}
                      </button>
                      <button
                        className="club-btn-secondary min-h-11 text-sm"
                        type="button"
                        onClick={() => handleEdit(player)}
                      >
                        Edit
                      </button>
                    </div>

                    {isHistoryOpen ? (
                      <div className="rounded-[24px] border border-ink/10 bg-canvas px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">Round History</p>
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink/70">
                            {player.history.length} {player.history.length === 1 ? "round" : "rounds"}
                          </span>
                        </div>

                        {player.history.length ? (
                          <div className="mt-3 space-y-2">
                            {player.history.map((item) => (
                              <div key={`${player.id}-${item.roundId}`} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-base font-semibold text-ink">
                                      {getRoundDisplayName({
                                      roundName: item.roundName,
                                      roundDate: item.roundDate,
                                      completedAt: item.completedAt,
                                      createdAt: item.createdAt
                                    })}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
                                      {formatDisplayDate(
                                      getRoundDisplayDate({
                                        roundName: item.roundName,
                                        roundDate: item.roundDate,
                                        completedAt: item.completedAt,
                                        createdAt: item.createdAt
                                      })
                                    )}
                                    </p>
                                  </div>
                                </div>
                                <p className="mt-3 text-sm text-ink/80">
                                  {`${item.totalPoints} points / quota ${item.startQuota} = ${formatQuotaResult(item.plusMinus)}`}
                                </p>
                                <p className="mt-1 text-sm text-ink/65">
                                  {`Quota moved ${formatMovement(item.quotaMovement)}`}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-ink/65">No rounds yet.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </SectionCard>
              );
            })}
          </div>
        </>
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
