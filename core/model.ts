export interface Attachment {
  name: string;
  url: string;
}
export interface Assignment {
  id: string;
  url: string;
  title: string;
  course: string;
  body: string;
  attachments?: Attachment[];
  dueAt: string | null;
  startAt?: string | null;
  firstSeenAt?: number;
  status: "pending" | "completed" | "unknown";
  statusText: string;
  updatedAt: number;
}
export interface Settings {
  enabled: boolean;
  hours: number;
}
export interface State {
  assignments: Assignment[];
  settings: Settings;
  lastSync: number | null;
  syncError: string | null;
  notified: Record<string, string>;
}
export const DEFAULTS: State = {
  assignments: [],
  settings: { enabled: true, hours: 24 },
  lastSync: null,
  syncError: null,
  notified: {},
};
export function dateKey(value: string | number | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function mergeAssignments(
  oldItems: Assignment[],
  incoming: Assignment[],
) {
  const map = new Map(oldItems.map((a) => [a.id, a]));
  for (const item of incoming) {
    const old = map.get(item.id);
    map.set(item.id, {
      ...old,
      ...item,
      dueAt: item.dueAt ?? old?.dueAt ?? null,
      startAt: item.startAt ?? old?.startAt ?? null,
      firstSeenAt:
        old?.firstSeenAt ??
        old?.updatedAt ??
        item.firstSeenAt ??
        item.updatedAt,
      status: item.status === "unknown" && old ? old.status : item.status,
    });
  }
  return [...map.values()].sort((a, b) =>
    (a.dueAt || "9999").localeCompare(b.dueAt || "9999"),
  );
}
export function dueNotifications(
  items: Assignment[],
  settings: Settings,
  notified: Record<string, string>,
  now = Date.now(),
) {
  if (!settings.enabled) return [];
  return items.filter(
    (a) =>
      a.status === "pending" &&
      a.dueAt &&
      new Date(a.dueAt).getTime() > now &&
      new Date(a.dueAt).getTime() - now <= settings.hours * 3600000 &&
      notified[a.id] !== a.dueAt,
  );
}

/** Assignments are active from their LMS start date, or first observation, through their due date. */
export function assignmentsOnDate(
  items: Assignment[],
  day: Date,
): Assignment[] {
  const key = dateKey(day);
  return items.filter((item) => {
    const end = dateKey(item.dueAt);
    if (!end) return false;
    const start = dateKey(item.startAt || item.firstSeenAt || item.updatedAt);
    return Boolean(start) && key >= (start > end ? end : start) && key <= end;
  });
}

/** Largest number of assignments whose inclusive date ranges overlap. */
export function peakAssignments(items: Assignment[]): number {
  const changes = new Map<string, { starts: number; ends: number }>();
  for (const item of items) {
    const end = dateKey(item.dueAt);
    const rawStart = dateKey(
      item.startAt || item.firstSeenAt || item.updatedAt,
    );
    if (!end || !rawStart) continue;
    const start = rawStart > end ? end : rawStart;
    const startEvent = changes.get(start) ?? { starts: 0, ends: 0 };
    startEvent.starts++;
    changes.set(start, startEvent);
    const endEvent = changes.get(end) ?? { starts: 0, ends: 0 };
    endEvent.ends++;
    changes.set(end, endEvent);
  }
  let current = 0,
    peak = 0;
  for (const [, event] of [...changes.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    current += event.starts;
    peak = Math.max(peak, current);
    current -= event.ends;
  }
  return peak;
}

/** Keep completed ranges visible while scaling the color against the global peak. */
export function highlightOpacity(remaining: number, peak: number): number {
  return Math.max(0.25, Math.min(1, peak > 0 ? remaining / peak : 0));
}
