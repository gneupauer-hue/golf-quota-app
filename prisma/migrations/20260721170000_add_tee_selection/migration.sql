ALTER TABLE "Player"
ADD COLUMN "defaultTee" TEXT NOT NULL DEFAULT 'GREEN';

ALTER TABLE "RoundEntry"
ADD COLUMN "defaultTeeSnapshot" TEXT NOT NULL DEFAULT 'GREEN',
ADD COLUMN "playingTee" TEXT NOT NULL DEFAULT 'GREEN',
ADD COLUMN "baseQuota" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "teeAdjustment" INTEGER NOT NULL DEFAULT 0;

UPDATE "Player"
SET "defaultTee" = 'GREEN'
WHERE "defaultTee" IS NULL OR "defaultTee" = '';

UPDATE "RoundEntry"
SET
  "defaultTeeSnapshot" = 'GREEN',
  "playingTee" = 'GREEN',
  "teeAdjustment" = 0,
  "baseQuota" = "startQuota";

ALTER TABLE "Player"
ADD CONSTRAINT "Player_defaultTee_check"
CHECK ("defaultTee" IN ('BLACK', 'GREEN', 'YELLOW', 'WHITE'));

ALTER TABLE "RoundEntry"
ADD CONSTRAINT "RoundEntry_defaultTeeSnapshot_check"
CHECK ("defaultTeeSnapshot" IN ('BLACK', 'GREEN', 'YELLOW', 'WHITE'));

ALTER TABLE "RoundEntry"
ADD CONSTRAINT "RoundEntry_playingTee_check"
CHECK ("playingTee" IN ('BLACK', 'GREEN', 'YELLOW', 'WHITE'));

ALTER TABLE "RoundEntry"
ADD CONSTRAINT "RoundEntry_teeQuotaInvariant_check"
CHECK ("startQuota" = "baseQuota" + "teeAdjustment");
