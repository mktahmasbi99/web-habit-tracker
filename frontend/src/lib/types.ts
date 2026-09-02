export type Status = "pending" | "done" | "missed";

export interface Config { today: string; timezone: string }
export interface HabitDay {
  id: number; name: string; startDate: string; status: Status;
  currentStreak: number; hasNote: boolean;
}
export interface Streak { startDate: string; endDate: string; length: number }
export interface ActiveRange { startDate: string; endDate: string }
export interface HabitSummary {
  id: number; name: string; startDate: string; archived: boolean; archivedAt: string | null;
  latestActiveRange: ActiveRange | null; noteCount: number;
}
export interface HabitDetail extends HabitSummary {
  currentStreak: number; longestStreak: Streak | null; streaks: Streak[];
}
export interface ArchivePeriod {
  id: number; number: number; startDate: string; endDate: string;
  currentStreak: number; longestStreak: Streak | null; streaks: Streak[]; notes: HabitNote[];
}
export interface Statistic {
  id: number; name: string; startDate: string; currentStreak: number;
  longestStreak: Streak | null; streaks: Streak[]; noteCount: number;
}
export interface MonthDay { date: string; done: number; missed: number }
export interface Unresolved { date: string; pendingCount: number }
export interface NoteSummary {
  id: number; name: string; startDate: string; archived: boolean; noteCount: number;
}
export interface HabitNote { habitId: number; habitName: string; date: string; body: string }
export type BackupCategory = "daily" | "weekly" | "on-demand" | "pre-import" | "pre-restore" | "pre-delete";
export interface BackupFile {
  filename: string; category: BackupCategory; createdAt: string; size: number; safety: boolean;
}
export interface BackupSettings {
  dailyEnabled: boolean; dailyTime: string; dailyRetention: number;
  weeklyEnabled: boolean; weeklyDay: number; weeklyTime: string; weeklyRetention: number;
  safetyRetention: number;
}
export interface SystemNotification {
  id: number | string; kind: string; title: string; message: string; createdAt: string;
}
