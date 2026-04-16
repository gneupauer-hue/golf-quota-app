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

    setIsPending(true);
    setMessage("");

    try {
      const response = await fetch(`/api/rounds/${roundId}?force=1`, {
        method: "DELETE"
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Could not clear the active round.");
        return;
      }

      setMessage("Active round cleared.");
      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not clear the active round.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="club-card space-y-2 px-4 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-danger/80">
          Temporary Admin
        </p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Force Clear Active Round</h3>
        <p className="mt-1 text-sm text-ink/70">
          Use this only if the live round is stuck and Home keeps reopening it.
        </p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={handleForceClear}
        className="club-btn-danger min-h-12 w-full rounded-[20px] disabled:opacity-45"
      >
        {isPending ? "Clearing Active Round..." : "Force Clear Active Round"}
      </button>
      {message ? <p className="text-sm font-medium text-danger">{message}</p> : null}
    </div>
  );
}
