# Phase 4I-A Realtime Display Validation

## Scope

Phase 4I-A validated the disabled-by-default realtime QUICK-score display pilot in production after explicitly enabling the server-controlled pilot flag. Prisma remains authoritative, and Firestore remains a server-written mirror.

## Deployment

- Phase 4I-A deployed commit: `f67910b2e900b5b9f5213c09ead12b50661c373e`
- Active-round pointer rollover fix commit: `9f8dd1016b95271b99d8e9985df597000eebceba`

## Production Validation

- A four-player QUICK test round was used for validation.
- The round shell was prepared successfully.
- Four Firestore score mirrors were prepared successfully.
- Both test devices connected to the Firestore score listener.
- Both devices showed 4 score documents.
- Both devices showed 0 malformed score documents.
- A Phone A save appeared on Phone B without refreshing.
- A Phone B save appeared on Phone A without refreshing.
- The same-player conflict test preserved Phone B's unsaved value.
- The conflict warning appeared.
- Review Needed became 1.
- Refresh accepted the authoritative Prisma value and cleared the conflict.

## Cleanup

- The test round was canceled/cleared without posting.
- A read-only production check confirmed no active Prisma round remains.
- No quotas changed.
- No payouts changed.
- No results changed.
- No statistics changed.

## Authority And Security

- Prisma remains authoritative.
- Firestore remains server-written.
- Client Firestore writes remain denied.
- Phase 5 was not started.
