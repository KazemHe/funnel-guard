import dayjs from "dayjs";

export function daysBetween(dateA: string, dateB: string): number {
  return Math.abs(dayjs(dateB).diff(dayjs(dateA), "day"));
}

export function daysDiff(from: string, to: string): number {
  return dayjs(to).diff(dayjs(from), "day");
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date, "YYYY-MM-DD").isValid();
}

export function addDays(date: string, days: number): string {
  return dayjs(date).add(days, "day").format("YYYY-MM-DD");
}

export function now(): string {
  return dayjs().toISOString();
}
