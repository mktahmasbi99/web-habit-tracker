export type Status = "pending" | "done" | "missed";

export interface Config { today: string; timezone: string }
export interface HabitDay {
  id: number; name: string; startDate: string; status: Status;
  currentStreak: number; hasNote: boolean;
}
export interface Streak { startDate: string; endDate: string; length: number }
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

