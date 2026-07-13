"use client";

import { useState } from "react";

type ShareStatus = "idle" | "copied" | "failed";

export function ShareAppLinkButton() {
  const [status, setStatus] = useState<ShareStatus>("idle");

  async function handleShare() {
    const url = window.location.origin;
    const shareData = {
      title: "Custom Golf League Demo",
      text: "Use this link to open the Custom Golf League Demo app.",
      url
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setStatus("idle");
        return;
      }

      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
      } catch {
        setStatus("failed");
      }
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={handleShare} className="club-btn-primary min-h-14 w-full">
        Share App Link
      </button>
      {status === "copied" ? (
        <p className="rounded-2xl bg-[#FBF7F0] px-4 py-2 text-center text-sm font-semibold text-pine">
          Link copied!
        </p>
      ) : null}
      {status === "failed" ? (
        <p className="rounded-2xl bg-[#FCE5E2] px-4 py-2 text-center text-sm font-semibold text-danger">
          Could not share link.
        </p>
      ) : null}
    </div>
  );
}
