import type { BackupFile, BackupSettings, Config, HabitDay, HabitNote, MonthDay, NoteSummary, Statistic, Status, SystemNotification, Unresolved } from "./types";

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
  setStatus: (id: number, day: string, status: Status) => request<void>(`/api/habits/${id}/days/${day}/status`, json("PUT", { status })),
  note: (id: number, day: string) => request<{ body: string }>(`/api/habits/${id}/days/${day}/note`),
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
