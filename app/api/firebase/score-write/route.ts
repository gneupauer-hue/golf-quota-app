import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import {
  applyScoreWriteOperation,
  buildInitialScoreWriteDocument,
  handleScoreWriteRequest,
  normalizeExistingScoreDocument,
  type FirestoreScoreWriteDocument,
  type ScoreWriteMembership
} from "@/lib/firebase/score-write-route";
import { selectActivePrismaRoundScores } from "@/lib/firebase/score-mirror-prisma";

function buildFirestoreAdapters(db: Firestore) {
  return {
    verifyClub: async (clubId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).get();
      return snapshot.exists ? { id: clubId } : null;
    },
    readClubMembership: async (clubId: string, uid: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("members").doc(uid).get();

      if (!snapshot.exists) {
        return null;
      }

      return (snapshot.data() as ScoreWriteMembership | undefined) ?? null;
    }
  };
}

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  return handleScoreWriteRequest(request, {
    verifyIdToken: async (idToken) => auth.verifyIdToken(idToken),
    ...buildFirestoreAdapters(db),
    readActivePrismaRoundScores: async () => {
      const base = await selectActivePrismaRoundScores(prisma);

      if (!base) {
        return null;
      }

      const round = await prisma.round.findUnique({
        where: { id: base.id },
        select: {
          isTestRound: true,
          completedAt: true,
          canceledAt: true,
          isPayoutLocked: true
        }
      });

      if (!round) {
        return null;
      }

      return {
        ...base,
        isTestRound: round.isTestRound,
        completedAt: round.completedAt,
        canceledAt: round.canceledAt,
        isPayoutLocked: round.isPayoutLocked
      };
    },
    runScoreWriteTransaction: async (input) => {
      const docRef = db
        .collection("clubs")
        .doc(input.clubId)
        .collection("rounds")
        .doc(input.roundId)
        .collection("scores")
        .doc(input.prismaPlayerId);

      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const initial = buildInitialScoreWriteDocument(input.initialScore);
        const current = snapshot.exists
          ? normalizeExistingScoreDocument(input.prismaPlayerId, snapshot.data() ?? {}, initial)
          : initial;

        if (input.clientRequestId && current.lastClientRequestId === input.clientRequestId) {
          return {
            previousScoreVersion: current.scoreVersion,
            scoreVersion: current.scoreVersion,
            alreadyApplied: true,
            updatedFields: []
          };
        }

        if (
          input.expectedScoreVersion != null &&
          current.scoreVersion !== input.expectedScoreVersion
        ) {
          throw Object.assign(new Error("Score version conflict."), {
            status: 409,
            currentScoreVersion: current.scoreVersion
          });
        }

        const previousScoreVersion = current.scoreVersion;
        const nextVersion = previousScoreVersion + 1;
        const nowIso = new Date().toISOString();
        const { score, updatedFields } = applyScoreWriteOperation(
          { ...current, scoreVersion: nextVersion },
          input.operation,
          nowIso
        );

        transaction.set(docRef, {
          prismaRoundId: score.prismaRoundId,
          prismaEntryId: score.prismaEntryId,
          prismaPlayerId: score.prismaPlayerId,
          scoringEntryMode: score.scoringEntryMode,
          roundMode: score.roundMode,
          holes: score.holes,
          quickFrontNine: score.quickFrontNine,
          quickBackNine: score.quickBackNine,
          frontSubmittedAt: score.frontSubmittedAt,
          backSubmittedAt: score.backSubmittedAt,
          birdieHoles: score.birdieHoles,
          source: score.source,
          scoreVersion: score.scoreVersion,
          checksum: score.checksum,
          syncedAt: FieldValue.serverTimestamp(),
          lastOperationId: input.operationId,
          lastEditedByUid: input.uid,
          lastEditedAt: FieldValue.serverTimestamp(),
          lastClientRequestId: input.clientRequestId
        });

        return {
          previousScoreVersion,
          scoreVersion: score.scoreVersion,
          alreadyApplied: false,
          updatedFields
        };
      });
    }
  });
}
