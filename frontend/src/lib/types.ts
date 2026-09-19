export type Status = "pending" | "done" | "missed";
export type Theme = "system" | "noir" | "retro";

export interface Config { today: string; timezone: string; theme: Theme }
export interface HabitDay {
  id: number; name: string; startDate: string; status: Status;
  currentStreak: number; hasNote: boolean;
}
export interface TimedActivityDay {
  id: number; name: string; startDate: string; dayMinutes: number; weekMinutes: number; hasNote: boolean; archived: boolean;
}
export interface TimedEntry { id: number; minutes: number }
export interface TimedWeekDay { date: string; minutes: number; entries: TimedEntry[]; active: boolean }
export interface TimedActivityWeek {
  id: number; name: string; startDate: string; selectedDate: string; days: TimedWeekDay[]; note: string;
}
export interface TimedActivitySummary {
  id: number; name: string; startDate: string; archived: boolean; archivedAt: string | null; noteCount: number;
}
export interface TimedActivityNote { activityId: number; activityName: string; date: string; body: string }
export type TimerMode = "pomodoro" | "countdown" | "stopwatch";
export type TimerPhase = "focus" | "short_break" | "long_break" | "ready_focus" | "countdown" | "stopwatch";
export type TimerStatus = "running" | "paused" | "ready";
export interface TimedActivityTimer {
  activityId: number; mode: TimerMode; phase: TimerPhase; status: TimerStatus;
  targetMinutes: number; elapsedSeconds: number; remainingSeconds: number;
  percent: number; focusNumber: number; phaseStartedAt: string | null;
  phaseDeadlineAt: string | null; intervalEnabled: boolean; intervalMinutes: number; revision: number;
}
export interface TimedActivityTimers { serverNow: string; timers: TimedActivityTimer[] }
export interface ActivityLogDay { id: number; name: string; startDate: string; lastCompletedDate: string | null; completed: boolean; hasNote: boolean; archived: boolean }
export interface ActivityLogSummary { id: number; name: string; startDate: string; archived: boolean; archivedAt: string | null; noteCount: number }
export interface ActivityLogMonthDay { date: string; active: boolean; completed: boolean; hasNote: boolean }
export interface ActivityLogMonth { id: number; name: string; startDate: string; month: string; days: ActivityLogMonthDay[] }
export interface ActivityLogNote { activityId: number; activityName: string; date: string; body: string }
export interface Streak { startDate: string; endDate: string; length: number }
export interface ActiveRange { startDate: string; endDate: string }
export interface HabitSummary {
  id: number; name: string; startDate: string; archived: boolean; archivedAt: string | null;
  latestActiveRange: ActiveRange | null; noteCount: number;
}
export interface HabitDetail extends HabitSummary {
  currentStreak: number; longestStreak: Streak | null; streaks: Streak[];
}
export interface HabitMonthDay { date: string; active: boolean; status: Status | null }
export interface HabitMonth { id: number; name: string; startDate: string; month: string; days: HabitMonthDay[] }
export interface ArchivePeriod {
  id: number; number: number; startDate: string; endDate: string;
  currentStreak: number; longestStreak: Streak | null; streaks: Streak[]; notes: HabitNote[];
}
export interface Unresolved { date: string; pendingCount: number }
export interface NoteSummary {
  id: number; name: string; startDate: string; archived: boolean; noteCount: number;
}
export interface HabitNote { habitId: number; habitName: string; date: string; body: string }
export interface NoteDetail extends HabitNote { exists: boolean; archived: boolean }
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
