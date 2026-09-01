import {
  Bell, BellOff, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight,
  CircleCheck, CircleEllipsis, Download, FileUp, Flame, NotebookPen, Plus, Save, StickyNote, Trash2, X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Calendar from "./components/Calendar";
import Modal from "./components/Modal";
import { api, ApiError } from "./lib/api";
import type { BackupFile, BackupSettings, Config, HabitDay, HabitNote, NoteSummary, Statistic, Status, SystemNotification, Unresolved } from "./lib/types";

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
  const isRelativeDay = selectedDate === config.today || selectedDate === shiftDay(config.today, -1) || selectedDate === shiftDay(config.today, 1);
  const title = selectedDate === config.today ? "Today" : selectedDate === shiftDay(config.today, -1) ? "Yesterday" : selectedDate === shiftDay(config.today, 1) ? "Tomorrow" : prettyDate(selectedDate);
  const setStatus = async (habit: HabitDay, status: Status) => {
    try { await api.setStatus(habit.id, selectedDate, status); await load(); onDataChange(); }
    catch (error) { reportError(error); }
  };
  return <section className="page today-page">
    <header className="day-header">
      <button className="icon-button accent" onClick={() => onDate(shiftDay(selectedDate, -1))} aria-label="Previous day"><ChevronLeft /></button>
      <button className="day-title" onClick={() => setCalendar(true)}><h1>{title}</h1>{isRelativeDay && <small>{selectedDate}</small>}</button>
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
  return <Modal title={habit.name} onClose={onClose}><div className="note-date">{prettyDate(date)}</div>{loading ? <div className="loading">Loading note…</div> : <form className="form" onSubmit={event => { event.preventDefault(); if (saving) return; setSaving(true); void api.saveNote(habit.id, date, body).then(onSaved).catch(reportError).finally(() => setSaving(false)); }}>
    <label className="visually-hidden" htmlFor="note-body">Note</label><textarea id="note-body" autoFocus value={body} maxLength={20_000} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.ctrlKey && event.key === "Enter" && !saving) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Add a note for this day…" />
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

function NotificationsPage({ refresh, reportError, openDate, onDataChange }: { refresh: number; reportError: (error: unknown) => void; openDate: (date: string) => void; onDataChange: () => void }) {
  const [items, setItems] = useState<Unresolved[]>([]); const [systemItems, setSystemItems] = useState<SystemNotification[]>([]);
  useEffect(() => { void Promise.all([api.unresolved(), api.systemNotifications()]).then(([unresolved, system]) => { setItems(unresolved); setSystemItems(system); }).catch(reportError); }, [refresh, reportError]);
  const dismiss = async (item: SystemNotification) => {
    if (typeof item.id !== "number") return;
    try { await api.dismissSystemNotification(item.id); setSystemItems(value => value.filter(current => current.id !== item.id)); onDataChange(); }
    catch (error) { reportError(error); }
  };
  return <section className="page list-page"><h1>Notifications</h1>{systemItems.length > 0 && <div className="settings-group system-notifications"><h2>System</h2>{systemItems.map(item => <div className="system-notification" key={item.id}><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString("en-GB")}</small></div>{typeof item.id === "number" && <button className="small-button" onClick={() => void dismiss(item)}>Dismiss</button>}</div>)}</div>}{items.length === 0 && systemItems.length === 0 ? <EmptyState icon={<BellOff />} title="No notifications" detail="All past habits are resolved and the system is running normally." /> : items.length > 0 && <div className="inset-list">{items.map(item => <button className="list-row" key={item.date} onClick={() => openDate(item.date)}><span><strong>{prettyDate(item.date)}</strong><small>{item.pendingCount} {item.pendingCount === 1 ? "habit" : "habits"} unresolved</small></span><ChevronRight /></button>)}</div>}</section>;
}

const backupLabels: Record<BackupFile["category"], string> = { daily: "Daily", weekly: "Weekly", "on-demand": "On-demand", "pre-import": "Pre-import", "pre-restore": "Pre-restore" };
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const backupSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const saveDownload = ({ blob, filename }: { blob: Blob; filename: string }) => {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
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
    <div className="settings-group"><h2>Coming next</h2><div className="roadmap-row">Habit management and archive</div><div className="roadmap-row">Challenges</div><div className="roadmap-row">Installable PWA</div></div>
    {pendingAction && <Modal title={pendingAction.type === "restore" ? "Restore backup" : "Delete backup"} onClose={() => { setPendingAction(null); setActionConfirmation(""); }}><div className="confirmation-panel"><p>{pendingAction.type === "restore" ? "The current database will be replaced after validation. A safety backup is created first." : "This permanently deletes the selected backup."}</p><strong>{pendingAction.item.filename}</strong><label>Type <strong>{pendingAction.type === "restore" ? "RESTORE" : "DELETE"}</strong> to continue<input value={actionConfirmation} onChange={event => setActionConfirmation(event.target.value)} autoCapitalize="characters" autoFocus /></label><button className="danger-button" disabled={actionConfirmation !== (pendingAction.type === "restore" ? "RESTORE" : "DELETE") || backupWorking} onClick={() => void runBackupAction()}>{pendingAction.type === "restore" ? "Restore database" : "Delete backup"}</button></div></Modal>}
  </section>;
}

const tabs: { id: Tab; label: string; Icon: typeof Check }[] = [
  { id: "today", label: "Today", Icon: CircleCheck }, { id: "stats", label: "Stats", Icon: ChartNoAxesCombined },
  { id: "notes", label: "Notes", Icon: NotebookPen }, { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "more", label: "More", Icon: CircleEllipsis },
];

export default function App() {
  const [config, setConfig] = useState<Config | null>(null); const [tab, setTab] = useState<Tab>("today"); const [selectedDate, setSelectedDate] = useState(""); const [refresh, setRefresh] = useState(0); const [notificationCount, setNotificationCount] = useState(0); const [error, setError] = useState("");
  const reportError = useCallback((value: unknown) => setError(value instanceof ApiError || value instanceof Error ? value.message : "Something went wrong."), []);
  const refreshAll = useCallback(() => { setRefresh(value => value + 1); void Promise.all([api.unresolved(), api.systemNotifications()]).then(([items, system]) => setNotificationCount(items.length + system.length)).catch(reportError); }, [reportError]);
  useEffect(() => { void api.config().then(value => { setConfig(value); setSelectedDate(value.today); }).catch(reportError); }, [reportError]);
  useEffect(() => { if (config) refreshAll(); }, [config, refreshAll]);
  useEffect(() => { if (!config) return; const timer = window.setInterval(() => { void Promise.all([api.unresolved(), api.systemNotifications()]).then(([items, system]) => setNotificationCount(items.length + system.length)).catch(reportError); }, 60_000); return () => window.clearInterval(timer); }, [config, reportError]);
  if (!config || !selectedDate) return <main className="startup"><img src="/app-icon.png" alt="" /><h1>Habit Tracker</h1><p>{error || "Opening your habits…"}</p></main>;
  const openDate = (date: string) => { setSelectedDate(date); setTab("today"); };
  return <div className="app-shell">
    <main className="content">
      {tab === "today" && <TodayPage config={config} selectedDate={selectedDate} onDate={setSelectedDate} onDataChange={refreshAll} reportError={reportError} />}
      {tab === "stats" && <StatsPage refresh={refresh} reportError={reportError} />}
      {tab === "notes" && <NotesPage refresh={refresh} reportError={reportError} onDataChange={refreshAll} />}
      {tab === "notifications" && <NotificationsPage refresh={refresh} reportError={reportError} openDate={openDate} onDataChange={refreshAll} />}
      {tab === "more" && <MorePage config={config} reportError={reportError} imported={() => { void api.config().then(value => { setConfig(value); setSelectedDate(value.today); refreshAll(); }); }} />}
    </main>
    <nav className="tab-bar" aria-label="Main navigation">{tabs.map(({ id, label, Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-label={id === "notifications" && notificationCount > 0 ? `${label}, ${notificationCount} unresolved dates` : label} aria-current={tab === id ? "page" : undefined}><span className="tab-icon"><Icon />{id === "notifications" && notificationCount > 0 ? <i aria-hidden="true">{notificationCount}</i> : null}</span></button>)}</nav>
    {error && <div className="error-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X /></button></div>}
  </div>;
}
