# Firebase / Firestore Migration Audit (Read-Only)

_Date: 2026-07-21. Scope: read-only audit of the Prisma → Firestore real-time
multi-phone scoring migration. No code, data, config, or environment values were
changed. This document is the only file added._

---

## 0. Git / production state

- **Actual HEAD:** `36fd4b062aef369e6c87118985df9b8c60d51e01` ("Irem: place bottom
  navigation after page content").
- **Branch:** `main`, working tree **clean**, level with `origin/main` (no ahead/behind).
- **Is `36fd4b0` the production commit?** It is the newest commit on `main` and the
  natural deploy target, so it is almost certainly what Vercel is serving. This cannot
  be *proven* from the repo alone — the live Vercel deployment was not inspected (out of
  scope by instruction). **Gary should confirm the deployed commit in the Vercel
  dashboard.** Note: the Phase 4I-A doc records the pilot as deployed at `f67910b` with a
  pointer-rollover fix at `9f8dd10`; both are ancestors of `36fd4b0`, so HEAD already
  contains that work plus later tee/nav changes.

---

## 1. End-to-end score flow (exact files & functions)

A golfer changing a score travels two independent paths. **Prisma is written first and
is authoritative; the Firestore mirror is a client-driven best-effort shadow write that
happens _after_ the Prisma save.**

| Hop | Where | File · function |
|----|-------|-----------------|
| 1. Golfer edits a score on Phone A | client | `components/round-editor.tsx` — score state in `rows`; save triggers `persistScoreEntries()` (line ~1966) |
| 2. Prisma write (authoritative) | API | `app/api/rounds/[id]/score-entry/route.ts` · `PATCH` → `applyScoreEntryPatches()` in `lib/round-service.ts:443` inside `prisma.$transaction` → per-player `mergeScoreEntryPatch()` + `syncRoundComputedState()` |
| 3. Client then diffs & mirrors granularly | client | `round-editor.tsx` · `writeFirestoreTestScoreOperations()` (line ~1986) → `buildFirestoreTestScoreOperations()` (`lib/firebase/score-write-operations.ts`) → `sendFirestoreTestScoreOperation()` → `fetch("/api/firebase/score-write")` (line ~2036), one call per changed field, with `clientRequestId` |
| 4. Server validates & writes Firestore | API | `app/api/firebase/score-write/route.ts` · `POST` → `handleScoreWriteRequest()` (`lib/firebase/score-write-route.ts`). Verifies Firebase ID token, club membership, round gate, and (regular rounds only) `assertOperationMatchesLatestPrismaScore()`. Then `runScoreWriteTransaction` runs a Firestore transaction writing `clubs/{clubId}/rounds/{roundId}/scores/{playerId}` with `scoreVersion++`, `checksum`, `lastClientRequestId` (idempotency), `syncedAt`/`lastEditedAt` server timestamps |
| 5. Firestore fans out to Phone B | client | `components/score-mirror-listener-pilot.tsx` → `subscribeToScoreMirrorCollection()` (`lib/firebase/score-listener.ts`, `onSnapshot`) → `normalizeScoreMirrorSnapshot()` |
| 6. Phone B display reconciles | client | `round-editor.tsx` · `handleRealtimeScoreSnapshot()` (line ~2815) → `reconcileRealtimeQuickScoreDisplay()` (`lib/firebase/realtime-score-display.ts`). Merges remote rows into local `rows`, skipping dirty/saving/local-echo players, flagging conflicts into `remoteConflictPlayerIds` |

**Critical structural facts**

- The **Prisma save path (hop 2) contains zero Firestore code.** The mirror is a
  *separate* client call (hop 3). If step 4 fails, the Prisma save still succeeds and the
  UI is unaffected — the mirror is fire-and-forget with a diagnostic status only.
- Hop 6 (real-time apply) is **QUICK-entry-mode only** and only runs when
  `realtimeScoreDisplayEnabled` is true. In DETAILED mode, or with the flag off, Phone B
  updates only on manual **Refresh** (`GET /api/rounds/[id]` + `router.refresh()`).
- The listener/diagnostic panel is visible only to signed-in **active owner/admin**
  members; the listener itself subscribes for any active club member.

---

## 2. Source-of-truth map

| Concern | Authoritative source | Firestore involvement today |
|--------|----------------------|-----------------------------|
| Players | **Prisma** (`app/api/players/route.ts`) | one-way mirror only via owner/admin publish |
| Quotas (base + tee-adjusted) | **Prisma** (`recomputeHistoricalState`, `buildNewPlayerQuotaFields`) | none |
| Active-round setup | **Prisma** (`lib/active-round.ts`, `rounds/[id]` PUT) | round shell mirrored (derived from Prisma) on draft→live |
| Teams / groups | **Prisma** (`createOrReplaceRoundEntries`) | none beyond the round-shell mirror |
| Live scores | **Prisma** (`score-entry`, `submit-segment`) | granular shadow mirror (client dual-write) |
| Posting / finalize | **Prisma** (`rounds/[id]/complete`, `finalizeRound`) | none |
| Payouts / settlement | **Prisma** (`rounds/[id]/settlement`) | none |
| Skins | **Prisma** (`rounds/[id]/skins`, `birdieHolesCsv`) | none |
| Results | **Prisma** (`syncRoundComputedState`, `corrections`) | none |
| Statistics | **Prisma** (`lib/season-stats.ts` ← `getExperimentalSeasonStatsData`) | none |
| Historical rounds | **Prisma** | **not migrated** (by design) |

Firestore is a **projection**, never a system of record. It is written from Prisma reads
and never read back as authority in any posting/quota/payout/skins/stats path.

---

## 3. What is genuinely complete

**Production-validated** (documented + validated in prod, then cleaned up)
- Phase 3 round-shell mirror + active-round pointer (owner/admin dry-run/publish/cleanup) — `docs/phase-3-round-mirror-closeout.md`.
- Phase 4H granular score shadow-mirror on a live round (versioning, idempotency, latest-Prisma verification, no full-row replacement) — `docs/phase-4h-score-mirror-validation.md`.
- Phase 4I-A real-time QUICK-score display pilot: two devices, cross-phone propagation, same-player conflict preserved, "Review Needed" surfaced, refresh accepts authoritative Prisma value — `docs/phase-4i-a-realtime-display-validation.md`.

**Implemented + unit-tested** (code present, covered by `tests/`, not all prod-proven)
- Firebase Auth + session cookie (`app/api/firebase/session/route.ts`), club membership model, Firestore security rules (client writes denied everywhere).
- Player mirror infra (`lib/firebase/player-mirror*.ts`, sync route, seed).
- Granular score-write engine + optimistic concurrency (`score-write-route.ts`, `granular-ops.ts`, `score-write-operations.ts`).
- Real-time listener + reconciler (`score-listener.ts`, `realtime-score-display.ts`).
- Auto active-round prep on draft→live (`active-round-preparation.ts`, wired in `rounds/[id]` PUT).
- Owner/admin repair + publish controls (`active-round-preparation-route.ts`, `firebase-account-panel.tsx`).
- Broad test suite: ~24 `firebase-*` / score / concurrency test files.

**Scaffolded / transitional** (present but explicitly diagnostic or gated off)
- "Firestore Score Mirror Write" diagnostic panel and "Phase 4 Score Mirror Pilot"
  read-only listener card (owner/admin only).
- Manual dry-run/publish/repair console in `firebase-account-panel.tsx`.
- All three production flags default to `false` in `.env.example`.

---

## 4. What still blocks the main goal

The main goal — many phones scoring the same round in real time, no stale overwrites,
safe reconnect — is **functionally present but not the operational default**. Blockers:

1. **Everything is flag-gated and disabled by default.** `FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED`,
   `FIREBASE_REALTIME_SCORE_DISPLAY_ENABLED`, `FIREBASE_ACTIVE_ROUND_AUTO_PREP_ENABLED`
   are `false` in `.env.example`; live values live only in Vercel and must be confirmed.
2. **Real-time display is QUICK-mode only.** `handleRealtimeScoreSnapshot` early-returns
   unless `scoringEntryMode === "QUICK"`. DETAILED (hole-by-hole) rounds get **no**
   cross-phone live updates — only manual refresh. This is a real functional gap for the
   main goal if DETAILED rounds are used.
3. **Client-driven dual-write.** The mirror fires from the browser after the Prisma PATCH.
   If Phone A loses connectivity between the two calls, Prisma is correct but Firestore
   silently lags until the next successful save — there is **no server-side reconcile** on
   the normal save path (only the manual repair endpoint and auto-prep-on-go-live).
4. **No offline write queue.** Reconnect recovery relies on Firestore's client cache for
   *reads*; there is no explicit queue/replay of failed granular *writes*. A save during
   an outage is lost from the mirror (Prisma still holds it).
5. **Prisma granular entry has no version guard for same-player concurrent writes** (see §8/§10).
6. **Duplicated concern surfaces:** `round-setup` renders `RoundEditor` *without* the
   flags, so mirror/realtime are silently off there — two code paths for the same editor.

---

## 5. Is Phase 5 actually necessary?

**Phase 5 has not been started** (the only repo reference is
`docs/phase-4i-a-realtime-display-validation.md:41` — "Phase 5 was not started"). There is
no Phase 5 spec in the repo, so its intended contents are inferred from the trajectory:
promoting the mirror + real-time display from "validated pilot" to the operational default,
likely DETAILED-mode real-time, and possibly making Firestore the live score source.

**Recommendation: do not preserve a monolithic "Phase 5."** The remaining work is small
and should be delivered as two or three concrete checkpoints (§6), not a new phase
structure. Most of what a "Phase 5" would contain is already built and validated; what
remains is enabling flags, closing the DETAILED-mode gap, and hardening reconnect. Skip
the ceremony; ship the slices.

---

## 6. Fastest safe completion plan

Keep **Prisma as the write path and posting/final authority.** Do not make Firestore the
system of record. Deliver in a few meaningful checkpoints:

**Checkpoint A — Turn on the validated real-time read path for QUICK rounds (config only).**
Enable `FIREBASE_ACTIVE_ROUND_AUTO_PREP_ENABLED`, `FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED`,
`FIREBASE_REALTIME_SCORE_DISPLAY_ENABLED` in Vercel for real club rounds. No code change.
This already satisfies the main goal for QUICK-entry rounds (proven in 4I-A).

**Checkpoint B — Close the DETAILED-mode gap.** Extend `reconcileRealtimeQuickScoreDisplay`
(or add a DETAILED sibling) so per-hole remote updates apply cross-phone, and drop the
`scoringEntryMode === "QUICK"` guard in `handleRealtimeScoreSnapshot`.

**Checkpoint C — Reconnect / dual-write hardening.** Add a client retry/queue for failed
`/api/firebase/score-write` ops and a lightweight server reconcile (reuse the repair
adapter) so a dropped mirror write self-heals on the next save or on reconnect.

**Exact condition under which Firestore could become the live operational score source:**
only after (a) DETAILED-mode real-time is implemented and validated, (b) offline
write-queue + automatic reconcile is proven, and (c) a full round is scored end-to-end on
Firestore with Prisma still receiving every write and matching Firestore byte-for-byte via
checksum. Until all three hold, Firestore stays a display mirror and Prisma stays the
operational source.

---

## 7. Rollback design

Every proposed cutover is a **flag flip with no schema/data change**, so rollback is
immediate and lossless because Prisma keeps receiving every write regardless:

- **Checkpoint A:** set the three env flags back to `false` in Vercel. The client stops
  mirroring and stops applying snapshots; Prisma scoring is untouched. No score is lost —
  every score was already committed to Prisma first.
- **Checkpoint B (DETAILED real-time):** gate behind its own flag (e.g. reuse
  `FIREBASE_REALTIME_SCORE_DISPLAY_ENABLED` or add a narrow one); disabling reverts to
  manual refresh.
- **Checkpoint C (reconnect/queue):** the queue only ever *replays* writes that also went
  to Prisma; disabling it cannot lose data.
- **If Firestore ever becomes the live source (future):** keep the granular Prisma
  score-entry path fully wired and writing until Firestore-as-source has run clean for a
  defined period. The replacement is only "proven" once Prisma can be demoted without any
  behavior change — and even then Prisma stays the posting/final authority.

**Rule:** granular Prisma scoring stays until its replacement is proven. No cutover
removes the Prisma write.

---

## 8. Tests still needed

Existing coverage is strong on pure logic (merge, rollout gates, version conflict,
idempotency, listener normalization, route auth). Gaps for the main goal:

- **Two phones, different accounts** — different active members writing different players; assert no cross-write. _(Only pure merge is tested today.)_
- **Two phones, same account** — same uid, two sessions; idempotency via `clientRequestId`.
- **Different players / groups concurrently** — end-to-end (Prisma + Firestore) isolation, not just the in-memory `mergeScoreEntryPatch` test.
- **Same player / same hole conflict** — concurrent granular writes; assert Firestore 409 + single-retry path, and **assert the Prisma path's behavior under concurrent same-player save** (currently untested; see §10).
- **Offline then reconnect** — dropped `/api/firebase/score-write`, verify recovery (needs Checkpoint C).
- **Round rollover + auto prep** — `didRoundTransitionDraftToLive` → `prepareActiveRoundFirestoreMirror` under repeated/rollover conditions (partial coverage exists).
- **Posting after real-time scoring** — finalize a round that was scored with the mirror on; assert quotas/payouts identical to non-mirrored.
- **Firestore down while Prisma up** — mirror failure must never block or corrupt the Prisma save (assert the fire-and-forget contract).

---

## 9. Simplification opportunities (identify only — nothing removed)

- **Diagnostic UI:** "Firestore Score Mirror Write" panel (`round-editor.tsx` ~1507-1570)
  and "Phase 4 Score Mirror Pilot" card (`score-mirror-listener-pilot.tsx`) are
  owner/admin diagnostics — candidates to hide/remove post-cutover.
- **Manual publish console:** dry-run/publish/repair controls in
  `firebase-account-panel.tsx` overlap with the automatic auto-prep path; once auto-prep is
  the default, the manual player/round/score publish buttons are largely redundant.
- **Duplicate rollout modules:** `score-mirror-rollout.ts` and `score-write-route.ts` each
  define `FIREBASE_REGULAR_ROUND_SCORE_MIRROR_FLAG` / an `is…Enabled` reader; the flag
  constant is declared in three places. Consolidatable.
- **`round-setup` vs `rounds/[id]`** render the same `RoundEditor` with different prop
  sets (flags omitted in setup) — a source of "why is it off here?" confusion.
- **Verbose `console.info` instrumentation** (`[quota-rebuild]`, `[live-round]`,
  `[score-mirror-rollout]`, `[realtime-score-display]`) is transitional diagnostics.
- **Naming:** "test score write" / `firestore-test` source label now also covers regular
  rounds — the "test" naming is legacy and misleading.

---

## 10. Risk assessment

**Overall risk of the fastest safe path (Checkpoint A, config-only): LOW.**
The real-time read path is validated, Prisma is untouched, and rollback is a flag flip.
Risk rises to **MEDIUM** for Checkpoint B (new DETAILED reconcile logic) and **MEDIUM** for
Checkpoint C (reconnect/queue correctness). Making Firestore the *source* would be **HIGH**
and is explicitly out of scope for now.

**Three most likely ways a faster cutover fails:**
1. **DETAILED-mode blind spot.** Turning on real-time and assuming all rounds get live
   updates — but DETAILED rounds don't (QUICK-only guard). Groups think they see each
   other and don't. _Mitigation: Checkpoint B before relying on it for DETAILED rounds._
2. **Client dual-write drift on flaky course Wi‑Fi/cellular.** Prisma save succeeds, the
   follow-up mirror write fails, no queue replays it → Firestore shows stale scores on
   other phones until someone re-saves. _Mitigation: Checkpoint C._
3. **Same-player concurrent Prisma lost update.** The `/score-entry` path reads the entry,
   merges, and writes all 18 hole fields under read-committed isolation with **no version
   guard** (unlike the Firestore path, which has `scoreVersion`). Two phones saving the
   *same* player at once can lose one write on the Prisma (authoritative) side. Today this
   is mitigated only by convention (each phone owns a group). _Mitigation: add an optimistic
   version/`updatedAt` guard to the Prisma granular path, or enforce per-player ownership._

---

## Report end — decisions & handoff

**Recommended next implementation slice:** _Checkpoint A_ — enable the three validated
production flags for real club QUICK rounds (config only, no code), then observe one live
round. This delivers the main goal for QUICK rounds immediately with lowest risk.

**Exact files likely affected (Checkpoint A):** none in the repo — Vercel environment
variables only (`FIREBASE_ACTIVE_ROUND_AUTO_PREP_ENABLED`,
`FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED`, `FIREBASE_REALTIME_SCORE_DISPLAY_ENABLED`).
For the follow-on slices: `components/round-editor.tsx` (`handleRealtimeScoreSnapshot`),
`lib/firebase/realtime-score-display.ts` (DETAILED reconcile), and a new client
retry/queue around `sendFirestoreTestScoreOperation`.

**Acceptance criteria (Checkpoint A):** on one live QUICK round, ≥2 phones (different
accounts) see each other's saved scores without refresh; a same-player conflict is
preserved and surfaced as "Review Needed"; posting afterward produces identical quotas,
payouts, skins, and stats to a mirror-off round; disabling the flags cleanly returns to
manual-refresh behavior with zero score loss.

**Estimated checkpoints remaining before reliable multi-user real-time scoring:**
- **1 checkpoint** for reliable **QUICK-mode** real-time (config only).
- **~3 checkpoints total** for reliable real-time across **all** rounds (add DETAILED-mode
  reconcile + reconnect/queue hardening).

**What Gary must do manually:**
- Confirm the deployed commit in Vercel and the current values of the three flags.
- Flip the flags in Vercel for Checkpoint A (I must not change env/Vercel).
- Run/observe the live validation round and confirm acceptance criteria.
- Decide whether DETAILED-mode real-time is required (drives Checkpoint B).

**What I can do automatically (on request, in code):**
- Implement DETAILED-mode reconcile and the client write-queue/retry.
- Consolidate duplicated rollout-flag constants and remove transitional `console.info`.
- Add the missing multi-phone / concurrency / offline / Firestore-down tests.
- Add an optimistic version guard to the Prisma granular score path.

**Continue this architecture or change direction?** **Continue.** The Prisma-authoritative,
Firestore-as-shadow-mirror design is sound, incrementally validated, and cheap to roll
back. It already meets the main goal for QUICK rounds behind flags. No architectural change
is warranted — the remaining work is finishing and hardening, not redesign. Deliberately
keep Prisma as posting/final authority for the foreseeable future.
