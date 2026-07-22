# Migration Status — Firebase / Firestore

_Last updated: 2026-07-21. Companion to `docs/migration-audit.md` (the original
read-only audit). This file is the living status of what is live, what remains on the
old path, the flags/env, known limitations, and safe-to-remove legacy code._

---

## 1. Authoritative store per data type

**Prisma Postgres is authoritative for all game data.** Firestore is a real-time
**mirror** for cross-phone display, plus the authoritative store for auth/identity and
club membership (a separate concern from game data).

| Data type        | Authoritative store | Firestore role                                  |
| ---------------- | ------------------- | ----------------------------------------------- |
| Players          | **Prisma**          | Server-mirrored (read) via player-mirror routes |
| Rounds           | **Prisma**          | Server-mirrored (read) via round-mirror routes  |
| Scores           | **Prisma**          | Server-mirrored (read) via score-mirror/write   |
| Results / payouts| **Prisma**          | Not mirrored; computed from Prisma              |
| Season stats     | **Prisma**          | Not mirrored; computed from Prisma              |
| Quotas           | **Prisma**          | Not mirrored                                    |
| User identity / `defaultClubId` | **Firestore** (`users/{uid}`) | authoritative        |
| Club membership / approvals     | **Firestore** (`clubs/{id}/members`) | authoritative |

All Firestore game-data writes happen **server-side** through the Firebase Admin SDK in
`app/api/firebase/**` routes (inside `db.runTransaction`). The client never writes game
data to Firestore directly.

---

## 2. What is now live in Firebase

- **Server-side score/round/player mirroring** to Firestore (Admin SDK, granular,
  per-player docs — not one round blob).
- **Real-time cross-phone score display** — but see the limitation in §5: the client
  reconcile path only auto-updates in the legacy **QUICK** entry mode.
- **Phone (SMS) sign-in** for members, with owner-approval gating of score entry
  (`FIREBASE_REQUIRE_APPROVED_SCORER_ENABLED`).
- **Auto-preparation** of the active-round mirror when a round starts.

---

## 3. Feature flags (code default vs. production)

All flags are read as `env[FLAG] === "true"` — **anything other than the exact string
`"true"` (including unset) is OFF**. Defined in `lib/firebase/*-rollout.ts`.

| Flag | Controls | Code default | Local dev | Production value |
| ---- | -------- | ------------ | --------- | ---------------- |
| `FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED` | Server mirrors scores to Firestore | OFF | unset (OFF) | **Set in Vercel — confirm in dashboard** |
| `FIREBASE_REALTIME_SCORE_DISPLAY_ENABLED` | Client subscribes to live score display | OFF | unset (OFF) | **Set in Vercel — confirm in dashboard** |
| `FIREBASE_ACTIVE_ROUND_AUTO_PREP_ENABLED` | Auto-prep active-round mirror on start | OFF | unset (OFF) | **Set in Vercel — confirm in dashboard** |
| `FIREBASE_REQUIRE_APPROVED_SCORER_ENABLED` | Only approved members may enter scores | OFF (fail-open until on) | unset (OFF) | **Set in Vercel — confirm in dashboard** |

> **Cannot be verified from the repo.** Production flag values live only in the Vercel
> project env (`golf-quota-app`, project `prj_SzwPSdzT5O79bxVuHxHiSAf1rtdc`) and are not
> present in any committed or pulled `.env` file. Per the prior session they were all set
> to `"true"` in production. **Confirm the four values in the Vercel dashboard** before
> relying on live scoring. There is no Vercel CLI in this environment to check them
> programmatically.

No dev/test-only flag exists in the codebase (`TEAM_BUILDER_DEBUG` is a local debug log
gate, read only in dev tooling; it is not a production feature toggle).

---

## 4. Environment variables

**Firebase (client, `NEXT_PUBLIC_*`)** — public config, safe to expose:
`NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`,
`_MESSAGING_SENDER_ID`, `_APP_ID`.

**Firebase (server / Admin):** `FIREBASE_PROJECT_ID`, plus Vercel OIDC workload-identity
federation (`GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`,
`GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`) — Admin SDK
auth on Vercel uses the OIDC token, no static service-account key file.

**Database:** `DATABASE_URL` / `POSTGRES_URL` / `PRISMA_DATABASE_URL` (Prisma Postgres).

**Email (owner notifications):** `RESEND_API_KEY`, `NOTIFY_EMAIL_TO` — gated; if unset,
email notifications are skipped (non-fatal).

> Values are not reproduced here. Confirm presence/values in the Vercel dashboard.

---

## 5. Known limitations

1. **Live cross-phone auto-update does not run in hole-by-hole (DETAILED) mode.**
   `reconcileRealtimeQuickScoreDisplay` and `handleRealtimeScoreSnapshot` both bail unless
   `scoringEntryMode === "QUICK"` (`lib/firebase/realtime-score-display.ts:87`,
   `components/round-editor.tsx:2857`). **The app is now hole-by-hole only**, so during a
   live round other phones pull new scores on **Refresh / reload**, not via instant push.
   Scores still persist to Prisma immediately and are never lost — this is a display-push
   gap, not a data gap. **Wiring instant push for hole-by-hole is the main open item if
   Gary wants true second-by-second live updates.** (Flagged to Gary.)

2. **No per-cell optimistic locking.** Two clients writing the *exact same hole for the
   same player* is last-write-wins (documented and tested in
   `tests/post-migration-concurrency.test.ts` CASE 2c). All other collisions (different
   holes, different players, same hole/different players) are safe — the server merges
   each granular patch against fresh DB state inside a transaction. Client-side conflict
   detection (`conflictPlayerIds`) exists only in QUICK mode.

3. **Production flag/deploy values are not verifiable from the repo** (no Vercel CLI). See
   §3 and §6.

---

## 6. Git / deploy state (at time of writing)

- Branch `main`, working tree clean, HEAD = `origin/main`.
- **Vercel production commit not verified from here.** Vercel auto-deploys `main`
  (project `golf-quota-app`); confirm the deployed commit hash in the Vercel dashboard
  matches the latest pushed commit.

---

## 7. Legacy code safe to remove in a future cleanup pass

_Listed, not removed. Verify each is unreferenced before deleting in a dedicated PR._

- **`SettingsTab`** in `components/round-editor.tsx` (~line 6203) — a round-settings tab
  (incl. an editable round-date field) that is **no longer rendered anywhere** (only
  referenced in the stale `dev_final.err` log). Dead component. _Note: because it's the
  only in-app round-date editor and it's disconnected, there is currently no way to change
  a round's date after creation — decide whether to delete it or re-wire it (see §8)._
- **QUICK-entry UI paths** now that creation is hole-by-hole only: the `isQuickEntryMode`
  render branch and `QuickEntryRoundView` usage in `round-editor.tsx`, and the
  "Switch to Hole-by-Hole" card. Keep for now — legacy QUICK rounds in history still read
  through this code, and the QUICK realtime reconcile is the only working live-push path.
  Only remove once (a) no active QUICK rounds exist and (b) hole-by-hole live push ships.
- **`dev_final.err`** — a build/error log checked into the repo root; not code, safe to
  delete.

> Do **not** remove the server-side mirror routes, rollout files, `mergeScoreEntryPatch`,
> or the realtime reconcile — they are live.

---

## 8. Needs an owner decision

- **Hole-by-hole live push:** wire instant cross-phone updates for DETAILED mode, or keep
  refresh-to-sync? (Live scoring starts tomorrow on hole-by-hole.)
- **Editing a round's date after creation:** currently impossible (the only editor,
  `SettingsTab`, is unwired). Re-wire it or accept delete-and-recreate as the workflow.
- **Confirm the four production flag values** in the Vercel dashboard (§3).
