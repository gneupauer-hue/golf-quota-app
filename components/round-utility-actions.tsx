"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RoundUtilityActions({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function runAction(url: string, successMessage: string, redirect = false) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(url, { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Could not finish that action.");
        return;
      }

      setMessage(successMessage);
      if (redirect && result.roundId) {
        router.push(`/rounds/${result.roundId}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            runAction(`/api/rounds/${roundId}/duplicate`, "Round duplicated.", true)
          }
          className="min-h-12 rounded-2xl bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-60"
        >
          Duplicate Round
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            runAction(`/api/rounds/${roundId}/template-reset`, "Round template reset.")
          }
          className="min-h-12 rounded-2xl bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-60"
        >
          Reset Round Template
        </button>
      </div>
      {message ? <p className="text-sm text-ink/65">{message}</p> : null}
    </div>
  );
}
