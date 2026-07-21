export const teeOptions = ["BLACK", "GREEN", "YELLOW", "WHITE"] as const;

export type Tee = (typeof teeOptions)[number];

export const defaultTee: Tee = "GREEN";

const teeRank: Record<Tee, number> = {
  BLACK: 0,
  GREEN: 1,
  YELLOW: 2,
  WHITE: 3
};

export const teeLabels: Record<Tee, string> = {
  BLACK: "Black",
  GREEN: "Green",
  YELLOW: "Yellow",
  WHITE: "White"
};

export function isTee(value: unknown): value is Tee {
  return typeof value === "string" && teeOptions.includes(value as Tee);
}

export function normalizeTee(value: unknown): Tee {
  return isTee(value) ? value : defaultTee;
}

export function requireTee(value: unknown, label = "Tee"): Tee {
  if (!isTee(value)) {
    throw new Error(`${label} must be Black, Green, Yellow, or White.`);
  }

  return value;
}

export function calculateTeeAdjustment(defaultPlayerTee: Tee, playingTee: Tee) {
  return (teeRank[playingTee] - teeRank[defaultPlayerTee]) * 2;
}

export function calculateAdjustedQuota(baseQuota: number, defaultPlayerTee: Tee, playingTee: Tee) {
  return baseQuota + calculateTeeAdjustment(defaultPlayerTee, playingTee);
}

export function moveTeeForward(tee: Tee): Tee {
  return teeOptions[Math.min(teeOptions.length - 1, teeRank[tee] + 1)];
}

export function moveTeeBack(tee: Tee): Tee {
  return teeOptions[Math.max(0, teeRank[tee] - 1)];
}

export function formatTeeAdjustment(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}
