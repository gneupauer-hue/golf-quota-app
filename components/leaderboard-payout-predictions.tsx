"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { classNames } from "@/lib/utils";

type PlayerPrediction = {
  playerId: string;
  playerName: string;
  projectedTotal: number;
  front: number;
  back: number;
  total: number;
  indy: number;
  skins: number;
};

type ReconciliationRow = {
  key: "front" | "back" | "total" | "indy" | "skins" | "overall";
  label: string;
  allocated: number;
  pot: number;
  difference: number;
  bar: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

export function LeaderboardPayoutPredictions({
  roundId,
  isPayoutLocked,
  initialPaidPlayerIds,
  players,
  barRemainder,
  moneyCurrentlyInPlay,
  unsettledSkinsValue,
  isBalanced,
  mismatchedCategories,
  reconciliationRows,
  eyebrow = "Payout Predictions",
  title = "Live payout sheet",
  description = "Every projected dollar is traceable to Front, Back, Total, Indy, or Skins.",
  moneyLabel = "Current In Play",
  showRemainder = false
}: {
  roundId: string;
  isPayoutLocked: boolean;
  initialPaidPlayerIds: string[];
  players: PlayerPrediction[];
  barRemainder: number;
  moneyCurrentlyInPlay: number;
  unsettledSkinsValue: number;
  isBalanced: boolean;
  mismatchedCategories: string[];
  reconciliationRows: readonly ReconciliationRow[];
  eyebrow?: string;
  title?: string;
  description?: string;
  moneyLabel?: string;
  showRemainder?: boolean;
}) {
  const router = useRouter();
  const [paidPlayerIds, setPaidPlayerIds] = useState(initialPaidPlayerIds);
  const [payoutLocked, setPayoutLocked] = useState(isPayoutLocked);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const payingPlayers = useMemo(
    () =>
      players
        .filter((player) => player.projectedTotal > 0)
        .map((player) => ({
          ...player,
          isPaid: paidPlayerIds.includes(player.playerId),
          categories: [
            { label: "Front", value: player.front },
            { label: "Back", value: player.back },
            { label: "Total", value: player.total },
            { label: "Indy", value: player.indy },
            { label: "Skins", value: player.skins }
          ].filter((category) => category.value > 0)
        }))
        .sort((a, b) => {
          if (a.isPaid !== b.isPaid) {
            return a.isPaid ? 1 : -1;
          }
          if (b.projectedTotal !== a.projectedTotal) {
            return b.projectedTotal - a.projectedTotal;
          }
          return a.playerName.localeCompare(b.playerName);
        }),
    [paidPlayerIds, players]
  );

  const paidCount = payingPlayers.filter((player) => player.isPaid).length;
  const displayRows = reconciliationRows.map((row) => ({
    ...row,
    displayAllocated: showRemainder ? row.allocated : roundCurrency(row.allocated - row.bar),
    displayDifference: showRemainder
      ? row.difference
      : roundCurrency(row.allocated - row.bar - row.pot)
  }));

  function handleTogglePaid(playerId: string) {
    startTransition(async () => {
      try {
        setMessage("");
        const response = await fetch(`/api/rounds/${roundId}/settlement`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "toggle-paid",
            playerId
          })
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not update paid status.");
        }

        setPaidPlayerIds(result.paidPlayerIds ?? []);
        setMessage("Paid status updated.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not update paid status.");
      }
    });
  }

  function handleLockPayouts() {
    if (!window.confirm("Are you sure? This will finalize the round.")) {
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");
        const response = await fetch(`/api/rounds/${roundId}/settlement`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "lock-payouts"
          })
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not lock payouts.");
        }

        setPayoutLocked(true);
        setMessage("Payouts locked.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not lock payouts.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/55">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            {title}
          </h3>
          <p className="mt-1 text-sm text-ink/65">
            {description}
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {`${paidCount} of ${payingPlayers.length} players paid`}
          </p>
        </div>
        <div className="space-y-2 text-right">
          <div className="rounded-2xl border border-[color:var(--club-card-border)] bg-[color:var(--club-card)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/55">
              {moneyLabel}
            </p>
            <p className="mt-1 text-lg font-bold text-ink">{formatCurrency(moneyCurrentlyInPlay)}</p>
          </div>
          <button
            type="button"
            disabled={isPending || payoutLocked}
            onClick={handleLockPayouts}
            className={classNames(
              "min-h-11 rounded-2xl px-4 text-sm font-semibold disabled:opacity-45",
              payoutLocked ? "bg-[#E2F4E6] text-[color:var(--club-green)]" : "club-btn-primary"
            )}
          >
            {payoutLocked ? "Payouts Locked" : "Lock Payouts"}
          </button>
        </div>
      </div>

      {message ? <p className="text-sm font-medium text-ink/70">{message}</p> : null}

      {payingPlayers.length ? (
        <div className="space-y-2">
          {payingPlayers.map((player) => (
            <details
              key={player.playerId}
              className={classNames(
                "overflow-hidden rounded-[22px] border bg-white",
                player.isPaid
                  ? "border-[color:var(--club-green)] bg-[#F6FBF7]"
                  : "border-[color:var(--club-card-border)]"
              )}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-ink">{player.playerName}</p>
                    {player.isPaid ? (
                      <span className="rounded-full bg-[#E2F4E6] px-2.5 py-1 text-xs font-semibold text-[color:var(--club-green)]">
                        ✔ Paid
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-ink/55">
                    {player.categories.length} payout source{player.categories.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/55">
                    Total
                  </p>
                  <p className="mt-1 text-xl font-bold text-[color:var(--club-green)]">
                    {formatCurrency(player.projectedTotal)}
                  </p>
                </div>
              </summary>
              <div className="border-t border-[color:var(--club-card-border)] bg-[color:var(--club-card)] px-4 py-4">
                <div className="space-y-2">
                  {player.categories.map((category) => (
                    <div
                      key={category.label}
                      className="flex items-center justify-between rounded-2xl border border-[color:var(--club-card-border)] bg-white px-3 py-3"
                    >
                      <p className="text-sm font-semibold text-ink">{category.label}</p>
                      <p className="text-base font-bold text-ink">{formatCurrency(category.value)}</p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={isPending || payoutLocked}
                  onClick={() => handleTogglePaid(player.playerId)}
                  className={classNames(
                    "mt-3 min-h-11 w-full rounded-2xl px-4 text-sm font-semibold disabled:opacity-45",
                    player.isPaid
                      ? "club-btn-secondary"
                      : "club-btn-primary"
                  )}
                >
                  {player.isPaid ? "Unmark Paid" : "Mark as Paid"}
                </button>
              </div>
            </details>
          ))}
          {showRemainder && barRemainder > 0 ? (
            <div className="rounded-[22px] border border-[color:var(--club-card-border)] bg-[color:var(--club-cream)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-ink">Amount Left Over</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-ink/55">
                    Possible tip to bartender
                  </p>
                </div>
                <p className="text-xl font-bold text-[color:var(--club-green)]">
                  {formatCurrency(barRemainder)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-[22px] border border-[color:var(--club-card-border)] bg-[color:var(--club-card)] px-4 py-4">
          <p className="text-sm font-semibold text-ink">No payouts yet</p>
          <p className="mt-1 text-xs text-ink/65">
            Players will appear here once money is currently allocated.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: "Unsettled Skins", value: unsettledSkinsValue }
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-[color:var(--club-card-border)] bg-[color:var(--club-card)] px-3 py-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/55">
              {item.label}
            </p>
            <p className="mt-1 text-lg font-semibold text-ink">{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[22px] border border-[color:var(--club-card-border)] bg-[color:var(--club-cream)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/55">
              Payout Reconciliation
            </p>
            <p className="mt-1 text-sm text-ink/70">
              {showRemainder
                ? "Each payout category is verified against its pot."
                : "Live payouts are shown against the real pots. Any rounded remainder is held until the round is complete."}
            </p>
          </div>
          <span className="club-pill">
            {showRemainder
              ? isBalanced
                ? "Payouts fully reconciled"
                : "Payout mismatch detected"
              : "Live projection"}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {displayRows.map((row) => {
            const mismatch = showRemainder && row.displayDifference !== 0;

            return (
              <div
                key={row.key}
                className={classNames(
                  "rounded-2xl border px-3 py-3",
                  mismatch
                    ? "border-[#C2A878] bg-[#FFF7E7]"
                    : "border-[color:var(--club-card-border)] bg-white"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{row.label}</p>
                  <p className="text-base font-bold text-ink">
                    {`${formatCurrency(row.displayAllocated)} / ${formatCurrency(row.pot)}`}
                  </p>
                </div>
                {showRemainder && row.bar > 0 ? (
                  <p className="mt-1 text-xs font-medium text-ink/75">
                    {`Includes ${formatCurrency(row.bar)} amount left over`}
                  </p>
                ) : null}
                {mismatch ? (
                  <p className="mt-1 text-xs font-medium text-ink/75">
                    {`Off by ${formatCurrency(Math.abs(row.displayDifference))} ${row.displayDifference > 0 ? "over" : "under"}`}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {showRemainder && !isBalanced ? (
          <p className="mt-3 text-xs font-medium text-ink/70">
            {`Mismatch in: ${mismatchedCategories.join(", ")}`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
