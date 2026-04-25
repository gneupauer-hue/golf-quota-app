export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function coerceDate(date: Date | string) {
  if (date instanceof Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(date);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function formatDateInput(date: Date | string) {
  const value = coerceDate(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(date: Date | string) {
  const value = coerceDate(date);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

export function formatRoundNameFromDate(date: Date | string) {
  const value = coerceDate(date);
  const month = value.getMonth() + 1;
  const day = value.getDate();

  return `${month}.${day}`;
}

type RoundDisplayInput = {
  roundName?: string | null;
  roundDate?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

function normalizeDisplayDate(input: RoundDisplayInput) {
  if (input.roundDate) {
    return input.roundDate;
  }

  if (input.completedAt) {
    return input.completedAt;
  }

  if (input.createdAt) {
    return input.createdAt;
  }

  return new Date();
}

export function getRoundDisplayDate(input: RoundDisplayInput) {
  return normalizeDisplayDate(input);
}

export function getRoundDisplayName(input: RoundDisplayInput) {
  const trimmedName = input.roundName?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  return formatRoundNameFromDate(normalizeDisplayDate(input));
}

export function getPreferredRoundName(roundName: string | null | undefined, roundDate: Date | string) {
  return getRoundDisplayName({ roundName, roundDate });
}
