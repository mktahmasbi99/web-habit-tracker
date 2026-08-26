import {
  Bell, BellOff, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight,
  CircleEllipsis, FileUp, Flame, NotebookPen, Plus, StickyNote, X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Calendar from "./components/Calendar";
import Modal from "./components/Modal";
import { api, ApiError } from "./lib/api";
import type { Config, HabitDay, HabitNote, NoteSummary, Statistic, Status, Unresolved } from "./lib/types";

type Tab = "today" | "stats" | "notes" | "notifications" | "more";
const parseDay = (value: string) => new Date(`${value}T12:00:00Z`);
const dayISO = (value: Date) => value.toISOString().slice(0, 10);
const shiftDay = (value: string, offset: number) => {
  const date = parseDay(value); date.setUTCDate(date.getUTCDate() + offset); return dayISO(date);
};
const prettyDate = (value: string) => parseDay(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const statusLabels: Record<Status, string> = { pending: "Pending", done: "Done", missed: "Missed" };

function EmptyState({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="empty-state">{icon}<h2>{title}</h2><p>{detail}</p></div>;
}

function TodayPage({ config, selectedDate, onDate, onDataChange, reportError }: {
  config: Config; selectedDate: string; onDate: (date: string) => void;
  onDataChange: () => void; reportError: (error: unknown) => void;
}) {
  const [habits, setHabits] = useState<HabitDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendar, setCalendar] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HabitDay | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setHabits(await api.habits(selectedDate)); } catch (error) { reportError(error); }
    finally { setLoading(false); }
  }, [selectedDate, reportError]);
  useEffect(() => { void load(); }, [load]);
  const title = selectedDate === config.today ? "Today" : selectedDate === shiftDay(config.today, -1) ? "Yesterday" : selectedDate === shiftDay(config.today, 1) ? "Tomorrow" : prettyDate(selectedDate);
  const setStatus = async (habit: HabitDay, status: Status) => {
    try { await api.setStatus(habit.id, selectedDate, status); await load(); onDataChange(); }
    catch (error) { reportError(error); }
  };
  return <section className="page today-page">
    <header className="day-header">
      <button className="icon-button accent" onClick={() => onDate(shiftDay(selectedDate, -1))} aria-label="Previous day"><ChevronLeft /></button>
      <button className="day-title" onClick={() => setCalendar(true)}><h1>{title}</h1><small>{selectedDate}</small></button>
      <button className="icon-button accent" onClick={() => onDate(shiftDay(selectedDate, 1))} aria-label="Next day"><ChevronRight /></button>
    </header>
    <div className="primary-action"><button className="add-button" onClick={() => setAdding(true)} aria-label="Add habit"><Plus /></button></div>
    {loading ? <div className="loading">Loading habits…</div> : habits.length === 0 ?
      <EmptyState icon={<Check />} title="No habits" detail="Add a daily habit to begin." /> :
      <div className="habit-list">{habits.map(habit => <article className="habit-card" key={habit.id}>
        <div className="habit-card-head"><h2>{habit.name}</h2><span><Flame size={14} /> {habit.currentStreak} streak</span></div>
        <div className="habit-actions">
          <div className="status-group">{(["pending", "done", "missed"] as Status[]).map(status =>
            <button key={status} className={`status-button ${status} ${habit.status === status ? "active" : ""}`} onClick={() => void setStatus(habit, status)} aria-pressed={habit.status === status}>{statusLabels[status]}</button>
          )}</div>
          <button className={`note-button ${habit.hasNote ? "has-note" : ""}`} onClick={() => setEditing(habit)} aria-label={`${habit.hasNote ? "Edit" : "Add"} note for ${habit.name}`}><StickyNote /></button>
        </div>
      </article>)}</div>}
    {calendar && <Modal title="Calendar" wide onClose={() => setCalendar(false)}><Calendar selected={selectedDate} today={config.today} onSelect={date => { onDate(date); setCalendar(false); }} /></Modal>}
    {adding && <AddHabit defaultDate={selectedDate} onClose={() => setAdding(false)} onSave={async (name, startDate) => {
      try { await api.createHabit(name, startDate); setAdding(false); await load(); onDataChange(); } catch (error) { reportError(error); }
    }} />}
    {editing && <NoteEditor habit={editing} date={selectedDate} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); onDataChange(); }} reportError={reportError} />}
  </section>;
}

function AddHabit({ defaultDate, onClose, onSave }: { defaultDate: string; onClose: () => void; onSave: (name: string, date: string) => Promise<void> }) {
  const [name, setName] = useState(""); const [date, setDate] = useState(defaultDate); const [saving, setSaving] = useState(false);
  return <Modal title="New habit" onClose={onClose}><form className="form" onSubmit={event => { event.preventDefault(); setSaving(true); void onSave(name, date).finally(() => setSaving(false)); }}>
    <label>Habit name<input autoFocus value={name} maxLength={200} onChange={event => setName(event.target.value)} placeholder="Read, walk, meditate…" /></label>
    <label>Start date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <button className="form-submit" disabled={!name.trim() || saving}>{saving ? "Adding…" : "Add habit"}</button>
  </form></Modal>;
}

function NoteEditor({ habit, date, initial, onClose, onSaved, reportError }: {
  habit: Pick<HabitDay, "id" | "name">; date: string; initial?: string; onClose: () => void;
  onSaved: () => Promise<void>; reportError: (error: unknown) => void;
}) {
  const [body, setBody] = useState(initial ?? ""); const [loading, setLoading] = useState(initial === undefined); const [saving, setSaving] = useState(false);
  useEffect(() => { if (initial === undefined) void api.note(habit.id, date).then(value => setBody(value.body)).catch(reportError).finally(() => setLoading(false)); }, [habit.id, date, initial, reportError]);
  return <Modal title={habit.name} onClose={onClose}><div className="note-date">{prettyDate(date)}</div>{loading ? <div className="loading">Loading note…</div> : <form className="form" onSubmit={event => { event.preventDefault(); setSaving(true); void api.saveNote(habit.id, date, body).then(onSaved).catch(reportError).finally(() => setSaving(false)); }}>
    <label className="visually-hidden" htmlFor="note-body">Note</label><textarea id="note-body" autoFocus value={body} maxLength={20_000} onChange={event => setBody(event.target.value)} placeholder="Add a note for this day…" />
    <div className="form-meta"><span>{body.length.toLocaleString()} / 20,000</span><button className="form-submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
  </form>}</Modal>;
}

function StatsPage({ refresh, reportError }: { refresh: number; reportError: (error: unknown) => void }) {
  const [items, setItems] = useState<Statistic[]>([]); const [selected, setSelected] = useState<Statistic | null>(null);
  useEffect(() => { void api.statistics().then(setItems).catch(reportError); }, [refresh, reportError]);
  return <section className="page list-page"><h1>Stats</h1>{items.length === 0 ? <EmptyState icon={<ChartNoAxesCombined />} title="No statistics yet" detail="Create a habit to begin building streaks." /> : <div className="inset-list">{items.map(item => <button className="list-row" key={item.id} onClick={() => setSelected(item)}><span><strong>{item.name}</strong><small>Current streak: {item.currentStreak} · Notes: {item.noteCount}</small></span><ChevronRight /></button>)}</div>}
    {selected && <Modal title={selected.name} onClose={() => setSelected(null)}><div className="stat-grid"><span>Current streak<strong>{selected.currentStreak}</strong></span><span>Longest streak<strong>{selected.longestStreak?.length ?? 0}</strong></span><span>Notes<strong>{selected.noteCount}</strong></span></div><h3>Streak history</h3>{selected.streaks.length ? <div className="streak-list">{selected.streaks.map(streak => <div key={`${streak.startDate}-${streak.endDate}`}><strong>{streak.length} days</strong><span>{prettyDate(streak.startDate)} – {prettyDate(streak.endDate)}</span></div>)}</div> : <p className="secondary">No completed streaks yet.</p>}</Modal>}
  </section>;
}

function NotesPage({ refresh, reportError, onDataChange }: { refresh: number; reportError: (error: unknown) => void; onDataChange: () => void }) {
  const [summaries, setSummaries] = useState<NoteSummary[]>([]); const [showArchived, setShowArchived] = useState(false); const [selected, setSelected] = useState<NoteSummary | null>(null);
  const load = useCallback(() => api.noteSummaries().then(setSummaries).catch(reportError), [reportError]);
  useEffect(() => { void load(); }, [refresh, load]);
  const visible = summaries.filter(item => !item.archived || showArchived);
  return <section className="page list-page"><h1>Notes</h1>{summaries.length === 0 ? <EmptyState icon={<NotebookPen />} title="No habits" detail="Notes are organized by habit." /> : <div className="inset-list">{visible.map(item => <button className={`list-row ${item.archived ? "archived" : ""}`} key={item.id} onClick={() => setSelected(item)}><span><strong>{item.name}</strong><small>{item.noteCount} {item.noteCount === 1 ? "note" : "notes"}{item.archived ? " · Archived" : ""}</small></span><ChevronRight /></button>)}</div>}
    {summaries.some(item => item.archived) && <button className="text-button" onClick={() => setShowArchived(value => !value)}>{showArchived ? "Hide Archived Habits" : "View Archived Habits"}</button>}
    {selected && <NoteHistory summary={selected} onClose={() => setSelected(null)} reportError={reportError} onDataChange={() => { void load(); onDataChange(); }} />}
  </section>;
}

function NoteHistory({ summary, onClose, reportError, onDataChange }: { summary: NoteSummary; onClose: () => void; reportError: (error: unknown) => void; onDataChange: () => void }) {
  const [notes, setNotes] = useState<HabitNote[]>([]); const [editing, setEditing] = useState<HabitNote | null>(null);
  const load = useCallback(() => api.habitNotes(summary.id).then(setNotes).catch(reportError), [summary.id, reportError]);
  useEffect(() => { void load(); }, [load]);
  return <Modal title={summary.name} wide onClose={onClose}>{notes.length === 0 ? <EmptyState icon={<StickyNote />} title="No notes yet" detail="Add notes from Today, where you can choose a date." /> : <div className="note-history">{notes.map(note => <button key={note.date} onClick={() => setEditing(note)}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div>}{editing && <NoteEditor habit={{ id: summary.id, name: summary.name }} date={editing.date} initial={editing.body} onClose={() => setEditing(null)} reportError={reportError} onSaved={async () => { setEditing(null); await load(); onDataChange(); }} />}</Modal>;
}

function NotificationsPage({ refresh, reportError, openDate }: { refresh: number; reportError: (error: unknown) => void; openDate: (date: string) => void }) {
  const [items, setItems] = useState<Unresolved[]>([]);
  useEffect(() => { void api.unresolved().then(setItems).catch(reportError); }, [refresh, reportError]);
  return <section className="page list-page"><h1>Notifications</h1>{items.length === 0 ? <EmptyState icon={<BellOff />} title="No unresolved dates" detail="All past habits have been marked Done or Missed." /> : <div className="inset-list">{items.map(item => <button className="list-row" key={item.date} onClick={() => openDate(item.date)}><span><strong>{prettyDate(item.date)}</strong><small>{item.pendingCount} {item.pendingCount === 1 ? "habit" : "habits"} unresolved</small></span><ChevronRight /></button>)}</div>}</section>;
}

function MorePage({ config, reportError, imported }: { config: Config; reportError: (error: unknown) => void; imported: () => void }) {
  const [file, setFile] = useState<File | null>(null); const [confirmation, setConfirmation] = useState(""); const [working, setWorking] = useState(false); const [success, setSuccess] = useState("");
  const runImport = async (event: React.FormEvent) => {
    event.preventDefault(); if (!file) return; setWorking(true); setSuccess("");
    try { const result = await api.importDatabase(file, confirmation); setSuccess(`Import complete. Safety backup: ${result.backup}`); setFile(null); setConfirmation(""); imported(); }
    catch (error) { reportError(error); } finally { setWorking(false); }
  };
  return <section className="page list-page"><h1>More</h1><div className="settings-group"><h2>Data</h2><form className="import-card" onSubmit={event => void runImport(event)}><FileUp /><div><h3>Import legacy database</h3><p>This replaces all live data after validation. A timestamped safety backup is created first.</p></div><label className="file-picker">{file?.name ?? "Choose SQLite file"}<input type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>{file && <label>Type <strong>IMPORT</strong> to continue<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" /></label>}<button className="danger-button" disabled={!file || confirmation !== "IMPORT" || working}>{working ? "Importing…" : "Replace database"}</button>{success && <p className="success" role="status">{success}</p>}</form></div>
    <div className="settings-group"><h2>Application</h2><div className="info-row"><span>Timezone</span><strong>{config.timezone}</strong></div><div className="info-row"><span>Authoritative date</span><strong>{config.today}</strong></div></div>
    <div className="settings-group"><h2>Coming next</h2><div className="roadmap-row">Habit management and archive</div><div className="roadmap-row">Challenges</div><div className="roadmap-row">Backup and restore</div><div className="roadmap-row">Installable PWA</div></div>
  </section>;
}

const tabs: { id: Tab; label: string; Icon: typeof Check }[] = [
  { id: "today", label: "Today", Icon: Check }, { id: "stats", label: "Stats", Icon: ChartNoAxesCombined },
  { id: "notes", label: "Notes", Icon: NotebookPen }, { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "more", label: "More", Icon: CircleEllipsis },
];

export default function App() {
  const [config, setConfig] = useState<Config | null>(null); const [tab, setTab] = useState<Tab>("today"); const [selectedDate, setSelectedDate] = useState(""); const [refresh, setRefresh] = useState(0); const [notificationCount, setNotificationCount] = useState(0); const [error, setError] = useState("");
  const reportError = useCallback((value: unknown) => setError(value instanceof ApiError || value instanceof Error ? value.message : "Something went wrong."), []);
  const refreshAll = useCallback(() => { setRefresh(value => value + 1); void api.unresolved().then(items => setNotificationCount(items.length)).catch(reportError); }, [reportError]);
  useEffect(() => { void api.config().then(value => { setConfig(value); setSelectedDate(value.today); }).catch(reportError); }, [reportError]);
  useEffect(() => { if (config) refreshAll(); }, [config, refreshAll]);
  if (!config || !selectedDate) return <main className="startup"><img src="/app-icon.png" alt="" /><h1>Habit Tracker</h1><p>{error || "Opening your habits…"}</p></main>;
  const openDate = (date: string) => { setSelectedDate(date); setTab("today"); };
  return <div className="app-shell">
    <main className="content">
      {tab === "today" && <TodayPage config={config} selectedDate={selectedDate} onDate={setSelectedDate} onDataChange={refreshAll} reportError={reportError} />}
      {tab === "stats" && <StatsPage refresh={refresh} reportError={reportError} />}
      {tab === "notes" && <NotesPage refresh={refresh} reportError={reportError} onDataChange={refreshAll} />}
      {tab === "notifications" && <NotificationsPage refresh={refresh} reportError={reportError} openDate={openDate} />}
      {tab === "more" && <MorePage config={config} reportError={reportError} imported={() => { void api.config().then(value => { setConfig(value); setSelectedDate(value.today); refreshAll(); }); }} />}
    </main>
    <nav className="tab-bar" aria-label="Main navigation">{tabs.map(({ id, label, Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-label={id === "notifications" && notificationCount > 0 ? `${label}, ${notificationCount} unresolved dates` : label} aria-current={tab === id ? "page" : undefined}><span className="tab-icon"><Icon />{id === "notifications" && notificationCount > 0 ? <i aria-hidden="true">{notificationCount}</i> : null}</span><small aria-hidden="true">{label}</small></button>)}</nav>
    {error && <div className="error-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X /></button></div>}
  </div>;
}
