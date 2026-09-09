import type { ActivityLogDay, ActivityLogMonth, ActivityLogNote, ActivityLogSummary, ArchivePeriod, BackupFile, BackupSettings, Config, HabitDay, HabitDetail, HabitNote, HabitSummary, MonthDay, NoteDetail, NoteSummary, Status, SystemNotification, TimedActivityDay, TimedActivityNote, TimedActivitySummary, TimedActivityWeek, Unresolved } from "./types";

export class ApiError extends Error {}

// Only reads time out. Writes are never retried automatically: their outcome may
// already be committed even if the connection disappears.
async function fetchRead(url: string, options?: RequestInit): Promise<Response> {
  if (options?.method && options.method !== "GET") return fetch(url, options);
  const controller = new AbortController();
  const abort = () => controller.abort();
  options?.signal?.addEventListener("abort", abort, { once: true });
  if (options?.signal?.aborted) controller.abort();
  const timer = window.setTimeout(abort, 15_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    // Read the body inside the deadline too (headers alone are not completion).
    const body = await response.arrayBuffer();
    return new Response(response.status === 204 ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new ApiError(controller.signal.aborted ? "The server took too long to respond. Please retry." : "Cannot reach the server. Check your private-network connection and retry.");
  } finally {
    window.clearTimeout(timer);
    options?.signal?.removeEventListener("abort", abort);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetchRead(url, options);
  if (!response.ok) {
    let message = "Something went wrong.";
    try { message = (await response.json()).detail ?? message; } catch { /* non-JSON error */ }
    throw new ApiError(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

async function download(url: string, options?: RequestInit): Promise<{ blob: Blob; filename: string }> {
  const response = await fetchRead(url, options);
  if (!response.ok) {
    let message = "Something went wrong.";
    try { message = (await response.json()).detail ?? message; } catch { /* non-JSON error */ }
    throw new ApiError(message);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? "habit-tracker-backup.sqlite3";
  return { blob: await response.blob(), filename };
}

export const api = {
  config: () => request<Config>("/api/config"),
  habits: (day: string, signal?: AbortSignal) => request<HabitDay[]>(`/api/days/${day}/habits`, { signal }),
  createHabit: (name: string, startDate: string) => request<{ id: number }>("/api/habits", json("POST", { name, startDate })),
  timedActivities: (day: string, signal?: AbortSignal) => request<TimedActivityDay[]>(`/api/days/${day}/timed-activities`, { signal }),
  createTimedActivity: (name: string, startDate: string) => request<{ id: number }>("/api/timed-activities", json("POST", { name, startDate })),
  timedActivitySummaries: () => request<TimedActivitySummary[]>("/api/timed-activities"),
  timedActivityDetail: (id: number) => request<TimedActivitySummary>(`/api/timed-activities/${id}`),
  renameTimedActivity: (id: number, name: string) => request<TimedActivitySummary>(`/api/timed-activities/${id}`, json("PATCH", { name })),
  archiveTimedActivity: (id: number) => request<TimedActivitySummary>(`/api/timed-activities/${id}/archive`, { method: "POST" }),
  restoreTimedActivity: (id: number) => request<TimedActivitySummary>(`/api/timed-activities/${id}/restore`, { method: "POST" }),
  deleteTimedActivity: (id: number, confirmation: string) => request<{ status: string; backup: string }>(`/api/timed-activities/${id}`, json("DELETE", { confirmation })),
  timedWeek: (id: number, day: string) => request<TimedActivityWeek>(`/api/timed-activities/${id}/weeks/${day}`),
  addTimedEntry: (id: number, day: string, minutes: number) => request<{ id: number; minutes: number }>(`/api/timed-activities/${id}/days/${day}/entries`, json("POST", { minutes })),
  updateTimedEntry: (id: number, entryId: number, minutes: number) => request<{ id: number; minutes: number }>(`/api/timed-activities/${id}/entries/${entryId}`, json("PATCH", { minutes })),
  deleteTimedEntry: (id: number, entryId: number) => request<void>(`/api/timed-activities/${id}/entries/${entryId}`, { method: "DELETE" }),
  saveTimedNote: (id: number, day: string, body: string) => request<void>(`/api/timed-activities/${id}/days/${day}/note`, json("PUT", { body })),
  timedNote: (id: number, day: string) => request<NoteDetail>(`/api/timed-activities/${id}/days/${day}/note`),
  timedNoteSummaries: () => request<TimedActivitySummary[]>("/api/timed-activities/notes/summaries"),
  timedActivityNotes: (id: number) => request<TimedActivityNote[]>(`/api/timed-activities/${id}/notes`),
  activityLogs: (day: string, signal?: AbortSignal) => request<ActivityLogDay[]>(`/api/days/${day}/activity-logs`, { signal }),
  createActivityLog: (name: string, startDate: string) => request<{ id: number }>("/api/activity-logs", json("POST", { name, startDate })),
  activityLogSummaries: () => request<ActivityLogSummary[]>("/api/activity-logs"),
  activityLogDetail: (id: number) => request<ActivityLogSummary>(`/api/activity-logs/${id}`),
  renameActivityLog: (id: number, name: string) => request<ActivityLogSummary>(`/api/activity-logs/${id}`, json("PATCH", { name })),
  archiveActivityLog: (id: number) => request<ActivityLogSummary>(`/api/activity-logs/${id}/archive`, { method: "POST" }),
  restoreActivityLog: (id: number) => request<ActivityLogSummary>(`/api/activity-logs/${id}/restore`, { method: "POST" }),
  deleteActivityLog: (id: number, confirmation: string) => request<{ status: string; backup: string }>(`/api/activity-logs/${id}`, json("DELETE", { confirmation })),
  activityLogMonth: (id: number, month: string) => request<ActivityLogMonth>(`/api/activity-logs/${id}/months/${month}`),
  setActivityLogCompletion: (id: number, day: string, completed: boolean) => request<void>(`/api/activity-logs/${id}/days/${day}/completion`, json("PUT", { status: completed ? "done" : "pending" })),
  saveActivityLogNote: (id: number, day: string, body: string) => request<void>(`/api/activity-logs/${id}/days/${day}/note`, json("PUT", { body })),
  activityLogNote: (id: number, day: string) => request<NoteDetail>(`/api/activity-logs/${id}/days/${day}/note`),
  activityLogNotes: (id: number) => request<ActivityLogNote[]>(`/api/activity-logs/${id}/notes`),
  habitSummaries: () => request<HabitSummary[]>("/api/habits"),
  habitDetail: (id: number) => request<HabitDetail>(`/api/habits/${id}`),
  renameHabit: (id: number, name: string) => request<HabitDetail>(`/api/habits/${id}`, json("PATCH", { name })),
  archiveHabit: (id: number) => request<HabitDetail>(`/api/habits/${id}/archive`, { method: "POST" }),
  restoreHabit: (id: number) => request<HabitDetail>(`/api/habits/${id}/restore`, { method: "POST" }),
  deleteHabit: (id: number, confirmation: string) => request<{ status: string; backup: string }>(`/api/habits/${id}`, json("DELETE", { confirmation })),
  archivePeriods: (id: number) => request<ArchivePeriod[]>(`/api/habits/${id}/archive-periods`),
  setStatus: (id: number, day: string, status: Status) => request<void>(`/api/habits/${id}/days/${day}/status`, json("PUT", { status })),
  note: (id: number, day: string) => request<NoteDetail>(`/api/habits/${id}/days/${day}/note`),
  saveNote: (id: number, day: string, body: string) => request<void>(`/api/habits/${id}/days/${day}/note`, json("PUT", { body })),
  month: (month: string, signal?: AbortSignal) => request<MonthDay[]>(`/api/months/${month}`, { signal }),
  noteSummaries: () => request<NoteSummary[]>("/api/notes"),
  habitNotes: (id: number) => request<HabitNote[]>(`/api/habits/${id}/notes`),
  unresolved: () => request<Unresolved[]>("/api/unresolved"),
  systemNotifications: () => request<SystemNotification[]>("/api/system-notifications"),
  dismissSystemNotification: (id: number) => request<void>(`/api/system-notifications/${id}`, { method: "DELETE" }),
  backups: () => request<BackupFile[]>("/api/backups"),
  backupSettings: () => request<BackupSettings>("/api/backups/settings"),
  saveBackupSettings: (settings: BackupSettings) => request<BackupSettings>("/api/backups/settings", json("PUT", settings)),
  createBackup: () => download("/api/backups", { method: "POST" }),
  downloadBackup: (filename: string) => download(`/api/backups/${encodeURIComponent(filename)}/download`),
  restoreBackup: (filename: string, confirmation: string) => request<{ status: string; backup: string }>("/api/backups/restore", json("POST", { filename, confirmation })),
  restoreUploadedBackup: (file: File, confirmation: string) => {
    const body = new FormData(); body.append("backup_file", file); body.append("confirmation", confirmation);
    return request<{ status: string; backup: string }>("/api/backups/restore-upload", { method: "POST", body });
  },
  deleteBackup: (filename: string, confirmation: string) => request<void>(`/api/backups/${encodeURIComponent(filename)}`, json("DELETE", { confirmation })),
  importDatabase: (file: File, confirmation: string) => {
    const body = new FormData(); body.append("database_file", file); body.append("confirmation", confirmation);
    return request<{ status: string; backup: string }>("/api/import", { method: "POST", body });
  },
};
