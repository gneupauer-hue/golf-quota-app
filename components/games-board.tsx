"use client";

import { useCallback, useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import { SectionCard } from "@/components/section-card";
import { PageTitle } from "@/components/page-title";
import { formatGameDate, formatGameTime } from "@/lib/games/game-core";

type Game = {
  id: string;
  course: string;
  date: string;
  time: string;
  note: string;
  createdByUid: string;
  createdByName: string;
  going: string[];
  youAreIn: boolean;
};

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const inputClass =
  "w-full rounded-lg border border-pine/20 bg-white px-3 py-3 text-base text-ink";

export function GamesBoard() {
  const { user } = useFirebaseAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyId, setBusyId] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [course, setCourse] = useState("Irem");
  const [date, setDate] = useState(todayInputValue());
  const [time, setTime] = useState("09:00");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState("");
  const [editCourse, setEditCourse] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  async function authedFetch(url: string, init: RequestInit = {}) {
    const currentUser = getFirebaseAuth().currentUser;
    if (!currentUser) {
      throw new Error("Sign in first.");
    }
    const idToken = await currentUser.getIdToken();
    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(init.headers ?? {})
      }
    });
  }

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await authedFetch("/api/games", { cache: "no-store" });
      const data = (await response.json()) as {
        error?: string;
        games?: Game[];
        isOwner?: boolean;
        uid?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not load games.");
      }
      setGames(data.games ?? []);
      setIsOwner(Boolean(data.isOwner));
      setUid(data.uid ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load games.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [user, load]);

  async function toggleRsvp(game: Game) {
    setBusyId(game.id);
    setError("");
    setInfo("");
    try {
      const response = await authedFetch(`/api/games/${game.id}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ going: !game.youAreIn })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not save your RSVP.");
      }
      await load();
    } catch (rsvpError) {
      setError(rsvpError instanceof Error ? rsvpError.message : "Could not save your RSVP.");
    } finally {
      setBusyId("");
    }
  }

  async function createGame() {
    setCreating(true);
    setError("");
    setInfo("");
    try {
      const response = await authedFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({ course, date, time, note })
      });
      const data = (await response.json()) as { error?: string; texted?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not create the game.");
      }
      setInfo(
        data.texted
          ? `Game added — texted ${data.texted} member(s).`
          : "Game added. (Texting turns on once Twilio is set up.)"
      );
      setShowCreate(false);
      setNote("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the game.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(game: Game) {
    setEditingId(game.id);
    setEditCourse(game.course);
    setEditDate(game.date);
    setEditTime(game.time);
    setInfo("");
    setError("");
  }

  async function saveEdit(game: Game) {
    setBusyId(game.id);
    setError("");
    setInfo("");
    try {
      const response = await authedFetch(`/api/games/${game.id}`, {
        method: "POST",
        body: JSON.stringify({ course: editCourse, date: editDate, time: editTime, note: game.note })
      });
      const data = (await response.json()) as { error?: string; changed?: boolean; texted?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not update the game.");
      }
      setInfo(
        data.changed
          ? `Game updated — texted ${data.texted ?? 0} player(s) who are in.`
          : "Game updated."
      );
      setEditingId("");
      await load();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Could not update the game.");
    } finally {
      setBusyId("");
    }
  }

  async function cancelGame(game: Game) {
    if (!window.confirm(`Cancel the ${game.course} game on ${formatGameDate(game.date)}?`)) {
      return;
    }
    setBusyId(game.id);
    try {
      const response = await authedFetch(`/api/games/${game.id}`, {
        method: "POST",
        body: JSON.stringify({ cancel: true })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not cancel the game.");
      }
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel the game.");
    } finally {
      setBusyId("");
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (!user) {
    return (
      <div className="space-y-3">
        <PageTitle title="Games" subtitle="Upcoming games and who's playing." />
        <SectionCard>
          <p className="text-sm font-semibold text-ink/75">
            Sign in on the Account tab to see upcoming games.
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageTitle title="Games" subtitle="Upcoming games and who's in." />

      {info ? (
        <p className="rounded-lg border border-pine/15 bg-[#EAF6EC] px-3 py-3 text-sm font-semibold text-[#1B6B3A]">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-[#FCE5E2] px-3 py-3 text-sm font-semibold text-danger">{error}</p>
      ) : null}

      <SectionCard className="space-y-3">
        {!showCreate ? (
          <button
            type="button"
            className="min-h-12 w-full rounded-xl bg-pine px-4 font-semibold text-white"
            onClick={() => setShowCreate(true)}
          >
            Set up a game
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">New game</p>
              <p className="mt-1 text-sm text-ink/65">
                Everyone who opted in to game texts gets a text with the details.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Course</span>
              <input className={inputClass} value={course} onChange={(event) => setCourse(event.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Date</span>
                <input type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Tee time</span>
                <input type="time" className={inputClass} value={time} onChange={(event) => setTime(event.target.value)} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Note (optional)</span>
              <input
                className={inputClass}
                placeholder="Shotgun start, bring cash…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-12 rounded-xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-12 rounded-xl bg-pine px-4 text-sm font-semibold text-white disabled:opacity-50"
                onClick={createGame}
                disabled={creating}
              >
                {creating ? "Adding…" : "Add game & text"}
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {loading ? (
        <SectionCard>
          <p className="text-sm font-semibold text-ink/65">Loading games…</p>
        </SectionCard>
      ) : null}

      {!loading && games.length === 0 ? (
        <SectionCard>
          <p className="text-sm font-semibold text-ink/75">No games scheduled yet.</p>
          <p className="mt-1 text-sm text-ink/60">Set one up and everyone gets a text.</p>
        </SectionCard>
      ) : null}

      {games.map((game) => {
        const canManage = isOwner || game.createdByUid === uid;
        const isEditing = editingId === game.id;
        const expanded = expandedIds.has(game.id);
        return (
          <SectionCard key={game.id} className="space-y-3">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              onClick={() => toggleExpanded(game.id)}
            >
              <div className="min-w-0">
                <p className="text-lg font-semibold text-ink">{game.course}</p>
                <p className="mt-0.5 text-sm font-semibold text-pine">
                  {`${formatGameDate(game.date)} at ${formatGameTime(game.time)}`}
                </p>
                <p className="mt-1 text-xs text-ink/55">
                  {`${game.going.length} in`}
                  {game.youAreIn ? " · you're in ✓" : ""}
                </p>
              </div>
              <span
                className={`shrink-0 text-lg text-ink/40 transition-transform ${expanded ? "rotate-90" : ""}`}
                aria-hidden="true"
              >
                ▸
              </span>
            </button>

            {expanded ? (
              <>
            {game.note ? <p className="text-sm text-ink/65">{game.note}</p> : null}

            <div className="rounded-2xl bg-canvas px-3 py-2.5">
              <p className="text-sm font-semibold text-ink">
                {`${game.going.length} ${game.going.length === 1 ? "player" : "players"} in`}
              </p>
              {game.going.length ? (
                <ul className="mt-2 space-y-1">
                  {game.going.map((name, index) => (
                    <li key={`${game.id}-going-${index}`} className="flex items-baseline gap-2 text-sm text-ink/80">
                      <span className="text-xs font-semibold text-ink/40">{index + 1}.</span>
                      <span>{name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink/60">Nobody yet — be the first.</p>
              )}
            </div>

            <button
              type="button"
              className={
                game.youAreIn
                  ? "min-h-12 w-full rounded-xl border border-pine/30 bg-white px-4 text-sm font-semibold text-pine disabled:opacity-50"
                  : "min-h-12 w-full rounded-xl bg-pine px-4 text-sm font-semibold text-white disabled:opacity-50"
              }
              onClick={() => toggleRsvp(game)}
              disabled={busyId === game.id}
            >
              {busyId === game.id ? "Saving…" : game.youAreIn ? "You're in ✓ (tap to drop out)" : "I'm in"}
            </button>

            {canManage && !isEditing ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                  onClick={() => startEdit(game)}
                >
                  Change time
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-xl bg-danger/12 px-4 text-sm font-semibold text-danger"
                  onClick={() => cancelGame(game)}
                  disabled={busyId === game.id}
                >
                  Cancel game
                </button>
              </div>
            ) : null}

            {isEditing ? (
              <div className="space-y-2 rounded-2xl border border-pine/20 bg-white px-3 py-3">
                <p className="text-sm text-ink/70">
                  Changing the date, time, or course texts everyone who&apos;s in.
                </p>
                <input className={inputClass} value={editCourse} onChange={(event) => setEditCourse(event.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className={inputClass} value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                  <input type="time" className={inputClass} value={editTime} onChange={(event) => setEditTime(event.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                    onClick={() => setEditingId("")}
                  >
                    Never mind
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-pine px-4 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => saveEdit(game)}
                    disabled={busyId === game.id}
                  >
                    {busyId === game.id ? "Saving…" : "Save & text"}
                  </button>
                </div>
              </div>
            ) : null}
              </>
            ) : null}
          </SectionCard>
        );
      })}
    </div>
  );
}
