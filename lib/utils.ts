export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatDateInput(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toISOString().slice(0, 10);
}

export function formatDisplayDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

export function formatRoundNameFromDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  const month = value.getMonth() + 1;
  const day = value.getDate();

  return `${month}.${day}`;
}
