import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayersManager } from "@/components/players-manager";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const quotaAudit = {
  totalPlayersChecked: 0,
  totalRoundsChecked: 0,
  mismatchCount: 0,
  issues: []
};

function makeHistory(roundId: string) {
  return [
    {
      roundId,
      roundName: "Fixture Round",
      roundDate: "2026-07-01T12:00:00.000Z",
      completedAt: "2026-07-01T18:00:00.000Z",
      createdAt: "2026-07-01T11:00:00.000Z",
      totalPoints: 32,
      startQuota: 30,
      plusMinus: 2,
      nextQuota: 31,
      quotaMovement: 1
    }
  ];
}

function makePlayer(overrides: {
  id: string;
  name: string;
  quota: number;
  defaultTee?: "BLACK" | "GREEN" | "YELLOW" | "WHITE" | null;
  history?: ReturnType<typeof makeHistory>;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    quota: overrides.quota,
    defaultTee: overrides.defaultTee,
    isRegular: true,
    isActive: true,
    conflictIds: [],
    history: overrides.history ?? []
  };
}

function renderPlayers(defaultTeeOverride?: null) {
  return renderToStaticMarkup(
    <PlayersManager
      initialPlayers={[
        makePlayer({
          id: "fictional-current-black",
          name: "Avery Stone",
          quota: 28,
          defaultTee: "BLACK",
          history: makeHistory("round-current-black")
        }),
        makePlayer({
          id: "fictional-current-green",
          name: "Blake Harbor",
          quota: 24,
          defaultTee: "GREEN",
          history: makeHistory("round-current-green")
        }),
        makePlayer({
          id: "fictional-dormant-yellow",
          name: "Casey Ridge",
          quota: 18,
          defaultTee: "YELLOW"
        }),
        makePlayer({
          id: "fictional-dormant-white",
          name: "Devon Vale",
          quota: 16,
          defaultTee: "WHITE"
        }),
        makePlayer({
          id: "fictional-legacy-missing",
          name: "Elliot Grove",
          quota: 20,
          defaultTee: defaultTeeOverride
        })
      ]}
      initialQuotaAudit={quotaAudit}
      initialBaselineRows={[]}
    />
  );
}

test("Players page shows saved tee labels for current and dormant fictional players", () => {
  const html = renderPlayers();

  assert.match(html, /Current Players/);
  assert.match(html, /Dormant Players/);
  assert.match(html, /Avery Stone/);
  assert.match(html, /Casey Ridge/);
  assert.match(html, /Black/);
  assert.match(html, /Yellow/);
});

test("Players page renders Black, Green, Yellow, and White tee labels dynamically", () => {
  const html = renderPlayers();

  for (const label of ["Black", "Green", "Yellow", "White"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }

  assert.doesNotMatch(html, /Gary|Frankie|Rubbico|Weiscarger/);
});

test("tee information is visible in read-only roster markup outside edit mode", () => {
  const html = renderPlayers();

  assert.match(html, /Tee/);
  assert.match(html, /Edit Players/);
  assert.match(html, /Avery Stone/);
  assert.match(html, /Black/);
  assert.doesNotMatch(html, /Default Tee/);
});

test("missing legacy tee fixture displays the existing Green fallback without writing data", () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("Rendering must not update players.");
  }) as typeof fetch;

  try {
    const html = renderPlayers(null);

    assert.match(html, /Elliot Grove/);
    assert.match(html, />Green</);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
