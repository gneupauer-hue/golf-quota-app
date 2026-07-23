import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGameChangedText,
  buildNewGameText,
  describeGameChanges,
  formatGameDate,
  formatGameLabel,
  formatGameTime,
  isUpcoming,
  normalizeGameInput,
  sortGamesByStart,
  type GameRecord
} from "@/lib/games/game-core";

const APP_URL = "https://golf-quota-app-three.vercel.app";

test("normalizeGameInput trims and accepts a valid game", () => {
  const game = normalizeGameInput({
    course: "  Irem   Temple  ",
    date: "2026-07-25",
    time: "12:30",
    note: "  Bring cash  "
  });
  assert.equal(game.course, "Irem Temple");
  assert.equal(game.date, "2026-07-25");
  assert.equal(game.time, "12:30");
  assert.equal(game.note, "Bring cash");
});

test("normalizeGameInput rejects bad date and time", () => {
  assert.throws(() => normalizeGameInput({ course: "Irem", date: "7/25/2026", time: "12:30" }), /valid date/);
  assert.throws(() => normalizeGameInput({ course: "Irem", date: "2026-07-25", time: "25:00" }), /valid tee time/);
  assert.throws(() => normalizeGameInput({ course: "I", date: "2026-07-25", time: "12:30" }), /Enter the course/);
});

test("date formatting does not shift the day (no UTC drift)", () => {
  // A date parsed as UTC would render as the previous day in US timezones.
  assert.match(formatGameDate("2026-07-25"), /Jul 25/);
  assert.match(formatGameDate("2026-01-01"), /Jan 1/);
});

test("time formats to 12-hour", () => {
  assert.equal(formatGameTime("12:30"), "12:30 PM");
  assert.equal(formatGameTime("09:30"), "9:30 AM");
  assert.equal(formatGameTime("00:15"), "12:15 AM");
  assert.equal(formatGameTime("13:05"), "1:05 PM");
});

test("new game text names the course, date, and time", () => {
  const text = buildNewGameText({ course: "Irem", date: "2026-07-25", time: "12:30" }, APP_URL);
  assert.match(text, /New golf game/);
  assert.match(text, /Irem/);
  assert.match(text, /12:30 PM/);
  assert.match(text, /Open the Irem app/);
  assert.match(text, /golf-quota-app-three/);
});

test("a time change produces a clear change alert", () => {
  const before = { course: "Irem", date: "2026-07-25", time: "12:30" };
  const after = { course: "Irem", date: "2026-07-25", time: "09:30" };
  const text = buildGameChangedText(before, after, APP_URL);
  assert.ok(text);
  assert.match(text, /12:30 PM/);
  assert.match(text, /9:30 AM/);
});

test("editing only the note does NOT trigger a change text", () => {
  const before = { course: "Irem", date: "2026-07-25", time: "12:30", note: "old" };
  const after = { course: "Irem", date: "2026-07-25", time: "12:30", note: "new" };
  assert.equal(describeGameChanges(before, after).length, 0);
  assert.equal(buildGameChangedText(before, after, APP_URL), null);
});

test("isUpcoming keeps a game through the end of its day", () => {
  const game = { course: "Irem", date: "2026-07-25", time: "09:30" };
  // Same day, well after the tee time — still upcoming (game is in progress).
  assert.equal(isUpcoming(game, new Date(2026, 6, 25, 20, 0, 0)), true);
  // Next morning — done.
  assert.equal(isUpcoming(game, new Date(2026, 6, 26, 8, 0, 0)), false);
});

test("games sort by date then tee time", () => {
  const base = { createdByUid: "u", createdByName: "Gary", createdAt: "", course: "Irem" };
  const games: GameRecord[] = [
    { ...base, id: "b", date: "2026-07-26", time: "09:00" },
    { ...base, id: "c", date: "2026-07-25", time: "13:00" },
    { ...base, id: "a", date: "2026-07-25", time: "08:00" }
  ];
  assert.deepEqual(sortGamesByStart(games).map((game) => game.id), ["a", "c", "b"]);
});

test("formatGameLabel reads naturally", () => {
  const label = formatGameLabel({ course: "Irem", date: "2026-07-25", time: "12:30" });
  assert.match(label, /^Irem — .*Jul 25 at 12:30 PM$/);
});
