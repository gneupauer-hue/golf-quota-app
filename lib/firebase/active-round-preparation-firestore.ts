import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  ACTIVE_ROUND_PREPARATION_LOCK_ID,
  ACTIVE_ROUND_PREPARATION_STATE_ID,
  type ActiveRoundPreparationReadiness
} from "@/lib/firebase/active-round-preparation";

const PREPARATION_LOCK_TTL_MS = 2 * 60 * 1000;

function mapTimestamp(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  return null;
}

export function buildActiveRoundPreparationFirestoreAdapters(db: Firestore) {
  return {
    verifyClub: async (clubId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() as { name?: string | null } | undefined;
      return { id: clubId, name: data?.name ?? null };
    },
    readClubMembership: async (clubId: string, uid: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("members").doc(uid).get();
      if (!snapshot.exists) return null;
      return snapshot.data() ?? null;
    },
    readFirestoreRound: async (clubId: string, roundId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("rounds").doc(roundId).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() as { prismaRoundId?: unknown; checksum?: unknown } | undefined;
      return {
        docId: snapshot.id,
        prismaRoundId: typeof data?.prismaRoundId === "string" ? data.prismaRoundId : snapshot.id,
        checksum: typeof data?.checksum === "string" ? data.checksum : ""
      };
    },
    readFirestoreRoundEntries: async (clubId: string, roundId: string) => {
      const snapshot = await db
        .collection("clubs")
        .doc(clubId)
        .collection("rounds")
        .doc(roundId)
        .collection("entries")
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data() as { prismaPlayerId?: unknown; checksum?: unknown };
        return {
          docId: doc.id,
          prismaPlayerId: typeof data.prismaPlayerId === "string" ? data.prismaPlayerId : doc.id,
          checksum: typeof data.checksum === "string" ? data.checksum : ""
        };
      });
    },
    readFirestoreActivePointer: async (clubId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("state").doc("activeRound").get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() as {
        roundId?: unknown;
        prismaRoundId?: unknown;
        checksum?: unknown;
      } | undefined;
      return {
        roundId: typeof data?.roundId === "string" ? data.roundId : undefined,
        prismaRoundId: typeof data?.prismaRoundId === "string" ? data.prismaRoundId : undefined,
        checksum: typeof data?.checksum === "string" ? data.checksum : ""
      };
    },
    readFirestoreScores: async (clubId: string, roundId: string) => {
      const snapshot = await db
        .collection("clubs")
        .doc(clubId)
        .collection("rounds")
        .doc(roundId)
        .collection("scores")
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          docId: doc.id,
          prismaRoundId: typeof data.prismaRoundId === "string" ? data.prismaRoundId : undefined,
          prismaEntryId: typeof data.prismaEntryId === "string" ? data.prismaEntryId : undefined,
          prismaPlayerId: typeof data.prismaPlayerId === "string" ? data.prismaPlayerId : doc.id,
          playerName: typeof data.playerName === "string" ? data.playerName : null,
          checksum: typeof data.checksum === "string" ? data.checksum : "",
          source: data.source,
          scoreVersion: data.scoreVersion,
          holes: data.holes,
          quickFrontNine: data.quickFrontNine,
          quickBackNine: data.quickBackNine,
          birdieHoles: data.birdieHoles,
          lastOperationId: data.lastOperationId,
          lastEditedByUid: data.lastEditedByUid,
          lastEditedAt: data.lastEditedAt,
          lastClientRequestId: data.lastClientRequestId
        };
      });
    },
    acquirePreparationLock: async (clubId: string, operationId: string) => {
      const lockRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("syncLocks")
        .doc(ACTIVE_ROUND_PREPARATION_LOCK_ID);

      const acquired = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lockRef);
        const data = snapshot.data() as { operationId?: unknown; expiresAt?: unknown } | undefined;
        const expiresAt = mapTimestamp(data?.expiresAt);

        if (snapshot.exists && expiresAt && expiresAt.getTime() > Date.now()) {
          return false;
        }

        transaction.set(lockRef, {
          operationId,
          lockedBy: "server",
          lockedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromDate(new Date(Date.now() + PREPARATION_LOCK_TTL_MS))
        });
        return true;
      });

      if (!acquired) return "preparing" as const;

      return async () => {
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(lockRef);
          const data = snapshot.data() as { operationId?: unknown } | undefined;
          if (snapshot.exists && data?.operationId === operationId) {
            transaction.delete(lockRef);
          }
        });
      };
    },
    writeReadiness: async (clubId: string, readiness: ActiveRoundPreparationReadiness) => {
      await db
        .collection("clubs")
        .doc(clubId)
        .collection("state")
        .doc(ACTIVE_ROUND_PREPARATION_STATE_ID)
        .set({
          ...readiness,
          updatedAt: FieldValue.serverTimestamp()
        });
    },
    writePreparationBatch: async (clubId: string, roundId: string, input: any) => {
      const clubRef = db.collection("clubs").doc(clubId);
      const roundRef = clubRef.collection("rounds").doc(roundId);
      const now = FieldValue.serverTimestamp();
      const batch = db.batch();
      let writes = 0;

      if (input.round) {
        batch.set(roundRef, { ...input.round, syncedAt: now });
        writes += 1;
      }
      for (const entry of input.entries) {
        batch.set(roundRef.collection("entries").doc(entry.prismaPlayerId), {
          ...entry,
          syncedAt: now
        });
        writes += 1;
      }
      if (input.activePointer) {
        batch.set(clubRef.collection("state").doc("activeRound"), {
          ...input.activePointer,
          syncedAt: now
        });
        writes += 1;
      }
      for (const score of input.scoresToCreate) {
        batch.set(roundRef.collection("scores").doc(score.prismaPlayerId), {
          ...score,
          syncedAt: now
        });
        writes += 1;
      }
      batch.set(clubRef.collection("state").doc(ACTIVE_ROUND_PREPARATION_STATE_ID), {
        ...input.readiness,
        updatedAt: now
      });
      writes += 1;

      await batch.commit();
      return writes;
    }
  };
}
