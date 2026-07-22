# Multi-Phone Live Scoring — Manual Test Script

_Purpose: verify multi-phone score entry on the live app using a throwaway **test
round**, without touching real quotas, stats, or results. Follow the steps in order.
Takes ~15 minutes with two phones._

> **Safety:** Do this with a **Test Round** (checkbox at creation). Test rounds are
> excluded from quota history and season statistics, and can be deleted afterward with
> one button. Nothing here affects real games. Do **not** use a real round for this.

---

## Before you start — important behavior note

The app currently runs **hole-by-hole entry only**. Understand how updates propagate:

- **Every score is saved to the server (Prisma) the moment it's entered** — that is the
  source of truth, and it is safe and durable.
- **Phone B sees Phone A's new scores after Phone B taps _Refresh_ (or reloads).** The
  automatic, second-by-second live push between phones is currently wired for the old
  "quick" entry mode only, so in hole-by-hole mode you refresh to pull the latest. This
  test verifies that refresh-based sync works reliably. (Instant auto-push for
  hole-by-hole is a known follow-up — see MIGRATION-STATUS.md.)

So "real-time" here means: **enter on one phone → refresh the other → the score is
there.** No entries are ever lost; the only question this test answers is whether both
phones converge on the same server truth.

---

## Part 1 — Create the test round (Phone A / owner)

1. Make sure both phones have the latest app (open in a browser tab, or reinstall the
   home-screen app). On the Start Round screen there should be **no "quick" option** —
   if you still see one, you're on a stale copy; hard-refresh first.
2. On Phone A, go to **Start Round**.
3. Choose the game type (Match + Quota is fine).
4. **Check the "Test Round" box.** This is the critical safety step.
5. Set the **Game date** to today.
6. Add **4 players**, build them into teams, and tap **Start Round**.
7. Confirm the round opens in **hole-by-hole** entry (it asks for hole 1, all four
   players).

## Part 2 — Both phones open the same round

8. On Phone B (a second approved member, or the same account in a second browser), open
   the app and go to **Current Round**. Confirm it shows the same round you just started.

## Part 3 — Different holes / different players both persist

9. On **Phone A**, enter all four players' scores for **hole 1** and tap **Save**. It
   should advance to hole 2.
10. On **Phone B**, tap **Refresh**. Confirm hole 1's scores from Phone A appear.
11. On **Phone B**, enter all four scores for **hole 2** and **Save**.
12. On **Phone A**, tap **Refresh**. Confirm hole 2 (entered on B) now shows on A.

✅ **Pass:** both phones show holes 1 and 2 with the same scores. Neither phone wiped the
other's work.

## Part 4 — Same hole, no lost work

13. On **Phone A**, enter hole 3 for players 1 and 2 and Save.
14. On **Phone B**, refresh, then enter hole 3 for players 3 and 4 and Save.
15. Refresh both phones.

✅ **Pass:** hole 3 shows all four players' scores. Phone B's save did not erase Phone
A's two players (and vice-versa).

## Part 5 — Disconnect / reconnect

16. On **Phone B**, turn on Airplane Mode (or walk out of signal).
17. On **Phone A**, enter hole 4 for all players and Save.
18. Bring **Phone B** back online and tap **Refresh** (or reload the app).

✅ **Pass:** Phone B catches up and shows hole 4. Nothing entered during the outage was
lost, because it was saved on the server by Phone A.

19. (Optional) Enter a hole on **Phone A** while briefly offline, then reconnect and tap
    Save. Confirm it saves once back online and appears on Phone B after a refresh.

## Part 6 — Finish and review

20. Finish entering holes and complete/approve the round on Phone A.
21. Confirm you land on the **results/summary** page and the numbers look right. Because
    it's a test round, it will show in Past Games with a **"Test Round"** badge and is
    excluded from quotas/stats.

---

## Part 7 — Delete the test round safely (required cleanup)

The test round must be removed so it doesn't clutter Past Games. It never affected real
quotas, but clean it up:

- **If the round is still active (not completed):** open it and tap **Delete Round** on
  its setup screen.
- **If you completed it:** open it from **Past Games** (it has a "Test Round" badge), or
  go to its **Review/results** page, and tap **Delete Test Round**. Confirm the prompt.
  You'll be returned to Past Games and the test round is gone.

> Deleting a test round is safe: quotas and season stats are never touched by test
> rounds, so removing one changes nothing for real games.

---

## What to report back

For each part, note **Pass/Fail** and anything unexpected — especially:

- Did any score entered on one phone **fail to appear** on the other after a refresh?
- Did any save on one phone **erase or change** a score another phone had entered?
- Any **red error text** (screenshot it).

If Parts 3–5 all pass, multi-phone scoring is safe to use for a real round (with the
refresh-to-sync behavior noted above).
