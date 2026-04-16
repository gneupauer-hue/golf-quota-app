"use client";

import { useMemo, useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { classNames } from "@/lib/utils";

type PlayerItem = {
  id: string;
  name: string;
  startingQuota: number;
  currentQuota: number;
  isRegular: boolean;
  isActive: boolean;
  conflictIds: string[];
};

type FormState = {
  id?: string;
  name: string;
  startingQuota: string;
  currentQuota: string;
  isRegular: boolean;
  isActive: boolean;
  conflictIds: string[];
};

const emptyForm: FormState = {
  name: "",
  startingQuota: "",
  currentQuota: "",
  isRegular: true,
  isActive: true,
  conflictIds: []
};

export function PlayersManager({ initialPlayers }: { initialPlayers: PlayerItem[] }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
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

  function handleEdit(player: PlayerItem) {
    setForm({
      id: player.id,
      name: player.name,
      startingQuota: String(player.startingQuota),
      currentQuota: String(player.currentQuota),
      isRegular: player.isRegular,
      isActive: player.isActive,
      conflictIds: player.conflictIds
    });
    setIsEditorOpen(true);
    setMessage("");
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setForm(emptyForm);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    startTransition(async () => {
      const payload = {
        name: form.name.trim(),
        startingQuota: Number(form.startingQuota),
        currentQuota: Number(form.currentQuota),
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

  function handleCreateStarterPlayers() {
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/players/starter", {
        method: "POST"
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Could not restore starter players.");
        return;
      }

      setPlayers(result.players);
      setMessage("Starter players are ready.");
    });
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Players"
        subtitle="Manage regular and guest players. Current quota updates from saved rounds."
      />

      {!hasPlayers ? (
        <SectionCard className="p-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-ink">No players yet</h3>
              <p className="text-sm leading-6 text-ink/75">
                Create the standard starter player list so the round picker and quota
                tracking are ready to use.
              </p>
            </div>

            <button
              type="button"
              disabled={isPending}
              className="club-btn-primary min-h-12 w-full text-base disabled:opacity-60"
              onClick={handleCreateStarterPlayers}
            >
              {isPending ? "Creating..." : "Create Starter Players"}
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
                  Add a player or restore the starter roster. Tap a player name or the
                  Edit button below to update details.
                </p>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  className="club-btn-primary min-h-12 w-full text-base"
                  onClick={openCreateEditor}
                >
                  Add Player
                </button>

                <button
                  type="button"
                  disabled={isPending}
                  className="club-btn-secondary min-h-12 w-full text-base disabled:opacity-60"
                  onClick={handleCreateStarterPlayers}
                >
                  {isPending ? "Restoring..." : "Restore Starter Players"}
                </button>
              </div>

              {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
            </div>
          </SectionCard>

          <div className="space-y-3">
            {groupedPlayers.map((player) => (
              <SectionCard key={player.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => handleEdit(player)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{player.name}</h3>
                      <span
                        className={classNames(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          player.isRegular ? "bg-pine/12 text-pine" : "bg-sand/25 text-ink"
                        )}
                      >
                        {player.isRegular ? "Regular" : "Other"}
                      </span>
                      <span
                        className={classNames(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          player.isActive ? "bg-fairway/15 text-pine" : "bg-ink/10 text-ink/60"
                        )}
                      >
                        {player.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-ink/70">
                      Current quota <span className="font-semibold text-ink">{player.currentQuota}</span>
                    </p>
                    <p className="text-sm text-ink/70">
                      Starting quota <span className="font-semibold text-ink">{player.startingQuota}</span>
                    </p>
                    <p className="text-sm text-ink/70">
                      Avoid pairings <span className="font-semibold text-ink">{player.conflictIds.length}</span>
                    </p>
                  </button>

                  <button
                    className="club-btn-secondary min-h-12"
                    type="button"
                    onClick={() => handleEdit(player)}
                  >
                    Edit
                  </button>
                </div>
              </SectionCard>
            ))}
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
                  <span className="mb-2 block text-sm font-semibold text-ink">Current quota</span>
                  <input
                    required
                    type="number"
                    className="club-input h-14"
                    value={form.currentQuota}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, currentQuota: event.target.value }))
                    }
                    placeholder="27"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink">Starting quota</span>
                  <input
                    required
                    type="number"
                    className="club-input h-14"
                    value={form.startingQuota}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, startingQuota: event.target.value }))
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
                    {form.isRegular ? "Regular player" : "Other player"}
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
    </div>
  );
}
