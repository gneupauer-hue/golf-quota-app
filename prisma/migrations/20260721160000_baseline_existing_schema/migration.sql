-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quota" INTEGER,
    "startingQuota" INTEGER NOT NULL,
    "currentQuota" INTEGER NOT NULL,
    "isRegular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "roundName" TEXT NOT NULL,
    "roundDate" TIMESTAMP(3) NOT NULL,
    "roundMode" TEXT NOT NULL DEFAULT 'MATCH_QUOTA',
    "scoringEntryMode" TEXT NOT NULL DEFAULT 'DETAILED',
    "isTestRound" BOOLEAN NOT NULL DEFAULT false,
    "isPayoutLocked" BOOLEAN NOT NULL DEFAULT false,
    "paidPlayerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "buyInPaidPlayerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "teamCount" INTEGER,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonConfig" (
    "id" INTEGER NOT NULL,
    "seasonStartDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundEntry" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "team" TEXT,
    "groupNumber" INTEGER,
    "teeTime" TEXT,
    "frontSubmittedAt" TIMESTAMP(3),
    "backSubmittedAt" TIMESTAMP(3),
    "quickFrontNine" INTEGER,
    "quickBackNine" INTEGER,
    "birdieHolesCsv" TEXT,
    "startQuota" INTEGER NOT NULL,
    "hole1" INTEGER,
    "hole2" INTEGER,
    "hole3" INTEGER,
    "hole4" INTEGER,
    "hole5" INTEGER,
    "hole6" INTEGER,
    "hole7" INTEGER,
    "hole8" INTEGER,
    "hole9" INTEGER,
    "hole10" INTEGER,
    "hole11" INTEGER,
    "hole12" INTEGER,
    "hole13" INTEGER,
    "hole14" INTEGER,
    "hole15" INTEGER,
    "hole16" INTEGER,
    "hole17" INTEGER,
    "hole18" INTEGER,
    "frontQuota" INTEGER NOT NULL DEFAULT 0,
    "backQuota" INTEGER NOT NULL DEFAULT 0,
    "frontNine" INTEGER NOT NULL DEFAULT 0,
    "backNine" INTEGER NOT NULL DEFAULT 0,
    "frontPlusMinus" INTEGER NOT NULL DEFAULT 0,
    "backPlusMinus" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "plusMinus" INTEGER NOT NULL,
    "nextQuota" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "RoundEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerConflict" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "conflictPlayerId" TEXT NOT NULL,

    CONSTRAINT "PlayerConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundTeamResult" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "frontPoints" INTEGER NOT NULL,
    "frontQuota" INTEGER NOT NULL,
    "frontPlusMinus" INTEGER NOT NULL,
    "backPoints" INTEGER NOT NULL,
    "backQuota" INTEGER NOT NULL,
    "backPlusMinus" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "totalQuota" INTEGER NOT NULL,
    "totalPlusMinus" INTEGER NOT NULL,

    CONSTRAINT "RoundTeamResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundSkinHole" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "eligiblePlayerIds" TEXT,
    "eligibleNames" TEXT,
    "carryover" BOOLEAN NOT NULL DEFAULT false,
    "skinAwarded" BOOLEAN NOT NULL DEFAULT false,
    "winnerPlayerId" TEXT,
    "winnerName" TEXT,
    "sharesCaptured" INTEGER NOT NULL DEFAULT 0,
    "activeCarryover" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoundSkinHole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundPayoutSummary" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "frontPot" INTEGER NOT NULL,
    "backPot" INTEGER NOT NULL,
    "totalPot" INTEGER NOT NULL,
    "skinsPot" INTEGER NOT NULL,
    "leaderCount" INTEGER NOT NULL,
    "payoutCount" INTEGER NOT NULL,
    "casherCount" INTEGER NOT NULL,
    "totalSkinSharesWon" INTEGER NOT NULL,
    "valuePerSkin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activeCarryoverCount" INTEGER NOT NULL DEFAULT 0,
    "activeCarryoverHoles" TEXT,

    CONSTRAINT "RoundPayoutSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundSideMatch" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "name" TEXT,
    "teamAPlayerIds" TEXT[],
    "teamBPlayerIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundSideMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_name_key" ON "Player"("name");

-- CreateIndex
CREATE INDEX "Round_roundDate_createdAt_idx" ON "Round"("roundDate", "createdAt");

-- CreateIndex
CREATE INDEX "RoundEntry_roundId_rank_idx" ON "RoundEntry"("roundId", "rank");

-- CreateIndex
CREATE INDEX "RoundEntry_playerId_roundId_idx" ON "RoundEntry"("playerId", "roundId");

-- CreateIndex
CREATE INDEX "RoundEntry_roundId_team_idx" ON "RoundEntry"("roundId", "team");

-- CreateIndex
CREATE UNIQUE INDEX "RoundEntry_roundId_playerId_key" ON "RoundEntry"("roundId", "playerId");

-- CreateIndex
CREATE INDEX "PlayerConflict_conflictPlayerId_idx" ON "PlayerConflict"("conflictPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerConflict_playerId_conflictPlayerId_key" ON "PlayerConflict"("playerId", "conflictPlayerId");

-- CreateIndex
CREATE INDEX "RoundTeamResult_roundId_totalPlusMinus_idx" ON "RoundTeamResult"("roundId", "totalPlusMinus");

-- CreateIndex
CREATE UNIQUE INDEX "RoundTeamResult_roundId_team_key" ON "RoundTeamResult"("roundId", "team");

-- CreateIndex
CREATE INDEX "RoundSkinHole_roundId_holeNumber_idx" ON "RoundSkinHole"("roundId", "holeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RoundSkinHole_roundId_holeNumber_key" ON "RoundSkinHole"("roundId", "holeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RoundPayoutSummary_roundId_key" ON "RoundPayoutSummary"("roundId");

-- CreateIndex
CREATE INDEX "RoundSideMatch_roundId_createdAt_idx" ON "RoundSideMatch"("roundId", "createdAt");

-- AddForeignKey
ALTER TABLE "RoundEntry" ADD CONSTRAINT "RoundEntry_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundEntry" ADD CONSTRAINT "RoundEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerConflict" ADD CONSTRAINT "PlayerConflict_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerConflict" ADD CONSTRAINT "PlayerConflict_conflictPlayerId_fkey" FOREIGN KEY ("conflictPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundTeamResult" ADD CONSTRAINT "RoundTeamResult_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundSkinHole" ADD CONSTRAINT "RoundSkinHole_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundPayoutSummary" ADD CONSTRAINT "RoundPayoutSummary_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundSideMatch" ADD CONSTRAINT "RoundSideMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
