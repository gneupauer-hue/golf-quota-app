// Pure logic for the game board: validation, display formatting, and detecting
// what changed so we can text the right people. No Firestore/network here so it
// stays easy to test.

export type GameInput = {
  course: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM in 24-hour time */
  time: string;
  note?: string;
};

export type GameRecord = GameInput & {
  id: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  canceledAt?: string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeGameInput(input: {
  course?: unknown;
  date?: unknown;
  time?: unknown;
  note?: unknown;
}): GameInput {
  const course = typeof input.course === "string" ? input.course.trim().replace(/\s+/g, " ") : "";
  if (course.length < 2) {
    throw Object.assign(new Error("Enter the course."), { status: 400 });
  }
  if (course.length > 60) {
    throw Object.assign(new Error("Course name is too long."), { status: 400 });
  }

  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!DATE_PATTERN.test(date)) {
    throw Object.assign(new Error("Pick a valid date."), { status: 400 });
  }

  const time = typeof input.time === "string" ? input.time.trim() : "";
  if (!TIME_PATTERN.test(time)) {
    throw Object.assign(new Error("Pick a valid tee time."), { status: 400 });
  }

  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > 200) {
    throw Object.assign(new Error("Note is too long."), { status: 400 });
  }

  return { course, date, time, ...(note ? { note } : {}) };
}

/** Parse YYYY-MM-DD as a LOCAL date so the day never shifts via UTC. */
function toLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map((part) => Number(part));
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function formatGameDate(date: string): string {
  const parsed = toLocalDate(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

export function formatGameTime(time: string): string {
  const match = TIME_PATTERN.exec(time);
  if (!match) {
    return time;
  }
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${suffix}`;
}

/** e.g. "Irem — Fri Jul 25 at 12:30 PM" */
export function formatGameLabel(game: GameInput): string {
  return `${game.course} — ${formatGameDate(game.date)} at ${formatGameTime(game.time)}`;
}

export function buildNewGameText(game: GameInput, appUrl: string): string {
  const note = game.note ? ` ${game.note}` : "";
  return (
    `New golf game — ${formatGameLabel(game)}.${note} ` +
    `Open the Irem app to say you're in, see who's playing, keep score, and view stats: ${appUrl}`
  );
}

/** Human-readable list of what changed between two versions of a game. */
export function describeGameChanges(before: GameInput, after: GameInput): string[] {
  const changes: string[] = [];
  if (before.date !== after.date) {
    changes.push(`date moved from ${formatGameDate(before.date)} to ${formatGameDate(after.date)}`);
  }
  if (before.time !== after.time) {
    changes.push(`time moved from ${formatGameTime(before.time)} to ${formatGameTime(after.time)}`);
  }
  if (before.course !== after.course) {
    changes.push(`course changed from ${before.course} to ${after.course}`);
  }
  return changes;
}

/**
 * The change alert. Returns null when nothing worth texting about changed —
 * editing only the note shouldn't blast everyone.
 */
export function buildGameChangedText(
  before: GameInput,
  after: GameInput,
  appUrl: string
): string | null {
  const changes = describeGameChanges(before, after);
  if (!changes.length) {
    return null;
  }
  return `Golf game update — ${formatGameLabel(after)}: ${changes.join("; ")}. ${appUrl}`;
}

/** Upcoming games first; a game is "past" the day after it is played. */
export function isUpcoming(game: GameInput, now: Date): boolean {
  const played = toLocalDate(game.date);
  const endOfDay = new Date(played.getFullYear(), played.getMonth(), played.getDate(), 23, 59, 59);
  return endOfDay.getTime() >= now.getTime();
}

export function sortGamesByStart(games: GameRecord[]): GameRecord[] {
  return [...games].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }
    return left.time.localeCompare(right.time);
  });
}
