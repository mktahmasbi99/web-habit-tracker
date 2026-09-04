import type { ArchivePeriod, BackupFile, BackupSettings, Config, HabitDay, HabitDetail, HabitNote, HabitSummary, MonthDay, NoteDetail, NoteSummary, Statistic, Status, SystemNotification, TimedActivityDay, TimedActivityNote, TimedActivitySummary, TimedActivityWeek, Unresolved } from "./types";

export class ApiError extends Error {}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
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
  const response = await fetch(url, options);
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
  habits: (day: string) => request<HabitDay[]>(`/api/days/${day}/habits`),
  createHabit: (name: string, startDate: string) => request<{ id: number }>("/api/habits", json("POST", { name, startDate })),
  timedActivities: (day: string) => request<TimedActivityDay[]>(`/api/days/${day}/timed-activities`),
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
  month: (month: string) => request<MonthDay[]>(`/api/months/${month}`),
  statistics: () => request<Statistic[]>("/api/statistics"),
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
