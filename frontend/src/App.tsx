import {
  Archive, Bell, BellOff, ChevronLeft, ChevronRight,
  CircleCheck, CircleEllipsis, Clock3, Download, FileUp, Flame, MoreHorizontal, NotebookPen, Pencil, Plus, Save, StickyNote, Trash2, X, Hourglass, AlarmClock, PenLine,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { allowHistoryNavigation, closeHistoryRoute, registerLeaveGuard } from "./lib/navigation";
import { lockScroll } from "./hooks/scrollLock";
import Calendar from "./components/Calendar";
import HabitNotesView from "./components/HabitNotesView";
import TimedActivityNotesView from "./components/TimedActivityNotesView";
import ActivityLogNotesView from "./components/ActivityLogNotesView";
import HabitStatusCalendar from "./components/HabitStatusCalendar";
import Modal from "./components/Modal";
import TimedStatistics from "./components/TimedStatistics";
import { InstallAppPanel, type PwaInstallState } from "./components/PwaControls";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { liveTimer, primeTimerAlerts, useTimedActivityTimers } from "./hooks/useTimedActivityTimers";
import { api, ApiError } from "./lib/api";
import type { ActivityLogDay, ActivityLogMonth, ActivityLogSummary, ArchivePeriod, BackupFile, BackupSettings, Config, HabitDay, HabitDetail, HabitSummary, NoteDetail, Status, Streak, SystemNotification, Theme, TimedActivityDay, TimedActivitySummary, TimedActivityTimer, TimedActivityWeek, TimedEntry, TimerMode, Unresolved } from "./lib/types";

type Tab = "today" | "manage" | "notifications" | "more";
type NoteTarget = { habitId: number; habitName: string; date: string; create: boolean; archived?: boolean; kind?: "daily" | "timed" | "log" };
const parseDay = (value: string) => new Date(`${value}T12:00:00Z`);
const dayISO = (value: Date) => value.toISOString().slice(0, 10);
const shiftDay = (value: string, offset: number) => {
  const date = parseDay(value); date.setUTCDate(date.getUTCDate() + offset); return dayISO(date);
};
const prettyDate = (value: string) => parseDay(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const relativeCompletion = (value: string | null, today: string) => {
  if (!value) return "Not logged yet";
  const days = Math.round((parseDay(today).getTime() - parseDay(value).getTime()) / 86_400_000);
  if (days === 0) return "Today"; if (days === 1) return "Yesterday"; if (days === 2) return "Two days ago";
  return `${prettyDate(value)} · ${days} days ago`;
};
const statusLabels: Record<Status, string> = { pending: "Pending", done: "Done", missed: "Missed" };
function TomatoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8.1c-1.7-1.1-4-1.2-5.9-.3-2.4 1.1-3.8 3.5-3.5 6.2.4 3.4 3.4 6 7.2 6h4.4c3.8 0 6.8-2.6 7.2-6 .3-2.7-1.1-5.1-3.5-6.2-1.9-.9-4.2-.8-5.9.3Z"/><path d="M12 8c-.1-1.4-.7-2.6-1.8-3.4 1.9-.2 3.1.4 3.8 1.7.8-1.3 2.2-1.8 4-1.6-1.1 1.1-1.7 2.2-1.8 3.5M12 8c-1.4-1.5-3.1-1.8-5.1-1.3 1 1.5 2.5 2.4 4.7 2.5M12 8c1.4-1.5 3.1-1.8 5.1-1.3"/></svg>;
}
const timedSectionPreference = () => {
  try { return typeof window.localStorage?.getItem === "function" ? window.localStorage.getItem("timed-activities-open") !== "false" : true; } catch { return true; }
};
const saveTimedSectionPreference = (open: boolean) => { try { window.localStorage?.setItem?.("timed-activities-open", String(open)); } catch { /* preference storage is optional */ } };
const stopwatchAlertPreference = () => {
  try {
    const stored = JSON.parse(window.localStorage?.getItem("stopwatch-interval-alert") ?? "null") as { enabled?: unknown; minutes?: unknown } | null;
    const minutes = typeof stored?.minutes === "number" && Number.isInteger(stored.minutes) && stored.minutes >= 1 && stored.minutes <= 1440 ? stored.minutes : 10;
    return { enabled: stored?.enabled === true, minutes };
  } catch { return { enabled: false, minutes: 10 }; }
};
const saveStopwatchAlertPreference = (enabled: boolean, minutes: number) => { try { window.localStorage?.setItem?.("stopwatch-interval-alert", JSON.stringify({ enabled, minutes })); } catch { /* preference storage is optional */ } };
const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60); const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
};
const formatTimerClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds)); const hours = Math.floor(safe / 3600); const minutes = Math.floor((safe % 3600) / 60); const remainder = safe % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
};
const durationTotal = (hours: string, minutes: string) => (Number(hours) || 0) * 60 + (Number(minutes) || 0);
const dateInTimezone = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const nextLocalMidnight = (now: Date, timezone: string) => {
  const today = dateInTimezone(now, timezone); let low = now.getTime(); let high = low + 27 * 60 * 60 * 1000;
  while (high - low > 1) { const middle = Math.floor((low + high) / 2); if (dateInTimezone(new Date(middle), timezone) === today) low = middle; else high = middle; }
  return high;
};
const countdownPreview = (minutes: number, now: Date, timezone: string, loggedMinutes: number) => {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return null;
  const end = new Date(now.getTime() + minutes * 60_000); const today = dateInTimezone(now, timezone); const endDay = dateInTimezone(end, timezone);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(end);
  const endLabel = endDay === today ? `Ends at ${time}` : endDay === shiftDay(today, 1) ? `Ends tomorrow at ${time}` : `Ends ${prettyDate(endDay)} at ${time}`;
  let todayMinutes = minutes;
  if (endDay !== today) {
    const todaySeconds = Math.max(0, (nextLocalMidnight(now, timezone) - now.getTime()) / 1000); const nextSeconds = minutes * 60 - todaySeconds;
    const todayFloor = Math.floor(todaySeconds / 60); const nextFloor = Math.floor(nextSeconds / 60); const remaining = minutes - todayFloor - nextFloor;
    const todayRemainder = todaySeconds % 60; const nextRemainder = nextSeconds % 60;
    todayMinutes = todayFloor + (remaining > 0 && todayRemainder >= nextRemainder ? 1 : 0);
  }
  return { endLabel, overBy: Math.max(0, loggedMinutes + todayMinutes - 1440) };
};
const normalizeDuration = (hours: string, minutes: string) => {
  if (minutes === "") return { hours, minutes };
  const total = durationTotal(hours, minutes);
  if (!Number.isInteger(total) || total < 0 || total > 1440) return { hours, minutes };
  return { hours: total >= 60 || hours !== "" ? String(Math.floor(total / 60)) : "", minutes: String(total % 60) };
};

function DurationFields({ hours, minutes, onHoursChange, onMinutesChange, onNormalize }: { hours: string; minutes: string; onHoursChange: (value: string) => void; onMinutesChange: (value: string) => void; onNormalize: () => void }) {
  return <div className="duration-fields"><label><span>Hours</span><input type="number" min="0" max="24" placeholder="0" value={hours} onChange={event => onHoursChange(event.target.value)} /></label><label><span>Minutes</span><input type="number" min="0" max="1440" placeholder="0" value={minutes} onChange={event => onMinutesChange(event.target.value)} onBlur={onNormalize} /></label></div>;
}

function EmptyState({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="empty-state">{icon}<h2>{title}</h2><p>{detail}</p></div>;
}

function TodayPage({ config, selectedDate, refresh, onDate, onDataChange, reportError, openHabit, openTimed, openNote, openTimedNotes, noteOpen }: {
  config: Config; selectedDate: string; onDate: (date: string) => void;
  refresh: number;
  onDataChange: () => void; reportError: (error: unknown) => void; openHabit: (id: number) => void; openTimed: (id: number) => void; openNote: (target: NoteTarget) => void; openTimedNotes: (id: number) => void; noteOpen: boolean;
}) {
  const [habits, setHabits] = useState<HabitDay[]>([]);
  const [timed, setTimed] = useState<TimedActivityDay[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogDay[]>([]);
  const [archivedHabitIds, setArchivedHabitIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadedDate, setLoadedDate] = useState("");
  const [loadError, setLoadError] = useState(false);
  const read = useRef<AbortController | null>(null);
  const loadedDateRef = useRef("");
  const writes = useRef(new Set<string>());
  const [pendingWrites, setPendingWrites] = useState(new Set<string>());
  const [calendar, setCalendar] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(() => { try { return window.localStorage?.getItem?.("daily-habits-open") !== "false"; } catch { return true; } });
  const [timedOpen, setTimedOpen] = useState(timedSectionPreference);
  const [activityLogsOpen, setActivityLogsOpen] = useState(() => { try { return window.localStorage?.getItem?.("activity-logs-open") !== "false"; } catch { return true; } });
  const [timedDetail, setTimedDetail] = useState<(TimedActivityDay & { date: string }) | null>(null);
  const [activityLogDetail, setActivityLogDetail] = useState<ActivityLogDay | null>(null);
  const [activityLogWrites, setActivityLogWrites] = useState(new Set<number>());
  const [reorderMode, setReorderMode] = useState<"daily" | "timed" | "log" | null>(null);
  const holdTimer = useRef<number | null>(null);
  const suppressTimer = useRef<number | null>(null);
  const suppressCardClick = useRef(false);
  const suppressedTarget = useRef<EventTarget | null>(null);
  const draggedId = useRef<number | null>(null);
  const pointerDragging = useRef(false);
  const pointerMoved = useRef(false);
  const dragOriginal = useRef<{ type: "daily" | "timed" | "log"; ids: number[] } | null>(null);
  const orderedIds = (type: "daily" | "timed" | "log") => (type === "daily" ? visibleHabits : type === "timed" ? visibleTimed : visibleActivityLogs).map(item => item.id);
  const listForOrder = (type: "daily" | "timed" | "log", ids: number[]) => {
    const rank = new Map(ids.map((id, index) => [id, index]));
    const sort = <T extends { id: number }>(items: T[]) => [...items].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length));
    if (type === "daily") setHabits(sort);
    else if (type === "timed") setTimed(sort);
    else setActivityLogs(sort);
  };
  const persistOrder = async (type: "daily" | "timed" | "log", ids: number[], oldIds: number[]) => {
    try { await api.saveCardOrder(type, ids); }
    catch (error) { listForOrder(type, oldIds); reportError(error); }
  };
  const moveRelative = (type: "daily" | "timed" | "log", movingId: number, targetId: number, before: boolean) => {
    const ids = orderedIds(type), from = ids.indexOf(movingId);
    if (from < 0 || movingId === targetId) return false;
    ids.splice(from, 1);
    const targetIndex = ids.indexOf(targetId);
    if (targetIndex < 0) return false;
    ids.splice(targetIndex + (before ? 0 : 1), 0, movingId);
    if (ids.some((id, index) => id !== orderedIds(type)[index])) listForOrder(type, ids);
    return true;
  };
  const holdProps = (type: "daily" | "timed" | "log") => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (reorderMode === type) {
        if (event.target instanceof Element && event.target.closest(".habit-actions, .note-button, .activity-log-card-actions")) return;
        pointerDragging.current = true; pointerMoved.current = false; draggedId.current = Number(event.currentTarget.dataset.cardId); dragOriginal.current = { type, ids: orderedIds(type) }; suppressedTarget.current = event.target; return;
      }
      if (reorderMode || event.target instanceof Element && event.target.closest(".habit-actions, .note-button, .activity-log-card-actions")) return;
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      suppressedTarget.current = event.target;
      holdTimer.current = window.setTimeout(() => { setReorderMode(type); suppressCardClick.current = true; suppressTimer.current = window.setTimeout(() => { suppressCardClick.current = false; suppressedTarget.current = null; }, 1200); }, 500);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (!pointerDragging.current || reorderMode !== type || draggedId.current === null) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(`[data-card-type="${type}"]`);
      const targetId = Number(target?.dataset.cardId);
      if (!target || !Number.isFinite(targetId) || targetId === draggedId.current) return;
      const rect = target.getBoundingClientRect();
      pointerMoved.current = moveRelative(type, draggedId.current, targetId, event.clientY < rect.top + rect.height / 2) || pointerMoved.current;
    },
    onPointerUp: () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current); holdTimer.current = null;
      if (pointerDragging.current && dragOriginal.current && pointerMoved.current) {
        void persistOrder(type, orderedIds(type), dragOriginal.current.ids);
        suppressCardClick.current = true;
        suppressTimer.current = window.setTimeout(() => { suppressCardClick.current = false; suppressedTarget.current = null; }, 1200);
      }
      pointerDragging.current = false; pointerMoved.current = false; draggedId.current = null; dragOriginal.current = null;
    },
    onPointerLeave: () => { if (holdTimer.current !== null) window.clearTimeout(holdTimer.current); holdTimer.current = null; },
    onClickCapture: (event: MouseEvent<HTMLElement>) => { if (suppressCardClick.current && event.target === suppressedTarget.current) { suppressCardClick.current = false; suppressedTarget.current = null; if (suppressTimer.current !== null) window.clearTimeout(suppressTimer.current); event.preventDefault(); event.stopPropagation(); } },
  });
  const dragProps = (type: "daily" | "timed" | "log", id: number) => ({
    "data-card-type": type,
    "data-card-id": id,
    draggable: reorderMode === type,
    onDragStart: (event: DragEvent<HTMLElement>) => { draggedId.current = id; dragOriginal.current = { type, ids: orderedIds(type) }; event.dataTransfer.effectAllowed = "move"; },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (reorderMode !== type || draggedId.current === null || draggedId.current === id) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      moveRelative(type, draggedId.current, id, event.clientY < rect.top + rect.height / 2);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const previous = dragOriginal.current;
      if (previous) void persistOrder(type, orderedIds(type), previous.ids);
      draggedId.current = null; dragOriginal.current = null;
    },
    onDragEnd: () => {
      if (dragOriginal.current?.type === type) listForOrder(type, dragOriginal.current.ids);
      draggedId.current = null; dragOriginal.current = null;
    },
  });
  const load = useCallback(async () => {
    const preserveContent = loadedDateRef.current === selectedDate;
    read.current?.abort();
    const controller = new AbortController(); read.current = controller;
    if (!preserveContent) setLoading(true);
    setLoadError(false);
    try {
      const [daily, activities, logs, allDaily] = await Promise.all([api.habits(selectedDate, controller.signal), api.timedActivities(selectedDate, controller.signal), api.activityLogs(selectedDate, controller.signal), api.habitSummaries()]);
      if (!controller.signal.aborted) { setHabits(daily); setTimed(activities); setActivityLogs(logs); setArchivedHabitIds(new Set(allDaily.filter(item => item.archived).map(item => item.id))); loadedDateRef.current = selectedDate; setLoadedDate(selectedDate); }
    } catch (error) { if (!controller.signal.aborted) { setLoadError(true); reportError(error); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [selectedDate, reportError]);
  const timerTracking = useTimedActivityTimers(selectedDate === config.today, () => { void load(); onDataChange(); }, reportError);
  const timers = new Map(timerTracking.snapshot.timers.map(timer => [timer.activityId, liveTimer(timer, timerTracking.snapshot.serverNow, timerTracking.clock)]));
  useEffect(() => { void load(); return () => read.current?.abort(); }, [load, refresh]);
  useEffect(() => { setReorderMode(null); if (holdTimer.current !== null) window.clearTimeout(holdTimer.current); holdTimer.current = null; }, [selectedDate]);
  useEffect(() => { const refreshNotes = () => { void load(); }; window.addEventListener("note-changed", refreshNotes); return () => window.removeEventListener("note-changed", refreshNotes); }, [load]);
  const isRelativeDay = selectedDate === config.today || selectedDate === shiftDay(config.today, -1) || selectedDate === shiftDay(config.today, 1);
  const title = selectedDate === config.today ? "Today" : selectedDate === shiftDay(config.today, -1) ? "Yesterday" : selectedDate === shiftDay(config.today, 1) ? "Tomorrow" : prettyDate(selectedDate);
  const visibleHabits = selectedDate === config.today ? habits.filter(habit => !archivedHabitIds.has(habit.id)) : habits;
  const visibleTimed = selectedDate === config.today ? timed.filter(activity => !activity.archived) : timed;
  const visibleActivityLogs = selectedDate === config.today ? activityLogs.filter(activity => !activity.archived) : activityLogs;
  const setStatus = async (habit: HabitDay, status: Status) => {
    const key = `${selectedDate}:${habit.id}`;
    if (writes.current.has(key)) return;
    writes.current.add(key); setPendingWrites(new Set(writes.current));
    try { await api.setStatus(habit.id, selectedDate, status); onDataChange(); }
    catch (error) { reportError(error); }
    finally { writes.current.delete(key); setPendingWrites(new Set(writes.current)); }
  };
  const toggleActivityLogCompletion = async (activity: ActivityLogDay) => {
    if (activityLogWrites.has(activity.id)) return;
    setActivityLogWrites(current => new Set(current).add(activity.id));
    try { await api.setActivityLogCompletion(activity.id, selectedDate, !activity.completed); await load(); onDataChange(); }
    catch (error) { reportError(error); }
    finally { setActivityLogWrites(current => { const next = new Set(current); next.delete(activity.id); return next; }); }
  };
  return <section className="page today-page">
    <header className="day-header">
      <button className="icon-button accent" onClick={() => onDate(shiftDay(selectedDate, -1))} aria-label="Previous day"><ChevronLeft /></button>
      <button className="day-title" onClick={event => { event.currentTarget.focus(); setCalendar(true); }}><h1>{title}</h1>{isRelativeDay && <small>{selectedDate}</small>}</button>
      <button className="icon-button accent" onClick={() => onDate(shiftDay(selectedDate, 1))} aria-label="Next day"><ChevronRight /></button>
    </header>
    <div className="primary-action"><button className="add-button" onClick={() => setAdding(true)} aria-label="Add habit"><Plus /></button></div>
    {loadError ? <div className="loading" role="status">Could not load this day.<button className="small-button" onClick={() => void load()}>Retry</button></div> : loading || loadedDate !== selectedDate ? <div className="loading" role="status">Loading habits…</div> : <>
    <section className="timed-section daily-section">
      <div className="today-section-tools"><button className="timed-section-head disclosure-row" type="button" aria-expanded={dailyOpen} aria-controls="daily-habit-list" onClick={() => { const next = !dailyOpen; setDailyOpen(next); try { window.localStorage?.setItem?.("daily-habits-open", String(next)); } catch { /* optional preference */ } }}><ChevronRight aria-hidden="true" /><span><strong>Daily habits</strong><small>Complete once each day</small></span></button></div>
      {reorderMode === "daily" && <div className="reorder-toolbar" role="status"><span>Rearranging daily habits · drag cards to reorder</span><button type="button" onClick={() => setReorderMode(null)}>Done</button></div>}
      {dailyOpen && <div id="daily-habit-list">{visibleHabits.length === 0 ? <p className="timed-empty">No daily habits on this date.</p> : <div className={`habit-list timed-list ${reorderMode === "daily" ? "reorder-list" : ""}`}>{visibleHabits.map((habit, index) => <article className={`habit-card ${reorderMode === "daily" ? "reorder-card" : ""}`} key={habit.id} aria-busy={pendingWrites.has(`${selectedDate}:${habit.id}`)} {...holdProps("daily")} {...dragProps("daily", habit.id)}>
        <button className="habit-card-open habit-card-head" onClick={() => openHabit?.(habit.id)} aria-label={`Open ${habit.name}`}><h2>{habit.name}</h2><span><Flame size={14} /> {habit.currentStreak} streak</span></button>
        {pendingWrites.has(`${selectedDate}:${habit.id}`) && <small role="status">Saving…</small>}
        <div className="habit-actions">
          <div className="status-group">{(["pending", "done", "missed"] as Status[]).map(status =>
            <button key={status} className={`status-button ${status} ${habit.status === status ? "active" : ""}`} disabled={pendingWrites.has(`${selectedDate}:${habit.id}`)} onClick={() => void setStatus(habit, status)} aria-pressed={habit.status === status}>{statusLabels[status]}</button>
          )}</div>
          <button className={`note-button ${habit.hasNote ? "has-note" : ""}`} onClick={() => openNote({ habitId: habit.id, habitName: habit.name, date: selectedDate, create: !habit.hasNote })} aria-label={`${habit.hasNote ? "View" : "Add"} note for ${habit.name}`}><StickyNote /></button>
        </div>
      </article>)}</div>}</div>}
    </section></>}
    {!loading && !loadError && loadedDate === selectedDate && <section className="timed-section">
      <div className="today-section-tools"><button className="timed-section-head disclosure-row" type="button" aria-expanded={timedOpen} aria-controls="timed-activity-list" onClick={() => { const next = !timedOpen; setTimedOpen(next); saveTimedSectionPreference(next); }}><ChevronRight aria-hidden="true" /><span><strong>Timed activities</strong><small>Optional time tracking</small></span></button></div>
      {reorderMode === "timed" && <div className="reorder-toolbar" role="status"><span>Rearranging timed activities · drag cards to reorder</span><button type="button" onClick={() => setReorderMode(null)}>Done</button></div>}
      {timedOpen && <div id="timed-activity-list">{visibleTimed.length === 0 ? <p className="timed-empty">No timed activities on this date.</p> : <div className={`habit-list timed-list ${reorderMode === "timed" ? "reorder-list" : ""}`}>{visibleTimed.map((activity, index) => { const timer = timers.get(activity.id); return <article className={`habit-card timed-card ${reorderMode === "timed" ? "reorder-card" : ""}`} key={activity.id} {...holdProps("timed")} {...dragProps("timed", activity.id)}><button className="timed-card-open" onClick={() => setTimedDetail({ ...activity, date: selectedDate })} aria-label={`Open ${activity.name}`}><span><strong>{activity.name}</strong><small className="timed-day-total"><Clock3 aria-hidden="true" />{formatMinutes(activity.dayMinutes)}</small>{timer?.mode === "pomodoro" && <span className="pomodoro-card-indicator" aria-label="Pomodoro timer active"><span aria-hidden="true">🍅</span></span>}{timer?.mode === "stopwatch" && <span className="stopwatch-card-indicator" aria-label={`Stopwatch ${timer.status}, ${formatTimerClock(timer.elapsedSeconds)} elapsed`}>⏱️ {formatTimerClock(timer.elapsedSeconds)}</span>}{timer?.mode === "countdown" && <span className="countdown-card-indicator" aria-label={`${Math.round(timer.percent)} percent complete, ${formatTimerClock(timer.elapsedSeconds)} elapsed, ${formatTimerClock(timer.remainingSeconds)} remaining`}><span><span>{formatTimerClock(timer.elapsedSeconds)} elapsed</span><span>{formatTimerClock(timer.remainingSeconds)} left</span></span><progress max="100" value={timer.percent}>{timer.percent}%</progress></span>}</span><ChevronRight aria-hidden="true" /></button><button className={`note-button ${activity.hasNote ? "has-note" : ""}`} onClick={() => openNote({ habitId: activity.id, habitName: activity.name, date: selectedDate, create: !activity.hasNote, kind: "timed" })} aria-label={`${activity.hasNote ? "View" : "Add"} note for ${activity.name}`}><StickyNote /></button></article>; })}</div>}</div>}
    </section>}
    {!loading && !loadError && loadedDate === selectedDate && <section className="timed-section activity-log-section">
      <div className="today-section-tools"><button className="timed-section-head disclosure-row" type="button" aria-expanded={activityLogsOpen} aria-controls="activity-log-list" onClick={() => { const next = !activityLogsOpen; setActivityLogsOpen(next); try { window.localStorage?.setItem?.("activity-logs-open", String(next)); } catch { /* optional preference */ } }}><ChevronRight aria-hidden="true" /><span><strong>Activity log</strong><small>Record activities without schedules</small></span></button></div>
      {reorderMode === "log" && <div className="reorder-toolbar" role="status"><span>Rearranging activity log · drag cards to reorder</span><button type="button" onClick={() => setReorderMode(null)}>Done</button></div>}
      {activityLogsOpen && <div id="activity-log-list">{visibleActivityLogs.length === 0 ? <p className="timed-empty">No activity log items on this date.</p> : <div className={`habit-list timed-list ${reorderMode === "log" ? "reorder-list" : ""}`}>{visibleActivityLogs.map((activity, index) => <article className={`habit-card timed-card activity-log-card ${reorderMode === "log" ? "reorder-card" : ""}`} key={activity.id} aria-busy={activityLogWrites.has(activity.id)} {...holdProps("log")} {...dragProps("log", activity.id)}><button className="timed-card-open" onClick={() => setActivityLogDetail(activity)} aria-label={`Open ${activity.name}`}><span><strong>{activity.name}</strong><small>{relativeCompletion(activity.lastCompletedDate, config.today)}</small></span><ChevronRight aria-hidden="true" /></button><div className="activity-log-card-actions"><button className={`status-button done ${activity.completed ? "active" : ""}`} disabled={activityLogWrites.has(activity.id)} onClick={() => void toggleActivityLogCompletion(activity)} aria-pressed={activity.completed} aria-label={`${activity.completed ? "Mark" : "Mark"} ${activity.name} ${activity.completed ? "not done" : "done"}`}>Done</button><button className={`note-button ${activity.hasNote ? "has-note" : ""}`} onClick={() => openNote({ habitId: activity.id, habitName: activity.name, date: selectedDate, create: !activity.hasNote, kind: "log" })} aria-label={`${activity.hasNote ? "View" : "Add"} note for ${activity.name}`}><StickyNote /></button></div></article>)}</div>}</div>}
    </section>}
    {calendar && <Modal title="Calendar" wide onClose={() => setCalendar(false)}><Calendar selected={selectedDate} today={config.today} onSelect={date => { onDate(date); setCalendar(false); }} onJumpToToday={() => { onDate(config.today); setCalendar(false); }} /></Modal>}
    {adding && <AddHabit defaultDate={selectedDate} onClose={() => setAdding(false)} onSave={async (name, startDate, kind) => {
      try { if (kind === "timed") await api.createTimedActivity(name, startDate); else if (kind === "log") await api.createActivityLog(name, startDate); else await api.createHabit(name, startDate); setAdding(false); await load(); onDataChange(); } catch (error) { reportError(error); }
    }} />}
    {timedDetail && <TimedActivityDetail activity={timedDetail} selectedDate={timedDetail.date} today={config.today} timezone={config.timezone} timer={timers.get(timedDetail.id) ?? null} openNotes={() => openTimedNotes(timedDetail.id)} onTimerChanged={(timer) => timerTracking.replace(timer, timedDetail.id)} onClose={() => setTimedDetail(null)} onChanged={async () => { await load(); await timerTracking.load(); onDataChange(); }} reportError={reportError} />}
    {activityLogDetail && <ActivityLogDetail activity={activityLogDetail} selectedDate={selectedDate} today={config.today} onClose={() => setActivityLogDetail(null)} onNavigateToDate={date => { setActivityLogDetail(null); onDate(date); }} onChanged={async () => { await load(); onDataChange(); }} reportError={reportError} openNote={openNote} refresh={refresh} noteOpen={noteOpen} />}
  </section>;
}

function TimedEntryRow({ activityId, entry, timerActive, onChanged, reportError }: { activityId: number; entry: TimedEntry; timerActive: boolean; onChanged: () => Promise<void>; reportError: (error: unknown) => void }) {
  const [editing, setEditing] = useState(false); const [hours, setHours] = useState(String(Math.floor(entry.minutes / 60))); const [minutes, setMinutes] = useState(String(entry.minutes % 60));
  const total = durationTotal(hours, minutes);
  const normalize = () => { const value = normalizeDuration(hours, minutes); setHours(value.hours); setMinutes(value.minutes); };
  const save = async () => { try { await api.updateTimedEntry(activityId, entry.id, total); setEditing(false); await onChanged(); } catch (error) { reportError(error); } };
  const remove = async () => { try { await api.deleteTimedEntry(activityId, entry.id); await onChanged(); } catch (error) { reportError(error); } };
  return <div className="timed-entry-row">{editing ? <>
    <DurationFields hours={hours} minutes={minutes} onHoursChange={setHours} onMinutesChange={setMinutes} onNormalize={normalize} />
    <div className="timed-entry-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button type="button" className="save" disabled={total < 1 || total > 1440 || (timerActive && total > entry.minutes)} onClick={() => void save()}>Save</button></div>
  </> : <><strong>{formatMinutes(entry.minutes)}</strong><div className="timed-entry-actions"><button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${formatMinutes(entry.minutes)} entry`}><Pencil /></button><button type="button" className="destructive-text" onClick={() => void remove()} aria-label={`Delete ${formatMinutes(entry.minutes)} entry`}><Trash2 /></button></div></>}</div>;
}

function TimedActivityDetail({ activity, selectedDate, today, timezone, timer, openNotes, onTimerChanged, onClose, onChanged, reportError }: { activity: TimedActivityDay; selectedDate: string; today: string; timezone: string; timer: TimedActivityTimer | null; openNotes: () => void; onTimerChanged: (timer: TimedActivityTimer | null) => void; onClose: () => void; onChanged: () => Promise<void>; reportError: (error: unknown) => void }) {
  const initialStopwatchAlert = stopwatchAlertPreference();
  const [week, setWeek] = useState<TimedActivityWeek | null>(null); const [hours, setHours] = useState(""); const [minutes, setMinutes] = useState(""); const [saving, setSaving] = useState(false); const [savingAlert, setSavingAlert] = useState(false); const [menu, setMenu] = useState(false); const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [activityName, setActivityName] = useState(activity.name); const [editingName, setEditingName] = useState(false); const [nameDraft, setNameDraft] = useState(activity.name); const [entryMode, setEntryMode] = useState<"manual" | TimerMode>("manual"); const [intervalEnabled, setIntervalEnabled] = useState(initialStopwatchAlert.enabled); const [intervalHours, setIntervalHours] = useState(String(Math.floor(initialStopwatchAlert.minutes / 60))); const [intervalMinutes, setIntervalMinutes] = useState(String(initialStopwatchAlert.minutes % 60)); const [stopNotice, setStopNotice] = useState(""); const [previewClock, setPreviewClock] = useState(Date.now);
  const timerRef = useRef(timer); const alertSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadWeek = useCallback(async () => { try { setWeek(await api.timedWeek(activity.id, selectedDate)); } catch (error) { reportError(error); } }, [activity.id, selectedDate, reportError]);
  useEffect(() => { void loadWeek(); }, [loadWeek]);
  const selected = week?.days.find(day => day.date === selectedDate); const total = durationTotal(hours, minutes); const intervalTotal = durationTotal(intervalHours, intervalMinutes); const editable = selectedDate <= today && Boolean(selected?.active); const liveAvailable = selectedDate === today && editable; const preview = entryMode === "countdown" ? countdownPreview(total, new Date(previewClock), timezone, selected?.minutes ?? activity.dayMinutes) : null;
  useEffect(() => { timerRef.current = timer; }, [timer]);
  useEffect(() => { if (entryMode !== "countdown" || timer) return; setPreviewClock(Date.now()); const interval = window.setInterval(() => setPreviewClock(Date.now()), 30_000); return () => window.clearInterval(interval); }, [entryMode, timer]);
  useEffect(() => { if (timer?.mode === "stopwatch") { setIntervalEnabled(timer.intervalEnabled); setIntervalHours(String(Math.floor(timer.intervalMinutes / 60))); setIntervalMinutes(String(timer.intervalMinutes % 60)); } }, [timer?.activityId, timer?.mode, timer?.revision, timer?.intervalEnabled, timer?.intervalMinutes]);
  useEffect(() => () => { if (alertSaveTimeout.current) clearTimeout(alertSaveTimeout.current); }, []);
  const refresh = async () => { await loadWeek(); await onChanged(); };
  const normalize = () => { const value = normalizeDuration(hours, minutes); setHours(value.hours); setMinutes(value.minutes); };
  const normalizeInterval = () => { const value = normalizeDuration(intervalHours, intervalMinutes); setIntervalHours(value.hours); setIntervalMinutes(value.minutes); };
  const add = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); try { await api.addTimedEntry(activity.id, selectedDate, total); setHours(""); setMinutes(""); await refresh(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  const startTimer = async () => { setSaving(true); try { await primeTimerAlerts(); if (entryMode === "stopwatch") saveStopwatchAlertPreference(intervalEnabled, intervalTotal); const next = await api.startTimer(activity.id, entryMode as TimerMode, entryMode === "countdown" ? total : undefined, entryMode === "stopwatch" ? intervalEnabled : undefined, entryMode === "stopwatch" && intervalEnabled ? intervalTotal : undefined); onTimerChanged(next); setStopNotice(""); setHours(""); setMinutes(""); await refresh(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  const saveStopwatchAlert = async (enabled: boolean, total: number) => { const current = timerRef.current; if (!current || savingAlert || (enabled && (total < 1 || total > 1440))) return; setSavingAlert(true); try { await primeTimerAlerts(); const next = await api.updateStopwatchAlert(activity.id, current.revision, enabled, enabled ? total : undefined); timerRef.current = next; saveStopwatchAlertPreference(enabled, total); onTimerChanged(next); } catch (error) { const currentTimer = error instanceof ApiError && error.status === 409 ? (error.data as { timer?: TimedActivityTimer })?.timer : undefined; if (currentTimer) onTimerChanged(currentTimer); reportError(error); } finally { setSavingAlert(false); } };
  const scheduleStopwatchAlertSave = (enabled: boolean, nextHours: string, nextMinutes: string) => { if (alertSaveTimeout.current) clearTimeout(alertSaveTimeout.current); const total = durationTotal(nextHours, nextMinutes); if (!enabled || total < 1 || total > 1440) return; alertSaveTimeout.current = setTimeout(() => { void saveStopwatchAlert(enabled, total); }, 350); };
  const changeStopwatchAlert = (enabled: boolean) => { setIntervalEnabled(enabled); if (alertSaveTimeout.current) clearTimeout(alertSaveTimeout.current); void saveStopwatchAlert(enabled, intervalTotal); };
  const changeStopwatchInterval = (field: "hours" | "minutes", value: string) => { const nextHours = field === "hours" ? value : intervalHours; const nextMinutes = field === "minutes" ? value : intervalMinutes; if (field === "hours") setIntervalHours(value); else setIntervalMinutes(value); scheduleStopwatchAlertSave(intervalEnabled, nextHours, nextMinutes); };
  const timerAction = async (operation: () => Promise<TimedActivityTimer>) => { setSaving(true); try { onTimerChanged(await operation()); await refresh(); } catch (error) { const current = error instanceof ApiError && error.status === 409 ? (error.data as { timer?: TimedActivityTimer })?.timer : undefined; if (current) onTimerChanged(current); reportError(error); } finally { setSaving(false); } };
  const cancelTimer = async () => { if (!timer) return; setSaving(true); try { await api.cancelTimer(activity.id, timer.revision); onTimerChanged(null); await refresh(); } catch (error) { const current = error instanceof ApiError && error.status === 409 ? (error.data as { timer?: TimedActivityTimer })?.timer : undefined; if (current) onTimerChanged(current); reportError(error); } finally { setSaving(false); } };
  const stopTimer = async () => { if (!timer) return; setSaving(true); try { const result = await api.stopTimer(activity.id, timer.revision); onTimerChanged(null); setStopNotice(result.recordedMinutes ? `Recorded ${formatMinutes(result.recordedMinutes)}.` : timer.mode === "pomodoro" ? "Stopped without recording a completed minute." : "Stopped without recording time under 30 seconds."); await refresh(); } catch (error) { const current = error instanceof ApiError && error.status === 409 ? (error.data as { timer?: TimedActivityTimer })?.timer : undefined; if (current) onTimerChanged(current); reportError(error); } finally { setSaving(false); } };
  const startTimerFocus = (activityId: number, revision: number) => api.startTimerFocus(activityId, revision);
  const rename = async () => { setSaving(true); try { const value = await api.renameTimedActivity(activity.id, nameDraft); setActivityName(value.name); setNameDraft(value.name); setEditingName(false); void onChanged(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  const manage = async () => { if (!action) return; setSaving(true); try { if (action === "archive") await api.archiveTimedActivity(activity.id); else if (action === "restore") await api.restoreTimedActivity(activity.id); else await api.deleteTimedActivity(activity.id, confirmation); await onChanged(); onClose(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  return <Modal title={activityName} titleDetail={<span className="timed-title-total">(<Clock3 aria-hidden="true" />{formatMinutes(selected?.minutes ?? activity.dayMinutes)})</span>} titleEditor={editingName ? <label className="modal-title-editor">Activity name<input autoFocus maxLength={200} value={nameDraft} onChange={event => setNameDraft(event.target.value)} /></label> : undefined} wide fullPage onClose={onClose} actions={editingName ? <div className="inline-edit-actions"><button className="bar-text-button" onClick={() => { setNameDraft(activityName); setEditingName(false); }}>Cancel</button><button className="bar-text-button save" disabled={!nameDraft.trim() || saving} onClick={() => void rename()}>Save</button></div> : <><button className="icon-button" onClick={openNotes} aria-label={`Notes for ${activityName}`}><NotebookPen /></button><button className="icon-button" onClick={() => setEditingName(true)} aria-label="Edit timed activity"><Pencil /></button><div className="menu-anchor"><button className="icon-button" onClick={() => setMenu(value => !value)} aria-label="More timed activity options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu">{activity.archived ? <button role="menuitem" onClick={() => { setAction("restore"); setMenu(false); }}>Restore</button> : <button role="menuitem" disabled={Boolean(timer)} title={timer ? "Cancel the live timer first" : undefined} onClick={() => { setAction("archive"); setMenu(false); }}>Archive</button>}<button className="destructive-text" role="menuitem" onClick={() => { setAction("delete"); setMenu(false); }}>Delete</button></div></>}</div></>}><div className="timed-detail">
    <section>{liveAvailable && !timer && <><fieldset className="timer-mode-picker"><legend>Record time</legend>{(["manual", "pomodoro", "countdown", "stopwatch"] as const).map(mode => <label className={entryMode === mode ? "selected" : ""} key={mode}><input type="radio" name="timer-mode" checked={entryMode === mode} onChange={() => { setEntryMode(mode); setHours(""); setMinutes(""); }} /><span>{mode === "manual" ? "Manual" : mode === "pomodoro" ? "Pomodoro" : mode === "countdown" ? "Countdown" : "Stopwatch"}</span></label>)}</fieldset>{entryMode === "manual" ? <form className="duration-form" onSubmit={event => void add(event)}><DurationFields hours={hours} minutes={minutes} onHoursChange={setHours} onMinutesChange={setMinutes} onNormalize={normalize} /><button className="form-submit" disabled={saving || total < 1 || total > 1440}>Add entry</button></form> : entryMode === "pomodoro" ? <div className="timer-start-panel"><p>Focus for 25 minutes, followed by a 5-minute break. Every fourth break is 15 minutes.</p><button className="form-submit" disabled={saving} onClick={() => void startTimer()}>Start focus</button></div> : entryMode === "countdown" ? <div className="timer-start-panel"><DurationFields hours={hours} minutes={minutes} onHoursChange={setHours} onMinutesChange={setMinutes} onNormalize={normalize} /><button className="form-submit" disabled={saving || total < 1 || total > 1440} onClick={() => void startTimer()}>Start countdown</button></div> : <div className="timer-start-panel"><p>Track elapsed time and record it when you stop.</p><label className="stopwatch-alert-toggle"><input type="checkbox" checked={intervalEnabled} onChange={event => setIntervalEnabled(event.target.checked)} /> Beep at each interval</label>{intervalEnabled && <div><span className="field-label">Interval duration</span><DurationFields hours={intervalHours} minutes={intervalMinutes} onHoursChange={setIntervalHours} onMinutesChange={setIntervalMinutes} onNormalize={normalizeInterval} /></div>}<button className="form-submit" disabled={saving || (intervalEnabled && (intervalTotal < 1 || intervalTotal > 1440))} onClick={() => void startTimer()}>Start stopwatch</button></div>}</>}{stopNotice && <p className="timer-stop-notice" role="status">{stopNotice}</p>}
      {liveAvailable && timer && <div className={`live-timer-panel ${timer.mode}`}><div className="live-timer-heading"><span aria-hidden="true">{timer.mode === "pomodoro" ? "🍅" : timer.mode === "countdown" ? "⏳" : "⏱️"}</span><div><strong>{timer.mode === "stopwatch" ? "Stopwatch" : timer.mode === "countdown" ? "Countdown" : timer.phase === "focus" ? `Focus ${timer.focusNumber} of 4` : timer.phase === "ready_focus" ? `Focus ${timer.focusNumber} ready` : timer.phase === "long_break" ? "Long break" : "Short break"}</strong><small>{timer.status === "paused" ? "Paused" : timer.status === "ready" ? "Waiting for you" : "Running"}</small></div></div><div className="timer-clock" aria-live="off">{formatTimerClock(timer.mode === "stopwatch" ? timer.elapsedSeconds : timer.remainingSeconds)}</div>{timer.mode === "stopwatch" && <div className="live-stopwatch-alerts"><label className="stopwatch-alert-toggle"><input type="checkbox" checked={intervalEnabled} disabled={savingAlert} onChange={event => changeStopwatchAlert(event.target.checked)} /><span>Beep at each interval</span></label>{intervalEnabled && <div className="live-stopwatch-interval"><span className="field-label">Interval</span><DurationFields hours={intervalHours} minutes={intervalMinutes} onHoursChange={value => changeStopwatchInterval("hours", value)} onMinutesChange={value => changeStopwatchInterval("minutes", value)} onNormalize={normalizeInterval} /></div>}</div>}{timer.mode === "countdown" && <><progress max="100" value={timer.percent}>{timer.percent}%</progress><div className="timer-progress-labels"><span>{formatTimerClock(timer.elapsedSeconds)} elapsed</span><span>{Math.round(timer.percent)}%</span></div></>}<div className="timer-controls">{((timer.mode === "pomodoro" && timer.phase === "focus") || timer.mode === "stopwatch") && timer.status === "running" && <button className="form-submit" disabled={saving} onClick={() => void timerAction(() => api.pauseTimer(activity.id, timer.revision))}>Pause</button>}{((timer.mode === "pomodoro" && timer.phase === "focus") || timer.mode === "stopwatch") && timer.status === "paused" && <button className="form-submit" disabled={saving} onClick={() => void timerAction(() => api.resumeTimer(activity.id, timer.revision))}>Resume</button>}{(timer.mode === "stopwatch" || (timer.mode === "pomodoro" && timer.phase === "focus")) && <button className="form-submit" disabled={saving} onClick={() => void stopTimer()}>Stop</button>}{timer.mode === "pomodoro" && (timer.phase === "short_break" || timer.phase === "long_break") && <button className="form-submit" disabled={saving} onClick={() => void timerAction(() => api.skipTimerBreak(activity.id, timer.revision))}>Skip break</button>}{timer.mode === "pomodoro" && timer.phase === "ready_focus" && <button className="form-submit" disabled={saving} onClick={() => void startTimerFocus(activity.id, timer.revision)}>Start focus</button>}<button className="timer-cancel" disabled={saving} onClick={() => void cancelTimer()}>Cancel {timer.mode === "pomodoro" ? "Pomodoro" : timer.mode === "countdown" ? "countdown" : "stopwatch"}</button></div></div>}
      {editable && !liveAvailable && <form className="duration-form" onSubmit={event => void add(event)}><DurationFields hours={hours} minutes={minutes} onHoursChange={setHours} onMinutesChange={setMinutes} onNormalize={normalize} /><button className="form-submit" disabled={saving || total < 1 || total > 1440}>Add entry</button></form>}
      {preview && <div className="countdown-preview" aria-live="polite"><strong>{preview.endLabel}</strong>{preview.overBy > 0 && <p role="status">This countdown exceeds today’s quota by {formatMinutes(preview.overBy)}. Reduce the duration or today’s logged time before starting.</p>}</div>}
      <h3>Entries</h3>{timer && <p className="timer-reservation-note">While this timer is active, entries can be deleted or reduced but not added or increased.</p>}{selected?.entries.length ? <div className="timed-entries">{selected.entries.map(entry => <TimedEntryRow key={entry.id} activityId={activity.id} entry={entry} timerActive={Boolean(timer)} onChanged={refresh} reportError={reportError} />)}</div> : <p className="secondary">No time logged. This day remains at zero.</p>}
    </section>
    <TimedStatistics activityId={activity.id} activityStart={activity.startDate} selectedDate={selectedDate} selectedMinutes={selected?.minutes ?? activity.dayMinutes} reportError={reportError} />
  </div>{action && <Modal title={action === "archive" ? "Archive timed activity" : action === "restore" ? "Restore timed activity" : "Delete timed activity"} onClose={() => { setAction(null); setConfirmation(""); }}><div className="confirmation-panel">{action === "archive" ? <p>This activity will disappear from today’s active list immediately. Its sessions and notes will be preserved.</p> : action === "restore" ? <p>This activity returns to tracking today. The inactive gap remains unavailable.</p> : <><p>This permanently deletes the activity, all duration entries, notes, and archive history. A safety backup is created first.</p><label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label></>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={saving || (action === "delete" && confirmation !== "DELETE")} onClick={() => void manage()}>{saving ? "Working…" : action === "archive" ? "Archive activity" : action === "restore" ? "Restore activity" : <><Trash2 />Delete permanently</>}</button></div></Modal>}</Modal>;
}

function ActivityLogDetail({ activity, selectedDate, today, onClose, onNavigateToDate, onChanged, reportError, openNote, refresh, noteOpen }: { activity: ActivityLogDay; selectedDate: string; today: string; onClose: () => void; onNavigateToDate: (date: string) => void; onChanged: () => Promise<void>; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void; refresh: number; noteOpen: boolean }) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7)); const [data, setData] = useState<ActivityLogMonth | null>(null); const [chosen] = useState(selectedDate); const [working, setWorking] = useState(false); const [menu, setMenu] = useState(false); const [action, setAction] = useState<"archive" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [activityName, setActivityName] = useState(activity.name); const [editingName, setEditingName] = useState(false); const [nameDraft, setNameDraft] = useState(activity.name); const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => lockScroll(), []);
  const load = useCallback(() => { void api.activityLogMonth(activity.id, month).then(setData).catch(reportError); }, [activity.id, month, reportError]);
  useEffect(() => { load(); }, [load]);
  const first = parseDay(`${month}-01`); const leading = (first.getUTCDay() + 6) % 7;
  const shift = (offset: number) => { const value = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1, 12)); setMonth(dayISO(value).slice(0, 7)); };
  const rename = async () => { setWorking(true); try { const value = await api.renameActivityLog(activity.id, nameDraft); setActivityName(value.name); setNameDraft(value.name); setEditingName(false); await onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  const manage = async () => { if (!action) return; setWorking(true); try { if (action === "archive") await api.archiveActivityLog(activity.id); else await api.deleteActivityLog(activity.id, confirmation); await onChanged(); onClose(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  const note = (date: string, create: boolean) => openNote({ habitId: activity.id, habitName: activityName, date, create, kind: "log" });
  return <>
    <div className="habit-detail-view" inert={notesOpen || noteOpen} aria-hidden={notesOpen || noteOpen || undefined}>
      <header className="habit-detail-bar">{editingName ? <><button className="bar-text-button" onClick={() => { setNameDraft(activityName); setEditingName(false); }}>Cancel</button><button className="bar-text-button save" disabled={!nameDraft.trim() || working} onClick={() => void rename()}>Save</button></> : <><button className="round-bar-button" onClick={onClose} aria-label="Close activity log details"><X /></button><div className="detail-actions"><button onClick={() => setNotesOpen(true)} aria-label={`Notes for ${activityName}`}><NotebookPen /></button><button onClick={() => setEditingName(true)} aria-label="Edit activity log"><Pencil /></button><div className="menu-anchor"><button onClick={() => setMenu(value => !value)} aria-label="More activity log options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu"><button role="menuitem" onClick={() => { setAction("archive"); setMenu(false); }}>Archive</button><button className="destructive-text" role="menuitem" onClick={() => { setAction("delete"); setMenu(false); }}><Trash2 />Delete</button></div></>}</div></div></>}</header>
      <main className="habit-detail-content"><h1>{editingName ? <input className="detail-title-input" autoFocus maxLength={200} value={nameDraft} onChange={event => setNameDraft(event.target.value)} aria-label="Activity name" /> : activityName}</h1><p className="secondary">{relativeCompletion(activity.lastCompletedDate, today)}</p>
        <div className="calendar"><div className="calendar-head"><button className="icon-button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></button><strong>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</strong><button className="icon-button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></button></div><div className="calendar-grid weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid days">{Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}{data?.days.map(day => <button key={day.date} className={`calendar-day activity-log-day ${day.active ? "active" : "inactive"} ${day.date === chosen ? "selected" : ""} ${day.completed ? "completed" : ""} ${day.hasNote ? "has-note" : ""}`} disabled={!day.active || day.date > today} onClick={() => onNavigateToDate(day.date)} aria-label={`${day.date}${day.completed ? ", completed" : ""}${day.hasNote ? ", has note" : ""}`}><span>{Number(day.date.slice(-2))}</span><span className="markers" aria-hidden="true">{day.completed && <i className="done-dot" />}{day.hasNote && <i className="note-dot" />}</span></button>)}</div></div>
      </main>
      {action && <Modal title={action === "archive" ? "Archive activity log" : "Delete activity log"} onClose={() => { setAction(null); setConfirmation(""); }}><div className="confirmation-panel">{action === "archive" ? <p>This activity will disappear from today’s active list immediately. Its completion history and notes are preserved.</p> : <><p>This permanently deletes the activity, its completion history, notes, and archive history. A safety backup is created first.</p><label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label></>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={working || (action === "delete" && confirmation !== "DELETE")} onClick={() => void manage()}>{working ? "Working…" : action === "archive" ? "Archive activity" : <><Trash2 />Delete permanently</>}</button></div></Modal>}
    </div>
    {notesOpen && <div inert={noteOpen} aria-hidden={noteOpen || undefined}><ActivityLogNotesView key={activity.id} activityId={activity.id} activityName={activityName} today={today} refresh={refresh} active={!noteOpen} onClose={() => setNotesOpen(false)} openNote={(date, create) => note(date, create)} reportError={reportError} /></div>}
  </>;
}
function AddHabit({ defaultDate, onClose, onSave }: { defaultDate: string; onClose: () => void; onSave: (name: string, date: string, kind: "daily" | "timed" | "log") => Promise<void> }) {
  const [name, setName] = useState(""); const [date, setDate] = useState(defaultDate); const [kind, setKind] = useState<"daily" | "timed" | "log">("daily"); const [saving, setSaving] = useState(false);
  return <Modal title="New activity" onClose={onClose}><form className="form" onSubmit={event => { event.preventDefault(); setSaving(true); void onSave(name, date, kind).finally(() => setSaving(false)); }}>
    <label>Type<select value={kind} onChange={event => setKind(event.target.value as "daily" | "timed" | "log")}><option value="daily">Daily habit</option><option value="timed">Timed activity</option><option value="log">Activity log</option></select></label>
    <label>{kind === "daily" ? "Habit name" : "Activity name"}<input autoFocus value={name} maxLength={200} onChange={event => setName(event.target.value)} placeholder={kind === "log" ? "Change vase water, clean filter…" : kind === "timed" ? "Study, read, exercise…" : "Read, walk, meditate…"} /></label>
    <label>Start date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <button className="form-submit" disabled={!name.trim() || saving}>{saving ? "Adding…" : kind === "timed" ? "Add timed activity" : kind === "log" ? "Add activity log" : "Add habit"}</button>
  </form></Modal>;
}

function NotificationsPage({ items, systemItems, reportError, openDate, onDataChange }: { items: Unresolved[]; systemItems: SystemNotification[]; reportError: (error: unknown) => void; openDate: (date: string) => void; onDataChange: () => void }) {
  const dismiss = async (item: SystemNotification) => {
    if (typeof item.id !== "number") return;
    try { await api.dismissSystemNotification(item.id); onDataChange(); }
    catch (error) { reportError(error); }
  };
  return <section className="page list-page"><h1>Notifications</h1>{systemItems.length > 0 && <div className="settings-group system-notifications"><h2>System</h2>{systemItems.map(item => <div className="system-notification" key={item.id}><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString("en-GB")}</small></div>{typeof item.id === "number" && <button className="small-button" onClick={() => void dismiss(item)}>Dismiss</button>}</div>)}</div>}{items.length === 0 && systemItems.length === 0 ? <EmptyState icon={<BellOff />} title="No notifications" detail="All past habits are resolved and the system is running normally." /> : items.length > 0 && <div className="inset-list">{items.map(item => <button className="list-row" key={item.date} onClick={() => openDate(item.date)}><span><strong>{prettyDate(item.date)}</strong><small>{item.pendingCount} {item.pendingCount === 1 ? "habit" : "habits"} unresolved</small></span><ChevronRight /></button>)}</div>}</section>;
}

function NoteDetailView({ target, onClose: exitNote, onChanged, reportError }: { target: NoteTarget; onClose: () => void; onChanged: () => void; reportError: (error: unknown) => void }) {
  const [note, setNote] = useState<NoteDetail | null>(null); const [body, setBody] = useState(""); const [editing, setEditing] = useState(target.create); const [notFound, setNotFound] = useState(false); const [menu, setMenu] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false); const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const dirty = useRef(false);
  useEffect(() => { dirty.current = editing && body !== (note?.body ?? ""); }, [editing, body, note]);
  const allowExit = () => !dirty.current || window.confirm("Discard unsaved note changes?");
  const onClose = () => { if (allowExit()) { dirty.current = false; exitNote(); } };
  useEffect(() => {
    let active = true;
    setLoadError("");
    const request = target.kind === "timed" ? api.timedNote(target.habitId, target.date) : target.kind === "log" ? api.activityLogNote(target.habitId, target.date) : api.note(target.habitId, target.date);
    void request.then(value => { if (active) { setNote(value); if (!dirty.current) setBody(value.body); if (value.archived) setEditing(false); setNotFound(!value.exists && !target.create); } }).catch(error => { if (active) { setLoadError(error instanceof Error ? error.message : "Could not load note."); reportError(error); } });
    return () => { active = false; };
  }, [target, reportError, attempt]);
  useEffect(() => {
    const unregister = registerLeaveGuard(() => !dirty.current || window.confirm("Discard unsaved note changes?"));
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", unload);
    return () => { unregister(); window.removeEventListener("beforeunload", unload); };
  }, []);
  useEffect(() => { const closeMenu = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(false); }; window.addEventListener("keydown", closeMenu); return () => window.removeEventListener("keydown", closeMenu); }, []);
  const changed = () => { window.dispatchEvent(new Event("note-changed")); onChanged(); };
  const persist = (value: string) => target.kind === "timed" ? api.saveTimedNote(target.habitId, target.date, value) : target.kind === "log" ? api.saveActivityLogNote(target.habitId, target.date, value) : api.saveNote(target.habitId, target.date, value);
  const save = async () => { setSaving(true); try { await persist(body); dirty.current = false; changed(); exitNote(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  const remove = async () => { setSaving(true); try { await persist(""); dirty.current = false; changed(); exitNote(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  if (!note) return <div className="habit-detail-view"><header className="habit-detail-bar"><button className="round-bar-button" onClick={onClose} aria-label="Close note"><X /></button></header><div className="loading" role="status">{loadError || "Loading note…"}{loadError && <button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button>}</div></div>;
  if (notFound) return <div className="habit-detail-view"><header className="habit-detail-bar"><button className="round-bar-button" onClick={onClose} aria-label="Close note"><X /></button></header><main className="habit-detail-content"><EmptyState icon={<StickyNote />} title="Note not found" detail="It may have been deleted or removed by a database restore." /></main></div>;
  const cancelEdit = () => { setBody(note.body); setEditing(false); };
  return <div className="habit-detail-view"><header className="habit-detail-bar">{editing && !note.archived ? <><button className="bar-text-button" onClick={target.create ? onClose : cancelEdit}>{target.create ? "Close" : "Cancel"}</button><button className="bar-text-button save" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button></> : <><button className="round-bar-button" onClick={onClose} aria-label="Close note"><X /></button>{!note.archived && <div className="detail-actions"><button onClick={() => setEditing(true)} aria-label="Edit note"><Pencil /></button><div className="menu-anchor"><button onClick={() => setMenu(value => !value)} aria-label="More note options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu"><button className="destructive-text" role="menuitem" onClick={() => { setMenu(false); setConfirmDelete(true); }}><Trash2 />Delete</button></div></>}</div></div>}</>}</header><main className="habit-detail-content note-detail-content"><h1>{note.habitName}</h1><p className="note-detail-date">{prettyDate(note.date)}</p>{note.archived && <span className="archive-badge detail-badge">Archived</span>}{editing && !note.archived ? <><label className="visually-hidden" htmlFor="note-detail-body">Note</label><textarea id="note-detail-body" className="note-detail-editor" autoFocus value={body} maxLength={20_000} onChange={event => { dirty.current = event.target.value !== (note?.body ?? ""); setBody(event.target.value); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !saving) { event.preventDefault(); void save(); } }} placeholder="Add a note for this day…" /><div className="note-detail-count">{body.length.toLocaleString()} / 20,000</div></> : <div className="note-detail-body">{note.body}</div>}</main>{confirmDelete && <Modal title="Delete note" onClose={() => setConfirmDelete(false)}><div className="confirmation-panel"><p className="delete-note-question">Delete this note?</p><div className="confirmation-actions"><button className="bar-text-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="danger-button" disabled={saving} onClick={() => void remove()}><Trash2 />Delete</button></div></div></Modal>}</div>;
}

function ManagementPage({ refresh, openHabit, openTimed, reportError }: { refresh: number; openHabit: (id: number) => void; openTimed: (id: number) => void; reportError: (error: unknown) => void }) {
  const [items, setItems] = useState<HabitSummary[]>([]); const [timed, setTimed] = useState<TimedActivitySummary[]>([]); const [logs, setLogs] = useState<ActivityLogSummary[]>([]); const [selectedLog, setSelectedLog] = useState<ActivityLogSummary | null>(null);
  useEffect(() => { void Promise.all([api.habitSummaries(), api.timedActivitySummaries(), api.activityLogSummaries()]).then(([daily, timedItems, logItems]) => { setItems(daily); setTimed(timedItems); setLogs(logItems); }).catch(reportError); }, [refresh, reportError]);
  const archived = items.filter(item => item.archived).sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const archivedTimed = timed.filter(item => item.archived).sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const archivedLogs = logs.filter(item => item.archived).sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const dailyRows = (values: HabitSummary[], archivedStyle = false) => values.length === 0 ? <p className="management-empty">None</p> : <div className="management-list">{values.map(item => <button className={`list-row ${archivedStyle ? "archived-habit-row" : ""}`} key={item.id} onClick={() => openHabit(item.id)}><span><strong>{item.name}</strong><small>Started {prettyDate(item.startDate)}</small></span>{archivedStyle && <i className="archive-badge">Archived</i>}<ChevronRight /></button>)}</div>;
  const timedRows = (values: TimedActivitySummary[], archivedStyle = false) => values.length === 0 ? <p className="management-empty">None</p> : <div className="management-list">{values.map(item => <button className={`list-row ${archivedStyle ? "archived-habit-row" : ""}`} key={item.id} onClick={() => openTimed(item.id)}><span><strong>{item.name}</strong><small>Started {prettyDate(item.startDate)} · {item.noteCount} {item.noteCount === 1 ? "note" : "notes"}</small></span>{archivedStyle && <i className="archive-badge">Archived</i>}<ChevronRight /></button>)}</div>;
  const logRows = (values: ActivityLogSummary[], archivedStyle = false) => values.length === 0 ? <p className="management-empty">None</p> : <div className="management-list">{values.map(item => <button className={`list-row ${archivedStyle ? "archived-habit-row" : ""}`} key={item.id} onClick={() => setSelectedLog(item)}><span><strong>{item.name}</strong><small>Started {prettyDate(item.startDate)} · {item.noteCount} {item.noteCount === 1 ? "note" : "notes"}</small></span>{archivedStyle && <i className="archive-badge">Archived</i>}<ChevronRight /></button>)}</div>;
  const subgroup = (label: string, content: React.ReactNode) => <div className="management-subgroup"><h2 className="nested-management">{label}</h2>{content}</div>;
  return <section className="page list-page"><h1>Archived cards</h1><div className="settings-group management-group">
    {subgroup("Daily habits", dailyRows(archived, true))}{subgroup("Timed activities", timedRows(archivedTimed, true))}{subgroup("Activity log", logRows(archivedLogs, true))}
  </div>{selectedLog && <ActivityLogManagementDetail activity={selectedLog} onClose={() => setSelectedLog(null)} onChanged={() => setSelectedLog(null)} reportError={reportError} />}</section>;
}

function ActivityLogManagementDetail({ activity, onClose, onChanged, reportError }: { activity: ActivityLogSummary; onClose: () => void; onChanged: () => void; reportError: (error: unknown) => void }) {
  const [name, setName] = useState(activity.name); const [editing, setEditing] = useState(false); const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [working, setWorking] = useState(false);
  const save = async () => { setWorking(true); try { await api.renameActivityLog(activity.id, name); setEditing(false); onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  const run = async () => { if (!action) return; setWorking(true); try { if (action === "archive") await api.archiveActivityLog(activity.id); else if (action === "restore") await api.restoreActivityLog(activity.id); else await api.deleteActivityLog(activity.id, confirmation); onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  return <Modal title={editing ? "Edit activity log" : activity.name} onClose={onClose} actions={!editing && <><button className="icon-button" onClick={() => setEditing(true)} aria-label="Edit activity log"><Pencil /></button><button className="small-button" onClick={() => setAction(activity.archived ? "restore" : "archive")}>{activity.archived ? "Restore" : "Archive"}</button></>}>{editing ? <div className="form"><label>Activity name<input autoFocus value={name} maxLength={200} onChange={event => setName(event.target.value)} /></label><button className="form-submit" disabled={!name.trim() || working} onClick={() => void save()}>Save</button></div> : <div className="detail-facts"><div><span>Type</span><strong>Activity log</strong></div><div><span>Original start date</span><strong>{prettyDate(activity.startDate)}</strong></div><div><span>Saved notes</span><strong>{activity.noteCount}</strong></div><button className="danger-button" onClick={() => setAction("delete")}><Trash2 />Delete permanently</button></div>}{action && <div className="confirmation-panel"><p>{action === "delete" ? "This permanently deletes the activity, its completion history, notes, and archive history. A safety backup is created first." : action === "archive" ? "This activity will disappear from today’s active list immediately." : "This activity returns to tracking today."}</p>{action === "delete" && <label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={working || (action === "delete" && confirmation !== "DELETE")} onClick={() => void run()}>{action === "delete" ? <><Trash2 />Delete permanently</> : action === "archive" ? "Archive activity" : "Restore activity"}</button></div>}</Modal>;
}

function StreakList({ streaks }: { streaks: Streak[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? streaks : streaks.slice(0, 3);
  return <><div className="streak-list">{visible.map(streak => <div key={`${streak.startDate}-${streak.endDate}`}><strong>{streak.length} days</strong><span>{prettyDate(streak.startDate)} – {prettyDate(streak.endDate)}</span></div>)}</div>{streaks.length > 3 && <button className="streak-more" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "View more"}</button>}</>;
}

function HabitHistory({ habit, reportError, openNote }: { habit: HabitDetail; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void }) {
  const [periods, setPeriods] = useState<ArchivePeriod[]>([]); const [selected, setSelected] = useState<ArchivePeriod | null>(null);
  const load = useCallback(() => api.archivePeriods(habit.id).then(items => { setPeriods(items); if (selected) setSelected(items.find(item => item.id === selected.id) ?? null); }).catch(reportError), [habit.id, reportError, selected]);
  useEffect(() => { void api.archivePeriods(habit.id).then(setPeriods).catch(reportError); }, [habit.id, reportError]);
  useEffect(() => { const refreshNotes = () => { void load(); }; window.addEventListener("note-changed", refreshNotes); return () => window.removeEventListener("note-changed", refreshNotes); }, [load]);
  if (selected) return <section className="habit-subpage"><button className="back-link" onClick={() => setSelected(null)}><ChevronLeft />History</button><h2>Active period {selected.number}</h2><p className="detail-range">{prettyDate(selected.startDate)} – {prettyDate(selected.endDate)}</p><div className="stat-grid"><span>Ending streak<strong>{selected.currentStreak}</strong></span><span>Longest streak<strong>{selected.longestStreak?.length ?? 0}</strong></span><span>Notes<strong>{selected.notes.length}</strong></span></div><h3>Streak history</h3>{selected.streaks.length ? <StreakList streaks={selected.streaks} /> : <p className="secondary">No completed streaks in this period.</p>}<h3 className="detail-section-title">Notes</h3>{selected.notes.length ? <div className="note-history">{selected.notes.map(note => <button key={note.date} onClick={() => openNote({ habitId: habit.id, habitName: habit.name, date: note.date, create: false, archived: true })}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div> : <p className="secondary">No notes in this period.</p>}</section>;
  return <section className="habit-subpage"><h2>History</h2>{periods.length ? <div className="inset-list">{[...periods].reverse().map(period => <button className="list-row" key={period.id} onClick={() => setSelected(period)}><span><strong>Active period {period.number}</strong><small>{prettyDate(period.startDate)} – {prettyDate(period.endDate)}</small></span><ChevronRight /></button>)}</div> : <p className="secondary">No archive history yet.</p>}</section>;
}

function HabitDetailView({ habitId, today, openNotes, onClose, onNavigateToDate, onChanged, onDeleted, reportError, openNote, refresh }: { refresh: number; habitId: number; today: string; openNotes: () => void; onClose: () => void; onNavigateToDate: (date: string) => void; onChanged: () => void; onDeleted: () => void; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void }) {
  const [habit, setHabit] = useState<HabitDetail | null>(null); const [editing, setEditing] = useState(false); const [name, setName] = useState(""); const [startDate, setStartDate] = useState(""); const [menu, setMenu] = useState(false); const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [working, setWorking] = useState(false); const [history, setHistory] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoadError("");
    void api.habitDetail(habitId).then(value => { if (active) { setHabit(value); setName(value.name); setStartDate(value.startDate); } }).catch(error => { if (active) { setLoadError("Could not load habit."); reportError(error); } });
    return () => { active = false; };
  }, [habitId, reportError, attempt, refresh]);
  useEffect(() => { const closeMenu = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(false); }; window.addEventListener("keydown", closeMenu); return () => window.removeEventListener("keydown", closeMenu); }, []);
  if (!habit) return <div className="habit-detail-view"><header className="habit-detail-bar"><button className="round-bar-button" onClick={onClose} aria-label="Close habit details"><X /></button></header><div className="loading" role="status">{loadError || "Loading habit…"}{loadError && <button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button>}</div></div>;
  const update = async () => { setWorking(true); try { const value = await api.updateHabit(habit.id, name, startDate); setHabit(value); setName(value.name); setStartDate(value.startDate); setEditing(false); onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  const runAction = async () => { if (!action) return; setWorking(true); try {
    if (action === "archive") { const value = await api.archiveHabit(habit.id); setHabit(value); onChanged(); }
    if (action === "restore") { const value = await api.restoreHabit(habit.id); setHabit(value); onChanged(); }
    if (action === "delete") { await api.deleteHabit(habit.id, confirmation); onChanged(); onDeleted(); return; }
    setAction(null); setConfirmation("");
  } catch (error) { reportError(error); } finally { setWorking(false); } };
  return <div className="habit-detail-view"><header className="habit-detail-bar">{editing ? <><button className="bar-text-button" onClick={() => { setName(habit.name); setStartDate(habit.startDate); setEditing(false); }}>Cancel</button><button className="bar-text-button save" disabled={!name.trim() || !startDate || working} onClick={() => void update()}>Save</button></> : <><button className="round-bar-button" onClick={onClose} aria-label="Close habit details"><X /></button><div className="detail-actions"><button onClick={openNotes} aria-label={`Notes for ${habit.name}`}><NotebookPen /></button><button onClick={() => setEditing(true)} aria-label="Edit habit"><Pencil /></button><div className="menu-anchor"><button onClick={() => setMenu(value => !value)} aria-label="More habit options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu">{habit.archived ? <button role="menuitem" onClick={() => { setAction("restore"); setConfirmation(""); setMenu(false); }}>Restore</button> : <button role="menuitem" onClick={() => { setAction("archive"); setMenu(false); }}>Archive</button>}<button className="destructive-text" role="menuitem" onClick={() => { setAction("delete"); setConfirmation(""); setMenu(false); }}><Trash2 />Delete</button></div></>}</div></div></>}</header><main className="habit-detail-content">{editing ? <><label className="detail-title-editor">Habit name<input autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label><label className="detail-title-editor">Original start date<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label></> : <h1>{habit.name}</h1>}{habit.archived && <span className="archive-badge detail-badge">Archived</span>}<div className="detail-facts"><div><span>Original start date</span><strong>{prettyDate(habit.startDate)}</strong></div>{habit.archived && habit.latestActiveRange && <div><span>Most recent active range</span><strong>{prettyDate(habit.latestActiveRange.startDate)} – {prettyDate(habit.latestActiveRange.endDate)}</strong></div>}</div><div className="stat-grid"><span>{habit.archived ? "Ending streak" : "Current streak"}<strong>{habit.currentStreak}</strong></span><span>Longest streak<strong>{habit.longestStreak?.length ?? 0}</strong></span><span>Notes<strong>{habit.noteCount}</strong></span></div><HabitStatusCalendar habitId={habit.id} today={today} refreshKey={habit.startDate} onError={reportError} onNavigateToDate={onNavigateToDate} /><button className="history-link" onClick={() => setHistory(value => !value)}>{history ? "Hide history" : "History"}<ChevronRight /></button>{history && (habit.archived ? <HabitHistory habit={habit} reportError={reportError} openNote={openNote} /> : <section className="habit-subpage"><h2>Streak history</h2>{habit.streaks.length ? <StreakList streaks={habit.streaks} /> : <p className="secondary">No completed streaks yet.</p>}</section>)}</main>
    {action && <Modal title={action === "archive" ? "Archive habit" : action === "restore" ? "Restore habit" : "Delete habit"} onClose={() => { setAction(null); setConfirmation(""); }}><div className="confirmation-panel">{action === "archive" ? <p>This habit will disappear from today’s active list immediately. Its history and notes will remain.</p> : action === "restore" ? <p>This habit will return to daily tracking starting today. Dates between archive and restoration remain inactive and will not be backfilled.</p> : <><p>This permanently deletes the habit, daily statuses, notes, challenges, and archive history. A safety backup is created immediately before deletion.</p><label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label></>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={working || (action === "delete" && confirmation !== "DELETE")} onClick={() => void runAction()}>{working ? "Working…" : action === "archive" ? "Archive habit" : action === "restore" ? "Restore habit" : <><Trash2 />Delete permanently</>}</button></div></Modal>}
  </div>;
}

function TimedManagementDetail({ activityId, onClose, onChanged, reportError, openNotes }: { activityId: number; onClose: () => void; onChanged: () => void; reportError: (error: unknown) => void; openNotes: () => void }) {
  const [activity, setActivity] = useState<TimedActivitySummary | null>(null); const [name, setName] = useState(""); const [editing, setEditing] = useState(false); const [menu, setMenu] = useState(false); const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoadError("");
    void api.timedActivityDetail(activityId).then(value => { if (active) { setActivity(value); setName(value.name); } }).catch(error => { if (active) { setLoadError("Could not load timed activity."); reportError(error); } });
    return () => { active = false; };
  }, [activityId, reportError, attempt]);
  if (!activity) return <div className="habit-detail-view"><header className="habit-detail-bar"><button className="round-bar-button" onClick={onClose} aria-label="Close timed activity details"><X /></button></header><div className="loading" role="status">{loadError || "Loading timed activity…"}{loadError && <button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button>}</div></div>;
  const rename = async () => { setWorking(true); try { const value = await api.renameTimedActivity(activity.id, name); setActivity(value); setEditing(false); onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  const runAction = async () => { if (!action) return; setWorking(true); try { if (action === "archive") setActivity(await api.archiveTimedActivity(activity.id)); if (action === "restore") setActivity(await api.restoreTimedActivity(activity.id)); if (action === "delete") { await api.deleteTimedActivity(activity.id, confirmation); onChanged(); onClose(); return; } setAction(null); setConfirmation(""); onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  return <div className="habit-detail-view"><header className="habit-detail-bar">{editing ? <><button className="bar-text-button" onClick={() => { setName(activity.name); setEditing(false); }}>Cancel</button><button className="bar-text-button save" disabled={!name.trim() || working} onClick={() => void rename()}>Save</button></> : <><button className="round-bar-button" onClick={onClose} aria-label="Close timed activity details"><X /></button><div className="detail-actions"><button onClick={openNotes} aria-label={`Notes for ${activity.name}`}><NotebookPen /></button><button onClick={() => setEditing(true)} aria-label="Edit timed activity"><Pencil /></button><div className="menu-anchor"><button onClick={() => setMenu(value => !value)} aria-label="More timed activity options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu">{activity.archived ? <button role="menuitem" onClick={() => { setAction("restore"); setMenu(false); }}>Restore</button> : <button role="menuitem" onClick={() => { setAction("archive"); setMenu(false); }}>Archive</button>}<button className="destructive-text" role="menuitem" onClick={() => { setAction("delete"); setMenu(false); }}><Trash2 />Delete</button></div></>}</div></div></>}</header><main className="habit-detail-content">{editing ? <label className="detail-title-editor">Activity name<input autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label> : <h1>{activity.name}</h1>}{activity.archived && <span className="archive-badge detail-badge">Archived</span>}<div className="detail-facts"><div><span>Type</span><strong>Timed activity</strong></div><div><span>Original start date</span><strong>{prettyDate(activity.startDate)}</strong></div>{activity.archivedAt && <div><span>Archived</span><strong>{prettyDate(activity.archivedAt)}</strong></div>}<div><span>Saved notes</span><strong>{activity.noteCount}</strong></div></div></main>
    {action && <Modal title={action === "archive" ? "Archive timed activity" : action === "restore" ? "Restore timed activity" : "Delete timed activity"} onClose={() => { setAction(null); setConfirmation(""); }}><div className="confirmation-panel">{action === "archive" ? <p>This activity will disappear from today’s active list immediately. Sessions and notes are preserved.</p> : action === "restore" ? <p>This activity returns to tracking today. The inactive gap remains unavailable.</p> : <><p>This permanently deletes the activity, duration entries, notes, and archive history. A safety backup is created first.</p><label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label></>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={working || (action === "delete" && confirmation !== "DELETE")} onClick={() => void runAction()}>{working ? "Working…" : action === "archive" ? "Archive activity" : action === "restore" ? "Restore activity" : <><Trash2 />Delete permanently</>}</button></div></Modal>}
  </div>;
}

const backupLabels: Record<BackupFile["category"], string> = { daily: "Daily", weekly: "Weekly", "on-demand": "On-demand", "pre-import": "Pre-import", "pre-restore": "Pre-restore", "pre-delete": "Pre-delete" };
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const backupSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const saveDownload = ({ blob, filename }: { blob: Blob; filename: string }) => {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

function BackupRows({ items, showSafety, onDownload, onRestore, onDelete }: { items: BackupFile[]; showSafety: boolean; onDownload: (item: BackupFile) => void; onRestore?: (item: BackupFile) => void; onDelete: (item: BackupFile) => void }) {
  const visible = items.filter(item => showSafety || !item.safety);
  if (visible.length === 0) return <p className="backup-empty">No backups yet.</p>;
  return <div className="backup-list">{visible.map(item => <article className="backup-row" key={item.filename}><div className="backup-summary"><span className={`backup-tag ${item.category}`}>{backupLabels[item.category]}</span><span><strong>{new Date(item.createdAt).toLocaleString("en-GB")}</strong><small>{item.filename} · {backupSize(item.size)}</small></span></div><div className="backup-actions"><button onClick={() => onDownload(item)}><Download />Download</button>{onRestore && <button className="destructive-text" onClick={() => onRestore(item)}>Restore</button>}<button className="destructive-text" onClick={() => onDelete(item)}><Trash2 />Delete</button></div></article>)}</div>;
}

function MorePage({ config, reportError, imported, theme, onThemeChange, pwaInstall }: { config: Config; reportError: (error: unknown) => void; imported: () => void; theme: Theme; onThemeChange: (theme: Theme) => void; pwaInstall: PwaInstallState }) {
  const [backupOpen, setBackupOpen] = useState(false); const [advancedOpen, setAdvancedOpen] = useState(false); const [legacyOpen, setLegacyOpen] = useState(false); const [uploadOpen, setUploadOpen] = useState(false); const [showSafety, setShowSafety] = useState(false);
  const [file, setFile] = useState<File | null>(null); const [confirmation, setConfirmation] = useState(""); const [working, setWorking] = useState(false); const [success, setSuccess] = useState("");
  const [backups, setBackups] = useState<BackupFile[]>([]); const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null); const [backupMessage, setBackupMessage] = useState(""); const [backupWorking, setBackupWorking] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null); const [uploadConfirmation, setUploadConfirmation] = useState("");
  const [pendingAction, setPendingAction] = useState<{ type: "restore" | "delete"; item: BackupFile } | null>(null); const [actionConfirmation, setActionConfirmation] = useState("");
  const loadBackups = useCallback(() => Promise.all([api.backups(), api.backupSettings()]).then(([items, settings]) => { setBackups(items); setBackupSettings(settings); }), []);
  useEffect(() => { void loadBackups().catch(reportError); }, [loadBackups, reportError]);
  const runImport = async (event: React.FormEvent) => {
    event.preventDefault(); if (!file) return; setWorking(true); setSuccess("");
    try { const result = await api.importDatabase(file, confirmation); setSuccess(`Import complete. Safety backup: ${result.backup}`); setFile(null); setConfirmation(""); imported(); }
    catch (error) { reportError(error); } finally { setWorking(false); }
  };
  const createBackup = async () => { setBackupWorking(true); setBackupMessage(""); try { saveDownload(await api.createBackup()); setBackupMessage("Backup created and downloaded."); await loadBackups(); } catch (error) { reportError(error); } finally { setBackupWorking(false); } };
  const downloadBackup = async (item: BackupFile) => { try { saveDownload(await api.downloadBackup(item.filename)); } catch (error) { reportError(error); } };
  const saveSettings = async (event: React.FormEvent) => { event.preventDefault(); if (!backupSettings) return; setBackupWorking(true); try { setBackupSettings(await api.saveBackupSettings(backupSettings)); setBackupMessage("Backup settings saved."); } catch (error) { reportError(error); } finally { setBackupWorking(false); } };
  const runBackupAction = async () => { if (!pendingAction) return; setBackupWorking(true); try { if (pendingAction.type === "delete") { await api.deleteBackup(pendingAction.item.filename, actionConfirmation); setBackupMessage("Backup deleted."); } else { const result = await api.restoreBackup(pendingAction.item.filename, actionConfirmation); setBackupMessage(`Restore complete. Safety backup: ${result.backup}`); imported(); } setPendingAction(null); setActionConfirmation(""); await loadBackups(); } catch (error) { reportError(error); } finally { setBackupWorking(false); } };
  const restoreUpload = async (event: React.FormEvent) => { event.preventDefault(); if (!uploadFile) return; setBackupWorking(true); try { const result = await api.restoreUploadedBackup(uploadFile, uploadConfirmation); setBackupMessage(`Restore complete. Safety backup: ${result.backup}`); setUploadFile(null); setUploadConfirmation(""); imported(); await loadBackups(); } catch (error) { reportError(error); } finally { setBackupWorking(false); } };
  const safetyToggle = <label className="safety-filter"><input type="checkbox" checked={showSafety} onChange={event => setShowSafety(event.target.checked)} />Show safety backups</label>;
  return <section className="page list-page"><h1>More</h1><div className="settings-group theme-settings"><h2>Appearance</h2><fieldset><legend>Theme</legend><label><input type="radio" name="theme" value="system" checked={theme === "system"} onChange={() => onThemeChange("system")} />System</label><label><input type="radio" name="theme" value="noir" checked={theme === "noir"} onChange={() => onThemeChange("noir")} />Noir Rain</label><label><input type="radio" name="theme" value="retro" checked={theme === "retro"} onChange={() => onThemeChange("retro")} />Pixel Sunset</label></fieldset><p className="settings-footnote">This selection is shared by every device. System follows each device’s current light or dark mode.</p></div><div className="settings-group"><h2>Data</h2><button className="disclosure-row" type="button" aria-expanded={backupOpen} aria-controls="backup-data-tools" onClick={() => setBackupOpen(value => !value)}><ChevronRight aria-hidden="true" />Backup and restore</button>{backupOpen && <div id="backup-data-tools" className="backup-tools primary-backup-tools"><button className="primary-settings-button" onClick={() => void createBackup()} disabled={backupWorking}>Create backup</button><div className="backup-list-head"><h3>Server backups</h3>{safetyToggle}</div><BackupRows items={backups} showSafety={showSafety} onDownload={item => void downloadBackup(item)} onRestore={item => { setPendingAction({ type: "restore", item }); setActionConfirmation(""); }} onDelete={item => { setPendingAction({ type: "delete", item }); setActionConfirmation(""); }} /><button className="disclosure-row nested" type="button" aria-expanded={uploadOpen} onClick={() => setUploadOpen(value => !value)}><ChevronRight aria-hidden="true" />More</button>{uploadOpen && <form className="import-card upload-restore" onSubmit={event => void restoreUpload(event)}><FileUp /><div><h3>Upload web backup</h3><p>Only marked web-habit-tracker backups are accepted.</p></div><label className="file-picker">{uploadFile?.name ?? "Choose backup file"}<input type="file" accept=".sqlite3,application/vnd.sqlite3" onChange={event => setUploadFile(event.target.files?.[0] ?? null)} /></label>{uploadFile && <label>Type <strong>RESTORE</strong> to continue<input value={uploadConfirmation} onChange={event => setUploadConfirmation(event.target.value)} autoCapitalize="characters" /></label>}<button className="danger-button" disabled={!uploadFile || uploadConfirmation !== "RESTORE" || backupWorking}>Restore database</button></form>}{backupMessage && <p className="success" role="status">{backupMessage}</p>}</div>}<button className="disclosure-row" type="button" aria-expanded={advancedOpen} aria-controls="advanced-data-tools" onClick={() => setAdvancedOpen(value => !value)}><ChevronRight aria-hidden="true" />Advanced</button>{advancedOpen && <div id="advanced-data-tools" className="advanced-settings-tools">{backupSettings && <form className="backup-settings" onSubmit={event => void saveSettings(event)}><h3>Backup scheduling</h3><div className="schedule-block"><label className="switch-label"><input type="checkbox" checked={backupSettings.dailyEnabled} onChange={event => setBackupSettings({ ...backupSettings, dailyEnabled: event.target.checked })} />Daily backups</label><label>Time<input type="time" value={backupSettings.dailyTime} onChange={event => setBackupSettings({ ...backupSettings, dailyTime: event.target.value })} /></label><label>Keep<input type="number" min="1" max="365" value={backupSettings.dailyRetention} onChange={event => setBackupSettings({ ...backupSettings, dailyRetention: Number(event.target.value) })} /></label></div><div className="schedule-block"><label className="switch-label"><input type="checkbox" checked={backupSettings.weeklyEnabled} onChange={event => setBackupSettings({ ...backupSettings, weeklyEnabled: event.target.checked })} />Weekly backups</label><label>Day<select value={backupSettings.weeklyDay} onChange={event => setBackupSettings({ ...backupSettings, weeklyDay: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label>Time<input type="time" value={backupSettings.weeklyTime} onChange={event => setBackupSettings({ ...backupSettings, weeklyTime: event.target.value })} /></label><label>Keep<input type="number" min="1" max="365" value={backupSettings.weeklyRetention} onChange={event => setBackupSettings({ ...backupSettings, weeklyRetention: Number(event.target.value) })} /></label></div><p className="settings-hint">Times use {config.timezone}. Missed schedules run once when the server returns.</p><button className="save-settings-button" disabled={backupWorking}><Save />Save settings</button></form>}<button className="disclosure-row nested" type="button" aria-expanded={legacyOpen} onClick={() => setLegacyOpen(value => !value)}><ChevronRight aria-hidden="true" />Import legacy database</button>{legacyOpen && <form className="import-card" onSubmit={event => void runImport(event)}><FileUp /><div><h3>Import legacy database</h3><p>This replaces all live data after validation. A timestamped safety backup is created first.</p></div><label className="file-picker">{file?.name ?? "Choose SQLite file"}<input type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>{file && <label>Type <strong>IMPORT</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" /></label>}<button className="danger-button" disabled={!file || confirmation !== "IMPORT" || working}>{working ? "Importing…" : "Replace database"}</button>{success && <p className="success" role="status">{success}</p>}</form>}</div>}</div>
    <div className="settings-group"><h2>Server time</h2><div className="info-row"><span>Timezone</span><strong>{config.timezone}</strong></div><div className="info-row"><span>Authoritative date</span><strong>{config.today}</strong></div><p className="settings-footnote">Read-only. The timezone comes from the server’s <code>TZ</code> setting; the authoritative date follows that timezone and the server clock.</p></div>
    <InstallAppPanel state={pwaInstall} />
    <div className="settings-group"><h2>Coming next</h2><div className="roadmap-row">Challenges</div><div className="roadmap-row">Configurable server timezone</div></div>
    {pendingAction && <Modal title={pendingAction.type === "restore" ? "Restore backup" : "Delete backup"} onClose={() => { setPendingAction(null); setActionConfirmation(""); }}><div className="confirmation-panel"><p>{pendingAction.type === "restore" ? "The current database will be replaced after validation. A safety backup is created first." : "This permanently deletes the selected backup."}</p><strong>{pendingAction.item.filename}</strong><label>Type <strong>{pendingAction.type === "restore" ? "RESTORE" : "DELETE"}</strong> to continue<input value={actionConfirmation} onChange={event => setActionConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label><button className="danger-button" disabled={actionConfirmation !== (pendingAction.type === "restore" ? "RESTORE" : "DELETE") || backupWorking} onClick={() => void runBackupAction()}>{pendingAction.type === "restore" ? "Restore database" : <><Trash2 />Delete backup</>}</button></div></Modal>}
  </section>;
}

const tabs: { id: Tab; label: string; Icon: typeof CircleCheck }[] = [
  { id: "today", label: "Today", Icon: CircleCheck },
  { id: "manage", label: "Archived cards", Icon: Archive }, { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "more", label: "More", Icon: CircleEllipsis },
];

export default function App() {
  const [notesHabitId, setNotesHabitId] = useState<number | null>(() => { const match = window.location.pathname.match(/^\/habits\/(\d+)\/notes$/); return match ? Number(match[1]) : null; });
  const initialHabit = window.location.pathname.match(/^\/habits\/(\d+)$/)?.[1];
  const initialNote = window.location.pathname.match(/^\/habits\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
  const initialTimedNote = window.location.pathname.match(/^\/timed-activities\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
  const initialTimedNotes = window.location.pathname.match(/^\/timed-activities\/(\d+)\/notes$/);
  const initialLogNote = window.location.pathname.match(/^\/activity-logs\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
  const [timedNotesId, setTimedNotesId] = useState<number | null>(initialTimedNotes ? Number(initialTimedNotes[1]) : null);
  const [config, setConfig] = useState<Config | null>(null); const [tab, setTab] = useState<Tab>("today"); const [selectedDate, setSelectedDate] = useState(""); const [refresh, setRefresh] = useState(0); const [notificationCount, setNotificationCount] = useState(0); const [notifications, setNotifications] = useState<{ items: Unresolved[]; systemItems: SystemNotification[] }>({ items: [], systemItems: [] }); const [error, setError] = useState(""); const [theme, setTheme] = useState<Theme>("system"); const [online, setOnline] = useState(() => navigator.onLine); const [detailHabitId, setDetailHabitId] = useState<number | null>(initialHabit ? Number(initialHabit) : null); const [detailTimedId, setDetailTimedId] = useState<number | null>(() => { const id = window.location.pathname.match(/^\/timed-activities\/(\d+)(?:\/notes)?$/)?.[1]; return id ? Number(id) : null; }); const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(initialNote ? { habitId: Number(initialNote[1]), habitName: "", date: initialNote[2], create: false } : initialTimedNote ? { habitId: Number(initialTimedNote[1]), habitName: "", date: initialTimedNote[2], create: false, kind: "timed" } : initialLogNote ? { habitId: Number(initialLogNote[1]), habitName: "", date: initialLogNote[2], create: false, kind: "log" } : null);
  const pwaInstall = usePwaInstall();
  useEffect(() => { document.documentElement.dataset.theme = theme === "system" ? "" : theme; }, [theme]);
  const reportError = useCallback((value: unknown) => {
    const message = value instanceof ApiError || value instanceof Error ? value.message : "Something went wrong.";
    setError(message); window.dispatchEvent(new CustomEvent("app-error", { detail: message }));
  }, []);
  const refreshNotifications = useCallback(async () => {
    const [items, systemItems] = await Promise.all([api.unresolved(), api.systemNotifications()]);
    setNotifications({ items, systemItems }); setNotificationCount(items.length + systemItems.length);
  }, []);
  const refreshAll = useCallback(() => { setRefresh(value => value + 1); void refreshNotifications().catch(reportError); }, [refreshNotifications, reportError]);
  const serverDay = useRef("");
  const syncing = useRef(false);
  const syncConfig = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const value = await api.config();
      const previous = serverDay.current;
      serverDay.current = value.today;
      const dayChanged = previous !== "" && value.today !== previous;
      setSelectedDate(selected => !selected || selected === previous ? value.today : selected);
      setConfig(value); setTheme(value.theme); setError(""); setOnline(true);
      if (dayChanged) refreshAll(); else void refreshNotifications().catch(reportError);
    } catch (error) { setOnline(false); reportError(error); }
    finally { syncing.current = false; }
  }, [refreshAll, refreshNotifications, reportError]);
  useEffect(() => {
    const resume = () => { if (document.visibilityState !== "hidden") void syncConfig(); };
    resume();
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = window.setInterval(resume, 30_000);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", resume); };
  }, [syncConfig]);
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, []);
  const changeTheme = useCallback(async (nextTheme: Theme) => {
    const previousTheme = theme;
    setTheme(nextTheme);
    try { setTheme((await api.saveTheme(nextTheme)).theme); }
    catch (error) { setTheme(previousTheme); reportError(error); }
  }, [theme, reportError]);
  useEffect(() => {
    const handlePop = () => {
      if (!allowHistoryNavigation()) return;
      const path = window.location.pathname;
      const notesMatch = path.match(/^\/habits\/(\d+)\/notes$/);
      const timedNotesMatch = path.match(/^\/timed-activities\/(\d+)\/notes$/);
      const timedMatch = path.match(/^\/timed-activities\/(\d+)(?:\/notes)?$/);
      const habitMatch = path.match(/^\/habits\/(\d+)$/);
      const noteMatch = path.match(/^\/habits\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
      const timedNoteMatch = path.match(/^\/timed-activities\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
      const logNoteMatch = path.match(/^\/activity-logs\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
      setNotesHabitId(notesMatch ? Number(notesMatch[1]) : null);
      setTimedNotesId(timedNotesMatch ? Number(timedNotesMatch[1]) : null);
      setDetailTimedId(timedMatch ? Number(timedMatch[1]) : null);
      setDetailHabitId(habitMatch ? Number(habitMatch[1]) : null);
      setNoteTarget(noteMatch ? (window.history.state?.noteTarget ?? { habitId: Number(noteMatch[1]), habitName: "", date: noteMatch[2], create: false }) : timedNoteMatch ? (window.history.state?.noteTarget ?? { habitId: Number(timedNoteMatch[1]), habitName: "", date: timedNoteMatch[2], create: false, kind: "timed" }) : logNoteMatch ? (window.history.state?.noteTarget ?? { habitId: Number(logNoteMatch[1]), habitName: "", date: logNoteMatch[2], create: false, kind: "log" }) : null);
    };
    window.addEventListener("popstate", handlePop); return () => window.removeEventListener("popstate", handlePop);
  }, []);
  const detailOpen = notesHabitId !== null || detailHabitId !== null || detailTimedId !== null || timedNotesId !== null || noteTarget !== null;
  useEffect(() => {
    if (!detailOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    const viewport = window.visualViewport;
    const resize = () => {
      document.documentElement.style.setProperty("--detail-height", `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty("--detail-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize);
    const frame = window.requestAnimationFrame(() => {
      const panels = document.querySelectorAll<HTMLElement>(".habit-detail-view");
      const panel = panels[panels.length - 1];
      if (panel && !panel.contains(document.activeElement)) (panel.querySelector<HTMLElement>("textarea, input") ?? panel.querySelector<HTMLElement>("button"))?.focus();
    });
    return () => { viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); window.cancelAnimationFrame(frame); unlock(); if (trigger?.isConnected) trigger.focus(); };
  }, [detailOpen, detailHabitId, detailTimedId, timedNotesId, noteTarget, notesHabitId]);
  if (!config || !selectedDate) return <main className="startup"><img src="/app-icon.png" alt="" /><h1>Habit Tracker</h1><p role="status">{!online ? "You’re offline. Reconnect to the server, then retry." : error || "Opening your habits…"}</p>{(error || !online) && <button className="form-submit" onClick={() => void syncConfig()}>Retry</button>}</main>;
  const openTimed = (id: number) => { window.history.pushState({ timedId: id }, "", `/timed-activities/${id}`); setDetailTimedId(id); };
  const closeTimed = () => { if (window.history.state?.timedId) closeHistoryRoute(); else { window.history.replaceState(null, "", "/"); setDetailTimedId(null); } };
  const openTimedNotes = (id: number) => { window.history.pushState({ ...window.history.state, timedNotesId: id }, "", `/timed-activities/${id}/notes`); setTimedNotesId(id); };
  const closeTimedNotes = () => { if (window.history.state?.timedNotesId) { if (window.history.state?.sheet) window.history.back(); else closeHistoryRoute(); } else { window.history.replaceState(null, "", `/timed-activities/${timedNotesId}`); setDetailTimedId(timedNotesId); setTimedNotesId(null); } };
  const openDate = (date: string) => { setSelectedDate(date); setTab("today"); };
  const openHabitNotes = (id: number) => { window.history.pushState({ notesHabitId: id }, "", `/habits/${id}/notes`); setNotesHabitId(id); };
  const closeHabitNotes = () => {
    if (window.history.state?.notesHabitId) closeHistoryRoute();
    else { window.history.replaceState(null, "", `/habits/${notesHabitId}`); setDetailHabitId(notesHabitId); setNotesHabitId(null); }
  };
  const openHabit = (id: number) => { window.history.pushState({ habitId: id }, "", `/habits/${id}`); setDetailHabitId(id); };
  const closeHabit = () => { if (window.history.state?.habitId) closeHistoryRoute(); else { window.history.replaceState(null, "", "/"); setDetailHabitId(null); } };
  const openNote = (target: NoteTarget) => { const path = target.kind === "timed" ? `/timed-activities/${target.habitId}/notes/${target.date}` : target.kind === "log" ? `/activity-logs/${target.habitId}/notes/${target.date}` : `/habits/${target.habitId}/notes/${target.date}`; window.history.pushState({ ...window.history.state, noteTarget: target }, "", path); setNoteTarget(target); };
  const closeNote = () => { if (window.history.state?.noteTarget) { if (noteTarget?.kind === "timed" && window.history.state?.timedNotesId && window.history.state?.sheet) window.history.back(); else closeHistoryRoute(); } else { window.history.replaceState(null, "", "/"); setNoteTarget(null); } };
  return <div className="app-shell">
    <main className="content" inert={detailOpen} aria-hidden={detailOpen || undefined}>
      {tab === "today" && <TodayPage config={config} selectedDate={selectedDate} refresh={refresh} onDate={setSelectedDate} onDataChange={refreshAll} reportError={reportError} openHabit={openHabit} openTimed={openTimed} openNote={openNote} openTimedNotes={openTimedNotes} noteOpen={noteTarget !== null} />}
      {tab === "manage" && <ManagementPage refresh={refresh} openHabit={openHabit} openTimed={openTimed} reportError={reportError} />}
      {tab === "notifications" && <NotificationsPage items={notifications.items} systemItems={notifications.systemItems} reportError={reportError} openDate={openDate} onDataChange={refreshAll} />}
      {tab === "more" && <MorePage config={config} reportError={reportError} imported={() => { void syncConfig(); }} theme={theme} onThemeChange={nextTheme => { void changeTheme(nextTheme); }} pwaInstall={pwaInstall} />}
    </main>
    <nav className="tab-bar" inert={detailOpen} aria-hidden={detailOpen || undefined} aria-label="Main navigation">{tabs.map(({ id, label, Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} title={label} aria-label={id === "notifications" && notificationCount > 0 ? `${label}, ${notificationCount} unresolved dates` : label} aria-current={tab === id ? "page" : undefined}><span className="tab-icon"><Icon />{id === "notifications" && notificationCount > 0 ? <i aria-hidden="true">{notificationCount}</i> : null}</span></button>)}</nav>
    {error && <div className="error-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X /></button></div>}
    {!online && <div className="offline-alert" role="status">Offline — reconnect to the server to refresh or save changes.</div>}
    {detailHabitId !== null && <div inert={noteTarget !== null || notesHabitId !== null} aria-hidden={noteTarget !== null || notesHabitId !== null || undefined}><HabitDetailView refresh={refresh} habitId={detailHabitId} today={config.today} openNotes={() => openHabitNotes(detailHabitId)} onClose={closeHabit} onNavigateToDate={date => { openDate(date); closeHabit(); }} onChanged={refreshAll} onDeleted={closeHabit} reportError={reportError} openNote={openNote} /></div>}
    {detailTimedId !== null && <div inert={noteTarget !== null}><TimedManagementDetail activityId={detailTimedId} onClose={closeTimed} onChanged={refreshAll} reportError={reportError} openNotes={() => openTimedNotes(detailTimedId)} /></div>}
    {notesHabitId !== null && <div inert={noteTarget !== null} aria-hidden={noteTarget !== null || undefined}><HabitNotesView key={notesHabitId} habitId={notesHabitId} today={config.today} refresh={refresh} active={noteTarget === null} onClose={closeHabitNotes} openNote={(date, create) => openNote({ habitId: notesHabitId, habitName: "", date, create })} /></div>}
    {timedNotesId !== null && <div inert={noteTarget !== null} aria-hidden={noteTarget !== null || undefined}><TimedActivityNotesView key={timedNotesId} activityId={timedNotesId} today={config.today} refresh={refresh} active={noteTarget === null} portalIntoDialog={tab === "today"} onClose={closeTimedNotes} openNote={(date, create, activityName) => openNote({ habitId: timedNotesId, habitName: activityName, date, create, kind: "timed" })} reportError={reportError} /></div>}
    {noteTarget && (() => { const view = <NoteDetailView key={`${noteTarget.kind ?? "daily"}:${noteTarget.habitId}:${noteTarget.date}`} target={noteTarget} onClose={closeNote} onChanged={refreshAll} reportError={reportError} />; const dialog = noteTarget.kind === "timed" && tab === "today" ? document.querySelector<HTMLDialogElement>("dialog[open]") : null; return dialog ? createPortal(<div className="note-detail-portal">{view}</div>, dialog) : view; })()}
  </div>;
}
