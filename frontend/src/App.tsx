import {
  Bell, BellOff, ChartNoAxesCombined, ChevronLeft, ChevronRight,
  CircleCheck, CircleEllipsis, Clock3, Download, FileUp, Flame, MoreHorizontal, NotebookPen, Pencil, Plus, Save, Settings2, StickyNote, Trash2, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { allowHistoryNavigation, closeHistoryRoute, registerLeaveGuard } from "./lib/navigation";
import { lockScroll } from "./hooks/scrollLock";
import Calendar from "./components/Calendar";
import Modal from "./components/Modal";
import { api, ApiError } from "./lib/api";
import type { ActivityLogDay, ActivityLogMonth, ActivityLogNote, ActivityLogSummary, ArchivePeriod, BackupFile, BackupSettings, Config, HabitDay, HabitDetail, HabitNote, HabitSummary, NoteDetail, NoteSummary, Statistic, Status, SystemNotification, TimedActivityDay, TimedActivityNote, TimedActivitySummary, TimedActivityWeek, TimedEntry, Unresolved } from "./lib/types";

type Tab = "today" | "stats" | "notes" | "manage" | "notifications" | "more";
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
const timedSectionPreference = () => {
  try { return typeof window.localStorage?.getItem === "function" ? window.localStorage.getItem("timed-activities-open") !== "false" : true; } catch { return true; }
};
const saveTimedSectionPreference = (open: boolean) => { try { window.localStorage?.setItem?.("timed-activities-open", String(open)); } catch { /* preference storage is optional */ } };
const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60); const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
};
const durationTotal = (hours: string, minutes: string) => (Number(hours) || 0) * 60 + (Number(minutes) || 0);
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

function TodayPage({ config, selectedDate, refresh, onDate, onDataChange, reportError, openHabit, openNote }: {
  config: Config; selectedDate: string; onDate: (date: string) => void;
  refresh: number;
  onDataChange: () => void; reportError: (error: unknown) => void; openHabit: (id: number) => void; openNote: (target: NoteTarget) => void;
}) {
  const [habits, setHabits] = useState<HabitDay[]>([]);
  const [timed, setTimed] = useState<TimedActivityDay[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedDate, setLoadedDate] = useState("");
  const [loadError, setLoadError] = useState(false);
  const read = useRef<AbortController | null>(null);
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
  const load = useCallback(async () => {
    read.current?.abort();
    const controller = new AbortController(); read.current = controller;
    setLoading(true); setLoadError(false);
    try {
      const [daily, activities, logs] = await Promise.all([api.habits(selectedDate, controller.signal), api.timedActivities(selectedDate, controller.signal), api.activityLogs(selectedDate, controller.signal)]);
      if (!controller.signal.aborted) { setHabits(daily); setTimed(activities); setActivityLogs(logs); setLoadedDate(selectedDate); }
    } catch (error) { if (!controller.signal.aborted) { setLoadError(true); reportError(error); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [selectedDate, reportError]);
  useEffect(() => { void load(); return () => read.current?.abort(); }, [load, refresh]);
  useEffect(() => { const refreshNotes = () => { void load(); }; window.addEventListener("note-changed", refreshNotes); return () => window.removeEventListener("note-changed", refreshNotes); }, [load]);
  const isRelativeDay = selectedDate === config.today || selectedDate === shiftDay(config.today, -1) || selectedDate === shiftDay(config.today, 1);
  const title = selectedDate === config.today ? "Today" : selectedDate === shiftDay(config.today, -1) ? "Yesterday" : selectedDate === shiftDay(config.today, 1) ? "Tomorrow" : prettyDate(selectedDate);
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
      <button className="day-title" onClick={() => setCalendar(true)}><h1>{title}</h1>{isRelativeDay && <small>{selectedDate}</small>}</button>
      <button className="icon-button accent" onClick={() => onDate(shiftDay(selectedDate, 1))} aria-label="Next day"><ChevronRight /></button>
    </header>
    <div className="primary-action"><button className="add-button" onClick={() => setAdding(true)} aria-label="Add habit"><Plus /></button></div>
    {loadError ? <div className="loading" role="status">Could not load this day.<button className="small-button" onClick={() => void load()}>Retry</button></div> : loading || loadedDate !== selectedDate ? <div className="loading" role="status">Loading habits…</div> : <>
    <section className="timed-section daily-section">
      <button className="timed-section-head disclosure-row" type="button" aria-expanded={dailyOpen} aria-controls="daily-habit-list" onClick={() => { const next = !dailyOpen; setDailyOpen(next); try { window.localStorage?.setItem?.("daily-habits-open", String(next)); } catch { /* optional preference */ } }}><ChevronRight aria-hidden="true" /><span><strong>Daily habits</strong><small>Complete once each day</small></span></button>
      {dailyOpen && <div id="daily-habit-list">{habits.length === 0 ? <p className="timed-empty">No daily habits on this date.</p> : <div className="habit-list timed-list">{habits.map(habit => <article className="habit-card" key={habit.id} aria-busy={pendingWrites.has(`${selectedDate}:${habit.id}`)}>
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
      <button className="timed-section-head disclosure-row" type="button" aria-expanded={timedOpen} aria-controls="timed-activity-list" onClick={() => { const next = !timedOpen; setTimedOpen(next); saveTimedSectionPreference(next); }}><ChevronRight aria-hidden="true" /><span><strong>Timed activities</strong><small>Optional time tracking</small></span></button>
      {timedOpen && <div id="timed-activity-list">{timed.length === 0 ? <p className="timed-empty">No timed activities on this date.</p> : <div className="habit-list timed-list">{timed.map(activity => <article className="habit-card timed-card" key={activity.id}><button className="timed-card-open" onClick={() => setTimedDetail({ ...activity, date: selectedDate })} aria-label={`Open ${activity.name}`}><span><strong>{activity.name}</strong><small className="timed-day-total"><Clock3 aria-hidden="true" />{formatMinutes(activity.dayMinutes)}</small></span><ChevronRight aria-hidden="true" /></button><button className={`note-button ${activity.hasNote ? "has-note" : ""}`} onClick={() => openNote({ habitId: activity.id, habitName: activity.name, date: selectedDate, create: !activity.hasNote, kind: "timed" })} aria-label={`${activity.hasNote ? "View" : "Add"} note for ${activity.name}`}><StickyNote /></button></article>)}</div>}</div>}
    </section>}
    {!loading && !loadError && loadedDate === selectedDate && <section className="timed-section activity-log-section">
      <button className="timed-section-head disclosure-row" type="button" aria-expanded={activityLogsOpen} aria-controls="activity-log-list" onClick={() => { const next = !activityLogsOpen; setActivityLogsOpen(next); try { window.localStorage?.setItem?.("activity-logs-open", String(next)); } catch { /* optional preference */ } }}><ChevronRight aria-hidden="true" /><span><strong>Activity log</strong><small>Record activities without schedules</small></span></button>
      {activityLogsOpen && <div id="activity-log-list">{activityLogs.length === 0 ? <p className="timed-empty">No activity log items on this date.</p> : <div className="habit-list timed-list">{activityLogs.map(activity => <article className="habit-card timed-card activity-log-card" key={activity.id} aria-busy={activityLogWrites.has(activity.id)}><button className="timed-card-open" onClick={() => setActivityLogDetail(activity)} aria-label={`Open ${activity.name}`}><span><strong>{activity.name}</strong><small>{relativeCompletion(activity.lastCompletedDate, config.today)}</small></span><ChevronRight aria-hidden="true" /></button><div className="activity-log-card-actions"><button className={`status-button done ${activity.completed ? "active" : ""}`} disabled={activityLogWrites.has(activity.id)} onClick={() => void toggleActivityLogCompletion(activity)} aria-pressed={activity.completed} aria-label={`${activity.completed ? "Mark" : "Mark"} ${activity.name} ${activity.completed ? "not done" : "done"}`}>Done</button><button className={`note-button ${activity.hasNote ? "has-note" : ""}`} onClick={() => openNote({ habitId: activity.id, habitName: activity.name, date: selectedDate, create: !activity.hasNote, kind: "log" })} aria-label={`${activity.hasNote ? "View" : "Add"} note for ${activity.name}`}><StickyNote /></button></div></article>)}</div>}</div>}
    </section>}
    {calendar && <Modal title="Calendar" wide onClose={() => setCalendar(false)}><Calendar selected={selectedDate} today={config.today} onSelect={date => { onDate(date); setCalendar(false); }} /></Modal>}
    {adding && <AddHabit defaultDate={selectedDate} onClose={() => setAdding(false)} onSave={async (name, startDate, kind) => {
      try { if (kind === "timed") await api.createTimedActivity(name, startDate); else if (kind === "log") await api.createActivityLog(name, startDate); else await api.createHabit(name, startDate); setAdding(false); await load(); onDataChange(); } catch (error) { reportError(error); }
    }} />}
    {timedDetail && <TimedActivityDetail activity={timedDetail} selectedDate={timedDetail.date} today={config.today} onClose={() => setTimedDetail(null)} onChanged={async () => { await load(); onDataChange(); }} reportError={reportError} />}
    {activityLogDetail && <ActivityLogDetail activity={activityLogDetail} selectedDate={selectedDate} today={config.today} onClose={() => setActivityLogDetail(null)} onChanged={async () => { await load(); onDataChange(); }} openNote={openNote} reportError={reportError} />}
  </section>;
}

function TimedEntryRow({ activityId, entry, onChanged, reportError }: { activityId: number; entry: TimedEntry; onChanged: () => Promise<void>; reportError: (error: unknown) => void }) {
  const [editing, setEditing] = useState(false); const [hours, setHours] = useState(String(Math.floor(entry.minutes / 60))); const [minutes, setMinutes] = useState(String(entry.minutes % 60));
  const total = durationTotal(hours, minutes);
  const normalize = () => { const value = normalizeDuration(hours, minutes); setHours(value.hours); setMinutes(value.minutes); };
  const save = async () => { try { await api.updateTimedEntry(activityId, entry.id, total); setEditing(false); await onChanged(); } catch (error) { reportError(error); } };
  const remove = async () => { try { await api.deleteTimedEntry(activityId, entry.id); await onChanged(); } catch (error) { reportError(error); } };
  return <div className="timed-entry-row">{editing ? <>
    <DurationFields hours={hours} minutes={minutes} onHoursChange={setHours} onMinutesChange={setMinutes} onNormalize={normalize} />
    <div className="timed-entry-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button type="button" className="save" disabled={total < 1 || total > 1440} onClick={() => void save()}>Save</button></div>
  </> : <><strong>{formatMinutes(entry.minutes)}</strong><div className="timed-entry-actions"><button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${formatMinutes(entry.minutes)} entry`}><Pencil /></button><button type="button" className="destructive-text" onClick={() => void remove()} aria-label={`Delete ${formatMinutes(entry.minutes)} entry`}><Trash2 /></button></div></>}</div>;
}

function TimedActivityDetail({ activity, selectedDate, today, onClose, onChanged, reportError }: { activity: TimedActivityDay; selectedDate: string; today: string; onClose: () => void; onChanged: () => Promise<void>; reportError: (error: unknown) => void }) {
  const [week, setWeek] = useState<TimedActivityWeek | null>(null); const [hours, setHours] = useState(""); const [minutes, setMinutes] = useState(""); const [saving, setSaving] = useState(false); const [menu, setMenu] = useState(false); const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [activityName, setActivityName] = useState(activity.name); const [editingName, setEditingName] = useState(false); const [nameDraft, setNameDraft] = useState(activity.name);
  const loadWeek = useCallback(async () => { try { setWeek(await api.timedWeek(activity.id, selectedDate)); } catch (error) { reportError(error); } }, [activity.id, selectedDate, reportError]);
  useEffect(() => { void loadWeek(); }, [loadWeek]);
  const selected = week?.days.find(day => day.date === selectedDate); const total = durationTotal(hours, minutes); const editable = selectedDate <= today && Boolean(selected?.active);
  const refresh = async () => { await loadWeek(); await onChanged(); };
  const normalize = () => { const value = normalizeDuration(hours, minutes); setHours(value.hours); setMinutes(value.minutes); };
  const add = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); try { await api.addTimedEntry(activity.id, selectedDate, total); setHours(""); setMinutes(""); await refresh(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  const rename = async () => { setSaving(true); try { const value = await api.renameTimedActivity(activity.id, nameDraft); setActivityName(value.name); setNameDraft(value.name); setEditingName(false); void onChanged(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  const manage = async () => { if (!action) return; setSaving(true); try { if (action === "archive") await api.archiveTimedActivity(activity.id); else if (action === "restore") await api.restoreTimedActivity(activity.id); else await api.deleteTimedActivity(activity.id, confirmation); await onChanged(); onClose(); } catch (error) { reportError(error); } finally { setSaving(false); } };
  return <Modal title={activityName} titleDetail={<span className="timed-title-total">(<Clock3 aria-hidden="true" />{formatMinutes(selected?.minutes ?? activity.dayMinutes)})</span>} wide onClose={onClose} actions={editingName ? <div className="inline-edit-actions"><button className="bar-text-button" onClick={() => { setNameDraft(activityName); setEditingName(false); }}>Cancel</button><button className="bar-text-button save" disabled={!nameDraft.trim() || saving} onClick={() => void rename()}>Save</button></div> : <><button className="icon-button" onClick={() => setEditingName(true)} aria-label="Edit timed activity"><Pencil /></button><div className="menu-anchor"><button className="icon-button" onClick={() => setMenu(value => !value)} aria-label="More timed activity options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu">{activity.archived ? <button role="menuitem" onClick={() => { setAction("restore"); setMenu(false); }}>Restore</button> : <button role="menuitem" onClick={() => { setAction("archive"); setMenu(false); }}>Archive</button>}<button className="destructive-text" role="menuitem" onClick={() => { setAction("delete"); setMenu(false); }}>Delete</button></div></>}</div></>}><div className="timed-detail">
    {editingName && <label className="timed-name-editor">Activity name<input autoFocus maxLength={200} value={nameDraft} onChange={event => setNameDraft(event.target.value)} /></label>}
    <section>{editable && <form className="duration-form" onSubmit={event => void add(event)}><DurationFields hours={hours} minutes={minutes} onHoursChange={setHours} onMinutesChange={setMinutes} onNormalize={normalize} /><button className="form-submit" disabled={saving || total < 1 || total > 1440}>Add entry</button></form>}
      <h3>Entries</h3>{selected?.entries.length ? <div className="timed-entries">{selected.entries.map(entry => <TimedEntryRow key={entry.id} activityId={activity.id} entry={entry} onChanged={refresh} reportError={reportError} />)}</div> : <p className="secondary">No time logged. This day remains at zero.</p>}
    </section>
  </div>{action && <Modal title={action === "archive" ? "Archive timed activity" : action === "restore" ? "Restore timed activity" : "Delete timed activity"} onClose={() => { setAction(null); setConfirmation(""); }}><div className="confirmation-panel">{action === "archive" ? <p>This activity will remain editable through today. Its sessions and notes will be preserved.</p> : action === "restore" ? <p>This activity returns to tracking today. The inactive gap remains unavailable.</p> : <><p>This permanently deletes the activity, all duration entries, notes, and archive history. A safety backup is created first.</p><label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label></>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={saving || (action === "delete" && confirmation !== "DELETE")} onClick={() => void manage()}>{saving ? "Working…" : action === "archive" ? "Archive activity" : action === "restore" ? "Restore activity" : "Delete permanently"}</button></div></Modal>}</Modal>;
}

function ActivityLogDetail({ activity, selectedDate, today, onClose, onChanged, openNote, reportError }: { activity: ActivityLogDay; selectedDate: string; today: string; onClose: () => void; onChanged: () => Promise<void>; openNote: (target: NoteTarget) => void; reportError: (error: unknown) => void }) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7)); const [data, setData] = useState<ActivityLogMonth | null>(null); const [chosen, setChosen] = useState(selectedDate); const [working, setWorking] = useState(false); const [menu, setMenu] = useState(false); const [action, setAction] = useState<"archive" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [activityName, setActivityName] = useState(activity.name); const [editingName, setEditingName] = useState(false); const [nameDraft, setNameDraft] = useState(activity.name);
  const load = useCallback(() => { void api.activityLogMonth(activity.id, month).then(setData).catch(reportError); }, [activity.id, month, reportError]);
  useEffect(() => { load(); }, [load]);
  const first = parseDay(`${month}-01`); const leading = (first.getUTCDay() + 6) % 7;
  const shift = (offset: number) => { const value = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1, 12)); setMonth(dayISO(value).slice(0, 7)); };
  const selected = data?.days.find(day => day.date === chosen);
  const rename = async () => { setWorking(true); try { const value = await api.renameActivityLog(activity.id, nameDraft); setActivityName(value.name); setNameDraft(value.name); setEditingName(false); await onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  const manage = async () => { if (!action) return; setWorking(true); try { if (action === "archive") await api.archiveActivityLog(activity.id); else await api.deleteActivityLog(activity.id, confirmation); await onChanged(); onClose(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  return <Modal title={activityName} wide onClose={onClose} actions={editingName ? <div className="inline-edit-actions"><button className="bar-text-button" onClick={() => { setNameDraft(activityName); setEditingName(false); }}>Cancel</button><button className="bar-text-button save" disabled={!nameDraft.trim() || working} onClick={() => void rename()}>Save</button></div> : <><button className="icon-button" onClick={() => setEditingName(true)} aria-label="Edit activity log"><Pencil /></button><div className="menu-anchor"><button className="icon-button" onClick={() => setMenu(value => !value)} aria-label="More activity log options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu"><button role="menuitem" onClick={() => { setAction("archive"); setMenu(false); }}>Archive</button><button className="destructive-text" role="menuitem" onClick={() => { setAction("delete"); setMenu(false); }}>Delete</button></div></>}</div></>}><div className="activity-log-detail">{editingName && <label className="timed-name-editor">Activity name<input autoFocus maxLength={200} value={nameDraft} onChange={event => setNameDraft(event.target.value)} /></label>}<p className="secondary">{relativeCompletion(activity.lastCompletedDate, today)}</p><div className="calendar"><div className="calendar-head"><button className="icon-button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></button><strong>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</strong><button className="icon-button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></button></div><div className="calendar-grid weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid days">{Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}{data?.days.map(day => <button key={day.date} className={`calendar-day activity-log-day ${day.date === chosen ? "selected" : ""} ${day.completed ? "completed" : ""} ${day.hasNote ? "has-note" : ""}`} disabled={!day.active || day.date > today} onClick={() => setChosen(day.date)} aria-label={`${day.date}${day.completed ? ", completed" : ""}${day.hasNote ? ", has note" : ""}`}><span>{Number(day.date.slice(-2))}</span><span className="markers" aria-hidden="true">{day.completed && <i className="done-dot" />}{day.hasNote && <i className="note-dot" />}</span></button>)}</div></div><section className="activity-log-actions"><strong>{prettyDate(chosen)}</strong><button className="small-button" disabled={!selected?.active || chosen > today} onClick={() => openNote({ habitId: activity.id, habitName: activityName, date: chosen, create: !selected?.hasNote, kind: "log" })}>{selected?.hasNote ? "View note" : "Add note"}</button></section></div>{action && <Modal title={action === "archive" ? "Archive activity log" : "Delete activity log"} onClose={() => { setAction(null); setConfirmation(""); }}><div className="confirmation-panel">{action === "archive" ? <p>This activity remains editable through today. Its completion history and notes are preserved.</p> : <><p>This permanently deletes the activity, its completion history, notes, and archive history. A safety backup is created first.</p><label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label></>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={working || (action === "delete" && confirmation !== "DELETE")} onClick={() => void manage()}>{working ? "Working…" : action === "archive" ? "Archive activity" : "Delete permanently"}</button></div></Modal>}</Modal>;
}

function AddHabit({ defaultDate, onClose, onSave }: { defaultDate: string; onClose: () => void; onSave: (name: string, date: string, kind: "daily" | "timed" | "log") => Promise<void> }) {
  const [name, setName] = useState(""); const [date, setDate] = useState(defaultDate); const [kind, setKind] = useState<"daily" | "timed" | "log">("daily"); const [saving, setSaving] = useState(false);
  return <Modal title="New activity" onClose={onClose}><form className="form" onSubmit={event => { event.preventDefault(); setSaving(true); void onSave(name, date, kind).finally(() => setSaving(false)); }}>
    <fieldset className="activity-type-picker"><legend>Type</legend><div className="activity-type-options">
      <label className={kind === "daily" ? "selected" : ""}><input type="radio" name="activity-type" value="daily" checked={kind === "daily"} onChange={() => setKind("daily")} /><span>Daily habit</span></label>
      <label className={kind === "timed" ? "selected" : ""}><input type="radio" name="activity-type" value="timed" checked={kind === "timed"} onChange={() => setKind("timed")} /><span>Timed activity</span></label>
      <label className={kind === "log" ? "selected" : ""}><input type="radio" name="activity-type" value="log" checked={kind === "log"} onChange={() => setKind("log")} /><span>Activity log</span></label>
    </div></fieldset>
    <label>{kind === "daily" ? "Habit name" : "Activity name"}<input autoFocus value={name} maxLength={200} onChange={event => setName(event.target.value)} placeholder={kind === "log" ? "Change vase water, clean filter…" : kind === "timed" ? "Study, read, exercise…" : "Read, walk, meditate…"} /></label>
    <label>Start date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <button className="form-submit" disabled={!name.trim() || saving}>{saving ? "Adding…" : kind === "timed" ? "Add timed activity" : kind === "log" ? "Add activity log" : "Add habit"}</button>
  </form></Modal>;
}

function StatsPage({ refresh, selectedDate, today, onDate, reportError }: { refresh: number; selectedDate: string; today: string; onDate: (date: string) => void; reportError: (error: unknown) => void }) {
  const [items, setItems] = useState<Statistic[]>([]); const [timed, setTimed] = useState<TimedActivityDay[]>([]); const [selected, setSelected] = useState<Statistic | null>(null); const [selectedTimed, setSelectedTimed] = useState<TimedActivityDay | null>(null);
  useEffect(() => { let active = true; void Promise.all([api.statistics(), api.timedActivities(selectedDate)]).then(([daily, timedItems]) => { if (active) { setItems(daily); setTimed(timedItems); } }).catch(error => { if (active) reportError(error); }); return () => { active = false; }; }, [refresh, selectedDate, reportError]);
  return <section className="page list-page"><h1>Stats</h1><div className="notes-group"><h2>Daily habits</h2>{items.length === 0 ? <p className="management-empty">No daily habit statistics.</p> : <div className="inset-list">{items.map(item => <button className="list-row" key={item.id} onClick={() => setSelected(item)}><span><strong>{item.name}</strong><small>Current streak: {item.currentStreak} · Notes: {item.noteCount}</small></span><ChevronRight /></button>)}</div>}</div>
    <div className="notes-group timed-stats-group"><h2>Timed activities</h2>{timed.length === 0 ? <p className="management-empty">No timed activity statistics for this date.</p> : <div className="inset-list">{timed.map(item => <button className="list-row" key={item.id} onClick={() => setSelectedTimed(item)}><span><strong>{item.name}</strong><small>{prettyDate(selectedDate)}: {formatMinutes(item.dayMinutes)} · Week through day: {formatMinutes(item.weekMinutes)}</small></span><ChevronRight /></button>)}</div>}</div>
    {selected && <Modal title={selected.name} onClose={() => setSelected(null)}><div className="stat-grid"><span>Current streak<strong>{selected.currentStreak}</strong></span><span>Longest streak<strong>{selected.longestStreak?.length ?? 0}</strong></span><span>Notes<strong>{selected.noteCount}</strong></span></div><h3>Streak history</h3>{selected.streaks.length ? <div className="streak-list">{selected.streaks.map(streak => <div key={`${streak.startDate}-${streak.endDate}`}><strong>{streak.length} days</strong><span>{prettyDate(streak.startDate)} – {prettyDate(streak.endDate)}</span></div>)}</div> : <p className="secondary">No completed streaks yet.</p>}</Modal>}
    {selectedTimed && <TimedStatsDetail activity={selectedTimed} selectedDate={selectedDate} today={today} onDate={onDate} onClose={() => setSelectedTimed(null)} reportError={reportError} />}
  </section>;
}

function TimedStatsDetail({ activity, selectedDate, today, onDate, onClose, reportError }: { activity: TimedActivityDay; selectedDate: string; today: string; onDate: (date: string) => void; onClose: () => void; reportError: (error: unknown) => void }) {
  const [week, setWeek] = useState<TimedActivityWeek | null>(null);
  useEffect(() => { let active = true; setWeek(null); void api.timedWeek(activity.id, selectedDate).then(value => { if (active) setWeek(value); }).catch(error => { if (active) reportError(error); }); return () => { active = false; }; }, [activity.id, selectedDate, reportError]);
  const selected = week?.days.find(day => day.date === selectedDate);
  return <Modal title={activity.name} wide onClose={onClose}><div className="timed-detail"><section><h3>Weekly statistics</h3><div className="timed-week" aria-label="Week history">{week?.days.map(day => <button type="button" key={day.date} disabled={day.date > today || !day.active} className={day.date === selectedDate ? "selected" : ""} onClick={() => onDate(day.date)}><span>{parseDay(day.date).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span><strong>{formatMinutes(day.minutes)}</strong></button>)}</div><div className="timed-selected-head"><div><span>{prettyDate(selectedDate)}</span><strong>{formatMinutes(selected?.minutes ?? 0)}</strong></div><div><span>Week through this day</span><strong>{formatMinutes(week?.days.filter(day => day.date <= selectedDate).reduce((sum, day) => sum + day.minutes, 0) ?? 0)}</strong></div></div></section></div></Modal>;
}

function NotesPage({ refresh, reportError, openNote, noteOpen }: { refresh: number; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void; noteOpen: boolean }) {
  const [summaries, setSummaries] = useState<NoteSummary[]>([]); const [timed, setTimed] = useState<TimedActivitySummary[]>([]); const [logs, setLogs] = useState<ActivityLogSummary[]>([]); const [showArchived, setShowArchived] = useState(false); const [selected, setSelected] = useState<NoteSummary | null>(null); const [selectedTimed, setSelectedTimed] = useState<TimedActivitySummary | null>(null); const [selectedLog, setSelectedLog] = useState<ActivityLogSummary | null>(null); const [dailyOpen, setDailyOpen] = useState(() => { try { return window.localStorage?.getItem?.("notes-daily-open") !== "false"; } catch { return true; } }); const [timedOpen, setTimedOpen] = useState(() => { try { return window.localStorage?.getItem?.("notes-timed-open") === "true"; } catch { return false; } }); const [logsOpen, setLogsOpen] = useState(false);
  const load = useCallback(() => Promise.all([api.noteSummaries(), api.timedNoteSummaries(), api.activityLogSummaries()]).then(([daily, timedItems, logItems]) => { setSummaries(daily); setTimed(timedItems); setLogs(logItems); }).catch(reportError), [reportError]);
  useEffect(() => { void load(); }, [refresh, load]);
  const visible = summaries.filter(item => !item.archived || showArchived);
  const visibleTimed = timed.filter(item => !item.archived || showArchived);
  const visibleLogs = logs.filter(item => !item.archived || showArchived);
  const toggleNotes = (kind: "daily" | "timed", open: boolean) => { if (kind === "daily") setDailyOpen(open); else setTimedOpen(open); try { window.localStorage?.setItem?.(`notes-${kind}-open`, String(open)); } catch { /* optional preference */ } };
  return <section className="page list-page"><h1>Notes</h1><div className="settings-group notes-category-group"><button className="disclosure-row" type="button" aria-expanded={dailyOpen} onClick={() => toggleNotes("daily", !dailyOpen)}><ChevronRight aria-hidden="true" />Daily habits ({summaries.reduce((sum, item) => sum + item.noteCount, 0)})</button>{dailyOpen && (summaries.length === 0 ? <p className="management-empty">No daily habits.</p> : <div className="management-list">{visible.map(item => <button className={`list-row ${item.archived ? "archived" : ""}`} key={item.id} onClick={() => setSelected(item)}><span><strong>{item.name}</strong><small>{item.noteCount} {item.noteCount === 1 ? "note" : "notes"}{item.archived ? " · Archived" : ""}</small></span><ChevronRight /></button>)}</div>)}</div>
    <div className="settings-group notes-category-group"><button className="disclosure-row" type="button" aria-expanded={timedOpen} onClick={() => toggleNotes("timed", !timedOpen)}><ChevronRight aria-hidden="true" />Timed activities ({timed.reduce((sum, item) => sum + item.noteCount, 0)})</button>{timedOpen && (visibleTimed.length ? <div className="management-list">{visibleTimed.map(item => <button className={`list-row ${item.archived ? "archived" : ""}`} key={item.id} onClick={() => setSelectedTimed(item)}><span><strong>{item.name}</strong><small>{item.noteCount} {item.noteCount === 1 ? "note" : "notes"}{item.archived ? " · Archived" : ""}</small></span><ChevronRight /></button>)}</div> : <p className="management-empty">No timed activities.</p>)}</div>
    <div className="settings-group notes-category-group"><button className="disclosure-row" type="button" aria-expanded={logsOpen} onClick={() => setLogsOpen(value => !value)}><ChevronRight aria-hidden="true" />Activity log ({logs.reduce((sum, item) => sum + item.noteCount, 0)})</button>{logsOpen && (visibleLogs.length ? <div className="management-list">{visibleLogs.map(item => <button className={`list-row ${item.archived ? "archived" : ""}`} key={item.id} onClick={() => setSelectedLog(item)}><span><strong>{item.name}</strong><small>{item.noteCount} {item.noteCount === 1 ? "note" : "notes"}{item.archived ? " · Archived" : ""}</small></span><ChevronRight /></button>)}</div> : <p className="management-empty">No activity log items.</p>)}</div>
    {summaries.some(item => item.archived) && <button className="text-button" onClick={() => setShowArchived(value => !value)}>{showArchived ? "Hide Archived Habits" : "View Archived Habits"}</button>}
    {selected && !noteOpen && <NoteHistory summary={selected} onClose={() => setSelected(null)} reportError={reportError} openNote={openNote} />}
    {selectedTimed && !noteOpen && <TimedNoteHistory summary={selectedTimed} onClose={() => setSelectedTimed(null)} reportError={reportError} openNote={openNote} />}
    {selectedLog && !noteOpen && <ActivityLogNoteHistory summary={selectedLog} onClose={() => setSelectedLog(null)} reportError={reportError} openNote={openNote} />}
  </section>;
}

function ActivityLogNoteHistory({ summary, onClose, reportError, openNote }: { summary: ActivityLogSummary; onClose: () => void; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void }) {
  const [notes, setNotes] = useState<ActivityLogNote[]>([]);
  useEffect(() => { void api.activityLogNotes(summary.id).then(setNotes).catch(reportError); }, [summary.id, reportError]);
  return <Modal title={summary.name} wide onClose={onClose}>{notes.length ? <div className="note-history">{notes.map(note => <button key={note.date} onClick={() => openNote({ habitId: summary.id, habitName: summary.name, date: note.date, create: false, archived: summary.archived, kind: "log" })}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div> : <EmptyState icon={<StickyNote />} title="No notes yet" detail="Add notes from the activity calendar." />}</Modal>;
}

function TimedNoteHistory({ summary, onClose, reportError, openNote }: { summary: TimedActivitySummary; onClose: () => void; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void }) {
  const [notes, setNotes] = useState<TimedActivityNote[]>([]);
  useEffect(() => { void api.timedActivityNotes(summary.id).then(setNotes).catch(reportError); }, [summary.id, reportError]);
  return <Modal title={summary.name} wide onClose={onClose}>{notes.length ? <div className="note-history">{notes.map(note => <button key={note.date} onClick={() => openNote({ habitId: summary.id, habitName: summary.name, date: note.date, create: false, archived: summary.archived, kind: "timed" })}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div> : <EmptyState icon={<StickyNote />} title="No notes yet" detail="Add notes from the activity’s daily logging sheet." />}</Modal>;
}

function NoteHistory({ summary, onClose, reportError, openNote }: { summary: NoteSummary; onClose: () => void; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void }) {
  const [notes, setNotes] = useState<HabitNote[]>([]);
  const load = useCallback(() => api.habitNotes(summary.id).then(setNotes).catch(reportError), [summary.id, reportError]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refreshNotes = () => { void load(); }; window.addEventListener("note-changed", refreshNotes); return () => window.removeEventListener("note-changed", refreshNotes); }, [load]);
  return <Modal title={summary.name} wide onClose={onClose}>{notes.length === 0 ? <EmptyState icon={<StickyNote />} title="No notes yet" detail="Add notes from Today, where you can choose a date." /> : <div className="note-history">{notes.map(note => <button key={note.date} onClick={() => openNote({ habitId: summary.id, habitName: summary.name, date: note.date, create: false, archived: summary.archived })}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div>}</Modal>;
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
    void request.then(value => { if (active) { setNote(value); if (!dirty.current) setBody(value.body); setNotFound(!value.exists && !target.create); } }).catch(error => { if (active) { setLoadError(error instanceof Error ? error.message : "Could not load note."); reportError(error); } });
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
  return <div className="habit-detail-view"><header className="habit-detail-bar">{editing ? <><button className="bar-text-button" onClick={target.create ? onClose : cancelEdit}>{target.create ? "Close" : "Cancel"}</button><button className="bar-text-button save" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button></> : <><button className="round-bar-button" onClick={onClose} aria-label="Close note"><X /></button><div className="detail-actions"><button onClick={() => setEditing(true)} aria-label="Edit note"><Pencil /></button><div className="menu-anchor"><button onClick={() => setMenu(value => !value)} aria-label="More note options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu"><button className="destructive-text" role="menuitem" onClick={() => { setMenu(false); setConfirmDelete(true); }}>Delete</button></div></>}</div></div></>}</header><main className="habit-detail-content note-detail-content"><h1>{note.habitName}</h1><p className="note-detail-date">{prettyDate(note.date)}</p>{note.archived && <span className="archive-badge detail-badge">Archived</span>}{editing ? <><label className="visually-hidden" htmlFor="note-detail-body">Note</label><textarea id="note-detail-body" className="note-detail-editor" autoFocus value={body} maxLength={20_000} onChange={event => { dirty.current = event.target.value !== (note?.body ?? ""); setBody(event.target.value); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !saving) { event.preventDefault(); void save(); } }} placeholder="Add a note for this day…" /><div className="note-detail-count">{body.length.toLocaleString()} / 20,000</div></> : <div className="note-detail-body">{note.body}</div>}</main>{confirmDelete && <Modal title="Delete note" onClose={() => setConfirmDelete(false)}><div className="confirmation-panel"><p className="delete-note-question">Delete this note?</p><div className="confirmation-actions"><button className="bar-text-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="danger-button" disabled={saving} onClick={() => void remove()}>Delete</button></div></div></Modal>}</div>;
}

function ManagementPage({ refresh, openHabit, openTimed, reportError }: { refresh: number; openHabit: (id: number) => void; openTimed: (id: number) => void; reportError: (error: unknown) => void }) {
  const [items, setItems] = useState<HabitSummary[]>([]); const [timed, setTimed] = useState<TimedActivitySummary[]>([]); const [logs, setLogs] = useState<ActivityLogSummary[]>([]); const [selectedLog, setSelectedLog] = useState<ActivityLogSummary | null>(null); const [activeOpen, setActiveOpen] = useState(() => { try { return window.localStorage?.getItem?.("management-active-open") !== "false"; } catch { return true; } }); const [archivedOpen, setArchivedOpen] = useState(() => { try { return window.localStorage?.getItem?.("management-archived-open") === "true"; } catch { return false; } });
  const [groups, setGroups] = useState<Record<string, boolean>>(() => { const keys = ["active-daily", "active-timed", "active-logs", "archived-daily", "archived-timed", "archived-logs"]; return Object.fromEntries(keys.map(key => { try { return [key, window.localStorage?.getItem?.(`management-${key}-open`) !== "false"]; } catch { return [key, true]; } })); });
  useEffect(() => { void Promise.all([api.habitSummaries(), api.timedActivitySummaries(), api.activityLogSummaries()]).then(([daily, timedItems, logItems]) => { setItems(daily); setTimed(timedItems); setLogs(logItems); }).catch(reportError); }, [refresh, reportError]);
  const active = items.filter(item => !item.archived);
  const archived = items.filter(item => item.archived).sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const activeTimed = timed.filter(item => !item.archived); const archivedTimed = timed.filter(item => item.archived).sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const activeLogs = logs.filter(item => !item.archived); const archivedLogs = logs.filter(item => item.archived).sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const dailyRows = (values: HabitSummary[], archivedStyle = false) => values.length === 0 ? <p className="management-empty">None</p> : <div className="management-list">{values.map(item => <button className={`list-row ${archivedStyle ? "archived-habit-row" : ""}`} key={item.id} onClick={() => openHabit(item.id)}><span><strong>{item.name}</strong><small>Started {prettyDate(item.startDate)}</small></span>{archivedStyle && <i className="archive-badge">Archived</i>}<ChevronRight /></button>)}</div>;
  const timedRows = (values: TimedActivitySummary[], archivedStyle = false) => values.length === 0 ? <p className="management-empty">None</p> : <div className="management-list">{values.map(item => <button className={`list-row ${archivedStyle ? "archived-habit-row" : ""}`} key={item.id} onClick={() => openTimed(item.id)}><span><strong>{item.name}</strong><small>Started {prettyDate(item.startDate)} · {item.noteCount} {item.noteCount === 1 ? "note" : "notes"}</small></span>{archivedStyle && <i className="archive-badge">Archived</i>}<ChevronRight /></button>)}</div>;
  const logRows = (values: ActivityLogSummary[], archivedStyle = false) => values.length === 0 ? <p className="management-empty">None</p> : <div className="management-list">{values.map(item => <button className={`list-row ${archivedStyle ? "archived-habit-row" : ""}`} key={item.id} onClick={() => setSelectedLog(item)}><span><strong>{item.name}</strong><small>Started {prettyDate(item.startDate)} · {item.noteCount} {item.noteCount === 1 ? "note" : "notes"}</small></span>{archivedStyle && <i className="archive-badge">Archived</i>}<ChevronRight /></button>)}</div>;
  const setDisclosure = (kind: "active" | "archived", value: boolean) => { if (kind === "active") setActiveOpen(value); else setArchivedOpen(value); try { window.localStorage?.setItem?.(`management-${kind}-open`, String(value)); } catch { /* optional preference */ } };
  const subgroup = (key: string, label: string, content: React.ReactNode) => <div className="management-subgroup"><button className="disclosure-row nested-management" type="button" aria-expanded={groups[key]} onClick={() => { const value = !groups[key]; setGroups(current => ({ ...current, [key]: value })); try { window.localStorage?.setItem?.(`management-${key}-open`, String(value)); } catch { /* optional preference */ } }}><ChevronRight aria-hidden="true" />{label}</button>{groups[key] && content}</div>;
  return <section className="page list-page"><h1>Management</h1><div className="settings-group management-group">
    <button className="disclosure-row" type="button" aria-expanded={activeOpen} aria-controls="active-tracking" onClick={() => setDisclosure("active", !activeOpen)}><ChevronRight aria-hidden="true" />Active</button>
    {activeOpen && <div id="active-tracking">{subgroup("active-daily", "Daily habits", dailyRows(active))}{subgroup("active-timed", "Timed activities", timedRows(activeTimed))}{subgroup("active-logs", "Activity log", logRows(activeLogs))}</div>}
    <button className="disclosure-row" type="button" aria-expanded={archivedOpen} aria-controls="archived-tracking" onClick={() => setDisclosure("archived", !archivedOpen)}><ChevronRight aria-hidden="true" />Archived</button>
    {archivedOpen && <div id="archived-tracking">{subgroup("archived-daily", "Daily habits", dailyRows(archived, true))}{subgroup("archived-timed", "Timed activities", timedRows(archivedTimed, true))}{subgroup("archived-logs", "Activity log", logRows(archivedLogs, true))}</div>}
  </div>{selectedLog && <ActivityLogManagementDetail activity={selectedLog} onClose={() => setSelectedLog(null)} onChanged={() => setSelectedLog(null)} reportError={reportError} />}</section>;
}

function ActivityLogManagementDetail({ activity, onClose, onChanged, reportError }: { activity: ActivityLogSummary; onClose: () => void; onChanged: () => void; reportError: (error: unknown) => void }) {
  const [name, setName] = useState(activity.name); const [editing, setEditing] = useState(false); const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [working, setWorking] = useState(false);
  const save = async () => { setWorking(true); try { await api.renameActivityLog(activity.id, name); setEditing(false); onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  const run = async () => { if (!action) return; setWorking(true); try { if (action === "archive") await api.archiveActivityLog(activity.id); else if (action === "restore") await api.restoreActivityLog(activity.id); else await api.deleteActivityLog(activity.id, confirmation); onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  return <Modal title={editing ? "Edit activity log" : activity.name} onClose={onClose} actions={!editing && <><button className="icon-button" onClick={() => setEditing(true)} aria-label="Edit activity log"><Pencil /></button><button className="small-button" onClick={() => setAction(activity.archived ? "restore" : "archive")}>{activity.archived ? "Restore" : "Archive"}</button></>}>{editing ? <div className="form"><label>Activity name<input autoFocus value={name} maxLength={200} onChange={event => setName(event.target.value)} /></label><button className="form-submit" disabled={!name.trim() || working} onClick={() => void save()}>Save</button></div> : <div className="detail-facts"><div><span>Type</span><strong>Activity log</strong></div><div><span>Original start date</span><strong>{prettyDate(activity.startDate)}</strong></div><div><span>Saved notes</span><strong>{activity.noteCount}</strong></div><button className="danger-button" onClick={() => setAction("delete")}>Delete permanently</button></div>}{action && <div className="confirmation-panel"><p>{action === "delete" ? "This permanently deletes the activity, its completion history, notes, and archive history. A safety backup is created first." : action === "archive" ? "This activity remains editable through today." : "This activity returns to tracking today."}</p>{action === "delete" && <label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={working || (action === "delete" && confirmation !== "DELETE")} onClick={() => void run()}>{action === "delete" ? "Delete permanently" : action === "archive" ? "Archive activity" : "Restore activity"}</button></div>}</Modal>;
}

function HabitHistory({ habit, reportError, openNote }: { habit: HabitDetail; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void }) {
  const [periods, setPeriods] = useState<ArchivePeriod[]>([]); const [selected, setSelected] = useState<ArchivePeriod | null>(null);
  const load = useCallback(() => api.archivePeriods(habit.id).then(items => { setPeriods(items); if (selected) setSelected(items.find(item => item.id === selected.id) ?? null); }).catch(reportError), [habit.id, reportError, selected]);
  useEffect(() => { void api.archivePeriods(habit.id).then(setPeriods).catch(reportError); }, [habit.id, reportError]);
  useEffect(() => { const refreshNotes = () => { void load(); }; window.addEventListener("note-changed", refreshNotes); return () => window.removeEventListener("note-changed", refreshNotes); }, [load]);
  if (selected) return <section className="habit-subpage"><button className="back-link" onClick={() => setSelected(null)}><ChevronLeft />History</button><h2>Active period {selected.number}</h2><p className="detail-range">{prettyDate(selected.startDate)} – {prettyDate(selected.endDate)}</p><div className="stat-grid"><span>Ending streak<strong>{selected.currentStreak}</strong></span><span>Longest streak<strong>{selected.longestStreak?.length ?? 0}</strong></span><span>Notes<strong>{selected.notes.length}</strong></span></div><h3>Streak history</h3>{selected.streaks.length ? <div className="streak-list">{selected.streaks.map(streak => <div key={`${streak.startDate}-${streak.endDate}`}><strong>{streak.length} days</strong><span>{prettyDate(streak.startDate)} – {prettyDate(streak.endDate)}</span></div>)}</div> : <p className="secondary">No completed streaks in this period.</p>}<h3 className="detail-section-title">Notes</h3>{selected.notes.length ? <div className="note-history">{selected.notes.map(note => <button key={note.date} onClick={() => openNote({ habitId: habit.id, habitName: habit.name, date: note.date, create: false, archived: true })}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div> : <p className="secondary">No notes in this period.</p>}</section>;
  return <section className="habit-subpage"><h2>History</h2>{periods.length ? <div className="inset-list">{[...periods].reverse().map(period => <button className="list-row" key={period.id} onClick={() => setSelected(period)}><span><strong>Active period {period.number}</strong><small>{prettyDate(period.startDate)} – {prettyDate(period.endDate)}</small></span><ChevronRight /></button>)}</div> : <p className="secondary">No archive history yet.</p>}</section>;
}

function HabitDetailView({ habitId, onClose, onChanged, onDeleted, reportError, openNote }: { habitId: number; onClose: () => void; onChanged: () => void; onDeleted: () => void; reportError: (error: unknown) => void; openNote: (target: NoteTarget) => void }) {
  const [habit, setHabit] = useState<HabitDetail | null>(null); const [editing, setEditing] = useState(false); const [name, setName] = useState(""); const [menu, setMenu] = useState(false); const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null); const [confirmation, setConfirmation] = useState(""); const [working, setWorking] = useState(false); const [history, setHistory] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoadError("");
    void api.habitDetail(habitId).then(value => { if (active) { setHabit(value); setName(value.name); } }).catch(error => { if (active) { setLoadError("Could not load habit."); reportError(error); } });
    return () => { active = false; };
  }, [habitId, reportError, attempt]);
  useEffect(() => { const closeMenu = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(false); }; window.addEventListener("keydown", closeMenu); return () => window.removeEventListener("keydown", closeMenu); }, []);
  if (!habit) return <div className="habit-detail-view"><header className="habit-detail-bar"><button className="round-bar-button" onClick={onClose} aria-label="Close habit details"><X /></button></header><div className="loading" role="status">{loadError || "Loading habit…"}{loadError && <button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button>}</div></div>;
  const rename = async () => { setWorking(true); try { const value = await api.renameHabit(habit.id, name); setHabit(value); setName(value.name); setEditing(false); onChanged(); } catch (error) { reportError(error); } finally { setWorking(false); } };
  const runAction = async () => { if (!action) return; setWorking(true); try {
    if (action === "archive") { const value = await api.archiveHabit(habit.id); setHabit(value); onChanged(); }
    if (action === "restore") { const value = await api.restoreHabit(habit.id); setHabit(value); onChanged(); }
    if (action === "delete") { await api.deleteHabit(habit.id, confirmation); onChanged(); onDeleted(); return; }
    setAction(null); setConfirmation("");
  } catch (error) { reportError(error); } finally { setWorking(false); } };
  return <div className="habit-detail-view"><header className="habit-detail-bar">{editing ? <><button className="bar-text-button" onClick={() => { setName(habit.name); setEditing(false); }}>Cancel</button><button className="bar-text-button save" disabled={!name.trim() || working} onClick={() => void rename()}>Save</button></> : <><button className="round-bar-button" onClick={onClose} aria-label="Close habit details"><X /></button><div className="detail-actions"><button onClick={() => setEditing(true)} aria-label="Edit habit"><Pencil /></button><div className="menu-anchor"><button onClick={() => setMenu(value => !value)} aria-label="More habit options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu">{habit.archived ? <button role="menuitem" onClick={() => { setAction("restore"); setConfirmation(""); setMenu(false); }}>Restore</button> : <button role="menuitem" onClick={() => { setAction("archive"); setMenu(false); }}>Archive</button>}<button className="destructive-text" role="menuitem" onClick={() => { setAction("delete"); setConfirmation(""); setMenu(false); }}>Delete</button></div></>}</div></div></>}</header><main className="habit-detail-content">{editing ? <label className="detail-title-editor">Habit name<input autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label> : <h1>{habit.name}</h1>}{habit.archived && <span className="archive-badge detail-badge">Archived</span>}<div className="detail-facts"><div><span>Original start date</span><strong>{prettyDate(habit.startDate)}</strong></div>{habit.archived && habit.latestActiveRange && <div><span>Most recent active range</span><strong>{prettyDate(habit.latestActiveRange.startDate)} – {prettyDate(habit.latestActiveRange.endDate)}</strong></div>}</div><div className="stat-grid"><span>{habit.archived ? "Ending streak" : "Current streak"}<strong>{habit.currentStreak}</strong></span><span>Longest streak<strong>{habit.longestStreak?.length ?? 0}</strong></span><span>Notes<strong>{habit.noteCount}</strong></span></div><button className="history-link" onClick={() => setHistory(value => !value)}>{history ? "Hide history" : "History"}<ChevronRight /></button>{history && (habit.archived ? <HabitHistory habit={habit} reportError={reportError} openNote={openNote} /> : <section className="habit-subpage"><h2>Streak history</h2>{habit.streaks.length ? <div className="streak-list">{habit.streaks.map(streak => <div key={`${streak.startDate}-${streak.endDate}`}><strong>{streak.length} days</strong><span>{prettyDate(streak.startDate)} – {prettyDate(streak.endDate)}</span></div>)}</div> : <p className="secondary">No completed streaks yet.</p>}</section>)}</main>
    {action && <Modal title={action === "archive" ? "Archive habit" : action === "restore" ? "Restore habit" : "Delete habit"} onClose={() => { setAction(null); setConfirmation(""); }}><div className="confirmation-panel">{action === "archive" ? <p>This habit will disappear from active management and from daily tracking after today. Its history and notes will remain.</p> : action === "restore" ? <p>This habit will return to daily tracking starting today. Dates between archive and restoration remain inactive and will not be backfilled.</p> : <><p>This permanently deletes the habit, daily statuses, notes, challenges, and archive history. A safety backup is created immediately before deletion.</p><label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label></>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={working || (action === "delete" && confirmation !== "DELETE")} onClick={() => void runAction()}>{working ? "Working…" : action === "archive" ? "Archive habit" : action === "restore" ? "Restore habit" : "Delete permanently"}</button></div></Modal>}
  </div>;
}

function TimedManagementDetail({ activityId, onClose, onChanged, reportError }: { activityId: number; onClose: () => void; onChanged: () => void; reportError: (error: unknown) => void }) {
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
  return <div className="habit-detail-view"><header className="habit-detail-bar">{editing ? <><button className="bar-text-button" onClick={() => { setName(activity.name); setEditing(false); }}>Cancel</button><button className="bar-text-button save" disabled={!name.trim() || working} onClick={() => void rename()}>Save</button></> : <><button className="round-bar-button" onClick={onClose} aria-label="Close timed activity details"><X /></button><div className="detail-actions"><button onClick={() => setEditing(true)} aria-label="Edit timed activity"><Pencil /></button><div className="menu-anchor"><button onClick={() => setMenu(value => !value)} aria-label="More timed activity options" aria-expanded={menu}><MoreHorizontal /></button>{menu && <><button className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /><div className="habit-menu" role="menu">{activity.archived ? <button role="menuitem" onClick={() => { setAction("restore"); setMenu(false); }}>Restore</button> : <button role="menuitem" onClick={() => { setAction("archive"); setMenu(false); }}>Archive</button>}<button className="destructive-text" role="menuitem" onClick={() => { setAction("delete"); setMenu(false); }}>Delete</button></div></>}</div></div></>}</header><main className="habit-detail-content">{editing ? <label className="detail-title-editor">Activity name<input autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label> : <h1>{activity.name}</h1>}{activity.archived && <span className="archive-badge detail-badge">Archived</span>}<div className="detail-facts"><div><span>Type</span><strong>Timed activity</strong></div><div><span>Original start date</span><strong>{prettyDate(activity.startDate)}</strong></div>{activity.archivedAt && <div><span>Archived</span><strong>{prettyDate(activity.archivedAt)}</strong></div>}<div><span>Saved notes</span><strong>{activity.noteCount}</strong></div></div></main>
    {action && <Modal title={action === "archive" ? "Archive timed activity" : action === "restore" ? "Restore timed activity" : "Delete timed activity"} onClose={() => { setAction(null); setConfirmation(""); }}><div className="confirmation-panel">{action === "archive" ? <p>This activity remains editable through today. Sessions and notes are preserved.</p> : action === "restore" ? <p>This activity returns to tracking today. The inactive gap remains unavailable.</p> : <><p>This permanently deletes the activity, duration entries, notes, and archive history. A safety backup is created first.</p><label>Type <strong>DELETE</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label></>}<button className={action === "delete" ? "danger-button" : "form-submit"} disabled={working || (action === "delete" && confirmation !== "DELETE")} onClick={() => void runAction()}>{working ? "Working…" : action === "archive" ? "Archive activity" : action === "restore" ? "Restore activity" : "Delete permanently"}</button></div></Modal>}
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

function MorePage({ config, reportError, imported }: { config: Config; reportError: (error: unknown) => void; imported: () => void }) {
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
  return <section className="page list-page"><h1>More</h1><div className="settings-group"><h2>Data</h2><button className="disclosure-row" type="button" aria-expanded={backupOpen} aria-controls="backup-data-tools" onClick={() => setBackupOpen(value => !value)}><ChevronRight aria-hidden="true" />Backup and restore</button>{backupOpen && <div id="backup-data-tools" className="backup-tools primary-backup-tools"><button className="primary-settings-button" onClick={() => void createBackup()} disabled={backupWorking}>Create backup</button><div className="backup-list-head"><h3>Server backups</h3>{safetyToggle}</div><BackupRows items={backups} showSafety={showSafety} onDownload={item => void downloadBackup(item)} onRestore={item => { setPendingAction({ type: "restore", item }); setActionConfirmation(""); }} onDelete={item => { setPendingAction({ type: "delete", item }); setActionConfirmation(""); }} /><button className="disclosure-row nested" type="button" aria-expanded={uploadOpen} onClick={() => setUploadOpen(value => !value)}><ChevronRight aria-hidden="true" />More</button>{uploadOpen && <form className="import-card upload-restore" onSubmit={event => void restoreUpload(event)}><FileUp /><div><h3>Upload web backup</h3><p>Only marked web-habit-tracker backups are accepted.</p></div><label className="file-picker">{uploadFile?.name ?? "Choose backup file"}<input type="file" accept=".sqlite3,application/vnd.sqlite3" onChange={event => setUploadFile(event.target.files?.[0] ?? null)} /></label>{uploadFile && <label>Type <strong>RESTORE</strong> to continue<input value={uploadConfirmation} onChange={event => setUploadConfirmation(event.target.value)} autoCapitalize="characters" /></label>}<button className="danger-button" disabled={!uploadFile || uploadConfirmation !== "RESTORE" || backupWorking}>Restore database</button></form>}{backupMessage && <p className="success" role="status">{backupMessage}</p>}</div>}<button className="disclosure-row" type="button" aria-expanded={advancedOpen} aria-controls="advanced-data-tools" onClick={() => setAdvancedOpen(value => !value)}><ChevronRight aria-hidden="true" />Advanced</button>{advancedOpen && <div id="advanced-data-tools" className="advanced-data-tools advanced-settings-tools">{backupSettings && <form className="backup-settings" onSubmit={event => void saveSettings(event)}><h3>Backup scheduling</h3><div className="schedule-block"><label className="switch-label"><input type="checkbox" checked={backupSettings.dailyEnabled} onChange={event => setBackupSettings({ ...backupSettings, dailyEnabled: event.target.checked })} />Daily backups</label><label>Time<input type="time" value={backupSettings.dailyTime} onChange={event => setBackupSettings({ ...backupSettings, dailyTime: event.target.value })} /></label><label>Keep<input type="number" min="1" max="365" value={backupSettings.dailyRetention} onChange={event => setBackupSettings({ ...backupSettings, dailyRetention: Number(event.target.value) })} /></label></div><div className="schedule-block"><label className="switch-label"><input type="checkbox" checked={backupSettings.weeklyEnabled} onChange={event => setBackupSettings({ ...backupSettings, weeklyEnabled: event.target.checked })} />Weekly backups</label><label>Day<select value={backupSettings.weeklyDay} onChange={event => setBackupSettings({ ...backupSettings, weeklyDay: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label>Time<input type="time" value={backupSettings.weeklyTime} onChange={event => setBackupSettings({ ...backupSettings, weeklyTime: event.target.value })} /></label><label>Keep<input type="number" min="1" max="365" value={backupSettings.weeklyRetention} onChange={event => setBackupSettings({ ...backupSettings, weeklyRetention: Number(event.target.value) })} /></label></div><p className="settings-hint">Times use {config.timezone}. Missed schedules run once when the server returns.</p><button className="save-settings-button" disabled={backupWorking}><Save />Save settings</button></form>}<button className="disclosure-row nested" type="button" aria-expanded={legacyOpen} onClick={() => setLegacyOpen(value => !value)}><ChevronRight aria-hidden="true" />Import legacy database</button>{legacyOpen && <form className="import-card" onSubmit={event => void runImport(event)}><FileUp /><div><h3>Import legacy database</h3><p>This replaces all live data after validation. A timestamped safety backup is created first.</p></div><label className="file-picker">{file?.name ?? "Choose SQLite file"}<input type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>{file && <label>Type <strong>IMPORT</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" /></label>}<button className="danger-button" disabled={!file || confirmation !== "IMPORT" || working}>{working ? "Importing…" : "Replace database"}</button>{success && <p className="success" role="status">{success}</p>}</form>}</div>}</div>
    <div className="settings-group"><h2>Server time</h2><div className="info-row"><span>Timezone</span><strong>{config.timezone}</strong></div><div className="info-row"><span>Authoritative date</span><strong>{config.today}</strong></div><p className="settings-footnote">Read-only. The timezone comes from the server’s <code>TZ</code> setting; the authoritative date follows that timezone and the server clock.</p></div>
    <div className="settings-group"><h2>Coming next</h2><div className="roadmap-row">Challenges</div><div className="roadmap-row">Installable PWA</div><div className="roadmap-row">Configurable server timezone</div></div>
    {pendingAction && <Modal title={pendingAction.type === "restore" ? "Restore backup" : "Delete backup"} onClose={() => { setPendingAction(null); setActionConfirmation(""); }}><div className="confirmation-panel"><p>{pendingAction.type === "restore" ? "The current database will be replaced after validation. A safety backup is created first." : "This permanently deletes the selected backup."}</p><strong>{pendingAction.item.filename}</strong><label>Type <strong>{pendingAction.type === "restore" ? "RESTORE" : "DELETE"}</strong> to continue<input value={actionConfirmation} onChange={event => setActionConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label><button className="danger-button" disabled={actionConfirmation !== (pendingAction.type === "restore" ? "RESTORE" : "DELETE") || backupWorking} onClick={() => void runBackupAction()}>{pendingAction.type === "restore" ? "Restore database" : "Delete backup"}</button></div></Modal>}
  </section>;
}

const tabs: { id: Tab; label: string; Icon: typeof CircleCheck }[] = [
  { id: "today", label: "Today", Icon: CircleCheck }, { id: "stats", label: "Stats", Icon: ChartNoAxesCombined },
  { id: "notes", label: "Notes", Icon: NotebookPen }, { id: "manage", label: "Manage", Icon: Settings2 }, { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "more", label: "More", Icon: CircleEllipsis },
];

export default function App() {
  const initialHabit = window.location.pathname.match(/^\/habits\/(\d+)$/)?.[1];
  const initialNote = window.location.pathname.match(/^\/habits\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
  const initialTimedNote = window.location.pathname.match(/^\/timed-activities\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
  const initialLogNote = window.location.pathname.match(/^\/activity-logs\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/);
  const [config, setConfig] = useState<Config | null>(null); const [tab, setTab] = useState<Tab>("today"); const [selectedDate, setSelectedDate] = useState(""); const [refresh, setRefresh] = useState(0); const [notificationCount, setNotificationCount] = useState(0); const [notifications, setNotifications] = useState<{ items: Unresolved[]; systemItems: SystemNotification[] }>({ items: [], systemItems: [] }); const [error, setError] = useState(""); const [detailHabitId, setDetailHabitId] = useState<number | null>(initialHabit ? Number(initialHabit) : null); const [detailTimedId, setDetailTimedId] = useState<number | null>(() => { const id = window.location.pathname.match(/^\/timed-activities\/(\d+)$/)?.[1]; return id ? Number(id) : null; }); const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(initialNote ? { habitId: Number(initialNote[1]), habitName: "", date: initialNote[2], create: false } : initialTimedNote ? { habitId: Number(initialTimedNote[1]), habitName: "", date: initialTimedNote[2], create: false, kind: "timed" } : initialLogNote ? { habitId: Number(initialLogNote[1]), habitName: "", date: initialLogNote[2], create: false, kind: "log" } : null);
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
      setSelectedDate(selected => !selected || selected === previous ? value.today : selected);
      setConfig(value); setError(""); refreshAll();
    } catch (error) { reportError(error); }
    finally { syncing.current = false; }
  }, [refreshAll, reportError]);
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
  useEffect(() => { const handlePop = () => { if (!allowHistoryNavigation()) return; const timedMatch = window.location.pathname.match(/^\/timed-activities\/(\d+)$/); setDetailTimedId(timedMatch ? Number(timedMatch[1]) : null); const habitMatch = window.location.pathname.match(/^\/habits\/(\d+)$/); const noteMatch = window.location.pathname.match(/^\/habits\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/); const timedNoteMatch = window.location.pathname.match(/^\/timed-activities\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/); const logNoteMatch = window.location.pathname.match(/^\/activity-logs\/(\d+)\/notes\/(\d{4}-\d{2}-\d{2})$/); setDetailHabitId(habitMatch ? Number(habitMatch[1]) : null); setNoteTarget(noteMatch ? (window.history.state?.noteTarget ?? { habitId: Number(noteMatch[1]), habitName: "", date: noteMatch[2], create: false }) : timedNoteMatch ? (window.history.state?.noteTarget ?? { habitId: Number(timedNoteMatch[1]), habitName: "", date: timedNoteMatch[2], create: false, kind: "timed" }) : logNoteMatch ? (window.history.state?.noteTarget ?? { habitId: Number(logNoteMatch[1]), habitName: "", date: logNoteMatch[2], create: false, kind: "log" }) : null); }; window.addEventListener("popstate", handlePop); return () => window.removeEventListener("popstate", handlePop); }, []);
  const detailOpen = detailHabitId !== null || detailTimedId !== null || noteTarget !== null;
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
  }, [detailOpen, detailHabitId, detailTimedId, noteTarget]);
  if (!config || !selectedDate) return <main className="startup"><img src="/app-icon.png" alt="" /><h1>Habit Tracker</h1><p role="status">{error || "Opening your habits…"}</p>{error && <button className="form-submit" onClick={() => void syncConfig()}>Retry</button>}</main>;
  const openTimed = (id: number) => { window.history.pushState({ timedId: id }, "", `/timed-activities/${id}`); setDetailTimedId(id); };
  const closeTimed = () => { if (window.history.state?.timedId) closeHistoryRoute(); else { window.history.replaceState(null, "", "/"); setDetailTimedId(null); } };
  const openDate = (date: string) => { setSelectedDate(date); setTab("today"); };
  const openHabit = (id: number) => { window.history.pushState({ habitId: id }, "", `/habits/${id}`); setDetailHabitId(id); };
  const closeHabit = () => { if (window.history.state?.habitId) closeHistoryRoute(); else { window.history.replaceState(null, "", "/"); setDetailHabitId(null); } };
  const openNote = (target: NoteTarget) => { const path = target.kind === "timed" ? `/timed-activities/${target.habitId}/notes/${target.date}` : target.kind === "log" ? `/activity-logs/${target.habitId}/notes/${target.date}` : `/habits/${target.habitId}/notes/${target.date}`; window.history.pushState({ noteTarget: target }, "", path); setNoteTarget(target); };
  const closeNote = () => { if (window.history.state?.noteTarget) closeHistoryRoute(); else { window.history.replaceState(null, "", "/"); setNoteTarget(null); } };
  return <div className="app-shell">
    <main className="content" inert={detailOpen} aria-hidden={detailOpen || undefined}>
      {tab === "today" && <TodayPage config={config} selectedDate={selectedDate} refresh={refresh} onDate={setSelectedDate} onDataChange={refreshAll} reportError={reportError} openHabit={openHabit} openNote={openNote} />}
      {tab === "stats" && <StatsPage refresh={refresh} selectedDate={selectedDate} today={config.today} onDate={setSelectedDate} reportError={reportError} />}
      {tab === "notes" && <NotesPage refresh={refresh} reportError={reportError} openNote={openNote} noteOpen={noteTarget !== null} />}
      {tab === "manage" && <ManagementPage refresh={refresh} openHabit={openHabit} openTimed={openTimed} reportError={reportError} />}
      {tab === "notifications" && <NotificationsPage items={notifications.items} systemItems={notifications.systemItems} reportError={reportError} openDate={openDate} onDataChange={refreshAll} />}
      {tab === "more" && <MorePage config={config} reportError={reportError} imported={() => { void syncConfig(); }} />}
    </main>
    <nav className="tab-bar" inert={detailOpen} aria-hidden={detailOpen || undefined} aria-label="Main navigation">{tabs.map(({ id, label, Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-label={id === "notifications" && notificationCount > 0 ? `${label}, ${notificationCount} unresolved dates` : label} aria-current={tab === id ? "page" : undefined}><span className="tab-icon"><Icon />{id === "notifications" && notificationCount > 0 ? <i aria-hidden="true">{notificationCount}</i> : null}</span><span className="tab-label">{id === "notifications" ? "Alerts" : label}</span></button>)}</nav>
    {error && <div className="error-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X /></button></div>}
    {detailHabitId !== null && <div inert={noteTarget !== null}><HabitDetailView habitId={detailHabitId} onClose={closeHabit} onChanged={refreshAll} onDeleted={closeHabit} reportError={reportError} openNote={openNote} /></div>}
    {detailTimedId !== null && <div inert={noteTarget !== null}><TimedManagementDetail activityId={detailTimedId} onClose={closeTimed} onChanged={refreshAll} reportError={reportError} /></div>}
    {noteTarget && <NoteDetailView key={`${noteTarget.kind ?? "daily"}:${noteTarget.habitId}:${noteTarget.date}`} target={noteTarget} onClose={closeNote} onChanged={refreshAll} reportError={reportError} />}
  </div>;
}
