"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function DemoResetButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage("");
          startTransition(async () => {
            const response = await fetch("/api/demo/reset", { method: "POST" });
            const result = await response.json();

            if (!response.ok) {
              setMessage(result.error ?? "Could not reset demo data.");
              return;
            }

            setMessage("Demo data reset.");
            router.refresh();
          });
        }}
        className="min-h-14 w-full rounded-[24px] bg-ink px-5 text-base font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Resetting Demo..." : "Reset Demo Data"}
      </button>
      {message ? <p className="text-sm text-ink/65">{message}</p> : null}
    </div>
  );
}
