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
  isRegular: boolean;
  isActive: boolean;
  conflictIds: string[];
};

const emptyForm: FormState = {
  name: "",
  startingQuota: "",
  isRegular: true,
  isActive: true,
  conflictIds: []
};

export function PlayersManager({ initialPlayers }: { initialPlayers: PlayerItem[] }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const groupedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (a.isRegular !== b.isRegular) {
        return a.isRegular ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }, [players]);

  function handleEdit(player: PlayerItem) {
    setForm({
      id: player.id,
      name: player.name,
      startingQuota: String(player.startingQuota),
      isRegular: player.isRegular,
      isActive: player.isActive,
      conflictIds: player.conflictIds
    });
    setMessage("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    startTransition(async () => {
      const payload = {
        name: form.name.trim(),
        startingQuota: Number(form.startingQuota),
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
      setForm(emptyForm);
      setMessage(form.id ? "Player updated." : "Player added.");
    });
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Players"
        subtitle="Manage regular and guest players. Current quota updates from saved rounds."
      />

      <SectionCard>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{form.id ? "Edit Player" : "Add Player"}</h3>
            {form.id ? (
              <button
                className="text-sm font-semibold text-pine"
                type="button"
                onClick={() => setForm(emptyForm)}
              >
                Clear
              </button>
            ) : null}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Name</span>
            <input
              required
              className="h-12 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none ring-0 placeholder:text-ink/35"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Player name"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Starting quota</span>
            <input
              required
              type="number"
              className="h-12 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none"
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
                form.isRegular ? "border-pine bg-pine text-white" : "border-ink/10 bg-canvas text-ink"
              )}
              onClick={() => setForm((current) => ({ ...current, isRegular: !current.isRegular }))}
            >
              {form.isRegular ? "Regular player" : "Other player"}
            </button>

            <button
              type="button"
              className={classNames(
                "min-h-12 rounded-2xl border px-4 text-sm font-semibold",
                form.isActive ? "border-pine bg-pine text-white" : "border-ink/10 bg-canvas text-ink"
              )}
              onClick={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}
            >
              {form.isActive ? "Active" : "Inactive"}
            </button>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="min-h-12 w-full rounded-2xl bg-ink px-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {isPending ? "Saving..." : form.id ? "Save Changes" : "Add Player"}
          </button>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Avoid pairing with</p>
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl bg-canvas p-3">
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
                        selected ? "bg-ink text-white" : "bg-white text-ink"
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

          {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
        </form>
      </SectionCard>

      <div className="space-y-3">
        {groupedPlayers.map((player) => (
          <SectionCard key={player.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{player.name}</h3>
                  <span
                    className={classNames(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      player.isRegular ? "bg-pine/10 text-pine" : "bg-sand/30 text-ink"
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
              </div>

              <button
                className="min-h-11 rounded-2xl bg-canvas px-4 text-sm font-semibold text-ink"
                type="button"
                onClick={() => handleEdit(player)}
              >
                Edit
              </button>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
