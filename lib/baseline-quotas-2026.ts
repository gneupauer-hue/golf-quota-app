export type BaselineQuota2026 = {
  player_name: string;
  baseline_quota: number;
};

export const BASELINE_SEASON_START_2026 = new Date("2026-04-19T00:00:00.000Z");

export const baseline_quotas_2026: BaselineQuota2026[] = [
  { player_name: "AJ Kochanski", baseline_quota: 26 },
  { player_name: "Billy Mattioli", baseline_quota: 27 },
  { player_name: "Bob Ashworth", baseline_quota: 21 },
  { player_name: "Bob Lipski", baseline_quota: 34 },
  { player_name: "Bogey", baseline_quota: 22 },
  { player_name: "Brandon Wills", baseline_quota: 33 },
  { player_name: "Brett Sikora", baseline_quota: 23 },
  { player_name: "Brett Slocum", baseline_quota: 25 },
  { player_name: "Broj", baseline_quota: 33 },
  { player_name: "Chad DeBona", baseline_quota: 30 },
  { player_name: "Chad Kelley", baseline_quota: 23 },
  { player_name: "Charlie Gelso", baseline_quota: 29 },
  { player_name: "Chris Jones", baseline_quota: 29 },
  { player_name: "Chris Sikora", baseline_quota: 15 },
  { player_name: "Chuck Brand", baseline_quota: 31 },
  { player_name: "Cooper Kelly", baseline_quota: 30 },
  { player_name: "Dave Straley", baseline_quota: 30 },
  { player_name: "Dave Yurko", baseline_quota: 31 },
  { player_name: "Derek Shurmanek", baseline_quota: 26 },
  { player_name: "Ethan Zawatski", baseline_quota: 41 },
  { player_name: "Gary Neupauer", baseline_quota: 17 },
  { player_name: "Jack Fenwick", baseline_quota: 32 },
  { player_name: "Jack Morris", baseline_quota: 29 },
  { player_name: "Jake Humphreys", baseline_quota: 27 },
  { player_name: "Jay Thomas", baseline_quota: 32 },
  { player_name: "Jeff Hodorowski", baseline_quota: 28 },
  { player_name: "Jim Blinn", baseline_quota: 34 },
  { player_name: "Jim Fronzoni", baseline_quota: 26 },
  { player_name: "Joe Bevavino", baseline_quota: 34 },
  { player_name: "Joe Collini", baseline_quota: 32 },
  { player_name: "Joe Rubbico", baseline_quota: 27 },
  { player_name: "John Ashley", baseline_quota: 32 },
  { player_name: "John Thomas", baseline_quota: 27 },
  { player_name: "Jonathon Wilson", baseline_quota: 41 },
  { player_name: "Lou Belgio", baseline_quota: 30 },
  { player_name: "Marty Behm", baseline_quota: 34 },
  { player_name: "Matt Alfano", baseline_quota: 19 },
  { player_name: "Mike Aritz", baseline_quota: 22 },
  { player_name: "Mike Boland", baseline_quota: 32 },
  { player_name: "Mike Lipski", baseline_quota: 23 },
  { player_name: "Mike Mahasky", baseline_quota: 25 },
  { player_name: "Mike Wills", baseline_quota: 34 },
  { player_name: "Pat Murray", baseline_quota: 26 },
  { player_name: "Phil Lipski", baseline_quota: 22 },
  { player_name: "Rob Michaels", baseline_quota: 23 },
  { player_name: "Ron Prokrinchak", baseline_quota: 21 },
  { player_name: "Ryan Holthaus", baseline_quota: 15 },
  { player_name: "Scott Francis", baseline_quota: 30 },
  { player_name: "Scott Schifter", baseline_quota: 15 },
  { player_name: "Tony Bevevino", baseline_quota: 38 },
  { player_name: "Travis Debona", baseline_quota: 27 }
];

const baselineQuotaMap = new Map<string, number>(
  baseline_quotas_2026.map((entry) => [entry.player_name, entry.baseline_quota])
);

const baselineNameAliases = new Map<string, string>([
  ["Chad Kelly", "Chad Kelley"]
]);

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
