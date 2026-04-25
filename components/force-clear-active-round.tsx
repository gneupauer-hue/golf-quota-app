"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ForceClearActiveRound({
  roundId,
  roundName
}: {
  roundId: string;
  roundName: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  async function runAction(url: string, successMessage: string, fallbackError: string) {
    setIsPending(true);
    setMessage("");

    try {
      const response = await fetch(url, {
        method: "DELETE"
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? fallbackError);
        return;
      }

      setMessage(successMessage);
      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallbackError);
    } finally {
      setIsPending(false);
    }
  }

  async function handleCancelRound() {
    const confirmed = window.confirm(
      `Cancel ${roundName}?\n\nUse this only if the round was created by mistake and should be removed from the live flow.`
    );

    if (!confirmed) {
      return;
    }

    await runAction(`/api/rounds/${roundId}`, "Current round canceled.", "Could not cancel the current round.");
  }

  async function handleForceClear() {
    const confirmation = window.prompt(
      `Force clear ${roundName}? This permanently removes the current live round and its unfinished data. Type DELETE to confirm.`
    );

    if (confirmation === null) {
      setMessage("Force clear dismissed.");
      return;
    }

    if (confirmation.trim().toLowerCase() !== "delete") {
      setMessage("Type delete to confirm force clear.");
      return;
    }

    await runAction(
      `/api/rounds/${roundId}?force=1`,
      "Active round cleared.",
      "Could not clear the active round."
    );
  }

  return (
    <div className="club-card-muted space-y-3 px-4 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/45">
          Low-Risk Admin
        </p>
        <h3 className="mt-1 text-base font-semibold text-ink">Round Cleanup</h3>
        <p className="mt-1 text-sm text-ink/65">
          These controls live on Home only so they are harder to hit during play.
        </p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={handleCancelRound}
        className="club-btn-secondary min-h-11 w-full rounded-[20px] text-sm font-semibold disabled:opacity-45"
      >
        {isPending ? "Working..." : "Cancel Current Round"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleForceClear}
        className="min-h-11 w-full rounded-[20px] border border-danger/20 bg-transparent px-4 text-sm font-semibold text-danger disabled:opacity-45"
      >
        Force Clear Active Round
      </button>
      {message ? <p className="text-sm font-medium text-ink/70">{message}</p> : null}
    </div>
  );
}
