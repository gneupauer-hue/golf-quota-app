export type BaselineQuota2026 = {
  player_name: string;
  baseline_quota: number;
};

export const BASELINE_SEASON_START_2026 = new Date("2026-04-19T00:00:00.000Z");

export const baseline_quotas_2026: BaselineQuota2026[] = [
  { player_name: "Avery Cole", baseline_quota: 27 },
  { player_name: "Blake Morgan", baseline_quota: 34 },
  { player_name: "Cameron Reed", baseline_quota: 33 },
  { player_name: "Dakota Lane", baseline_quota: 23 },
  { player_name: "Emerson Shaw", baseline_quota: 17 },
  { player_name: "Finley Brooks", baseline_quota: 32 },
  { player_name: "Gray Parker", baseline_quota: 28 },
  { player_name: "Harper Quinn", baseline_quota: 27 },
  { player_name: "Indigo Flynn", baseline_quota: 30 },
  { player_name: "Jordan Ellis", baseline_quota: 34 },
  { player_name: "Kai Turner", baseline_quota: 25 },
  { player_name: "Logan Hayes", baseline_quota: 34 },
  { player_name: "Morgan Price", baseline_quota: 23 },
  { player_name: "Nico Avery", baseline_quota: 15 },
  { player_name: "Oakley Stone", baseline_quota: 30 },
  { player_name: "Parker West", baseline_quota: 15 },
  { player_name: "Quinn Adler", baseline_quota: 26 },
  { player_name: "River Boone", baseline_quota: 21 },
  { player_name: "Sage Carter", baseline_quota: 22 },
  { player_name: "Taylor Dean", baseline_quota: 23 },
  { player_name: "Uma Foster", baseline_quota: 25 },
  { player_name: "Valen Grant", baseline_quota: 33 },
  { player_name: "Winter Hale", baseline_quota: 30 },
  { player_name: "Xen Harper", baseline_quota: 29 },
  { player_name: "Yael Irwin", baseline_quota: 29 },
  { player_name: "Zion Keller", baseline_quota: 15 },
  { player_name: "Arden Lewis", baseline_quota: 31 },
  { player_name: "Briar Monroe", baseline_quota: 30 },
  { player_name: "Cedar Nolan", baseline_quota: 30 },
  { player_name: "Drew Oak", baseline_quota: 31 },
  { player_name: "Elliot Page", baseline_quota: 26 },
  { player_name: "Frankie Reese", baseline_quota: 41 },
  { player_name: "Gale Sutton", baseline_quota: 32 },
  { player_name: "Hollis Tate", baseline_quota: 29 },
  { player_name: "Jules Upton", baseline_quota: 27 },
  { player_name: "Kendall Vale", baseline_quota: 34 },
  { player_name: "Lennon Ward", baseline_quota: 26 },
  { player_name: "Marin York", baseline_quota: 22 },
  { player_name: "Noel Zane", baseline_quota: 21 },
  { player_name: "Orion Ames", baseline_quota: 38 },
  { player_name: "Presley Birch", baseline_quota: 27 }
];

const baselineQuotaMap = new Map<string, number>(
  baseline_quotas_2026.map((entry) => [entry.player_name, entry.baseline_quota])
);

const baselineNameAliases = new Map<string, string>();

export function getBaselineQuota2026(playerName: string) {
  return baselineQuotaMap.get(playerName) ?? baselineQuotaMap.get(baselineNameAliases.get(playerName) ?? "");
}

export function requireBaselineQuota2026(playerName: string) {
  const baselineQuota = getBaselineQuota2026(playerName);
  if (baselineQuota == null) {
    throw new Error(`Missing 2026 baseline quota for ${playerName}.`);
  }

  return baselineQuota;
}

export function getMissingBaselineQuota2026(playerNames: string[]) {
  return [...new Set(playerNames)]
    .filter((playerName) => getBaselineQuota2026(playerName) == null)
    .sort((left, right) => left.localeCompare(right));
}
