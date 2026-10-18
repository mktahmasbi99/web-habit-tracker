import { ChevronLeft, Plus, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ActivityLogNote, ActivityLogSummary } from "../lib/types";

const prettyDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function ActivityLogNotesView({ activityId, activityName, today, refresh, active, onClose, openNote, reportError }: {
  activityId: number; activityName: string; today: string; refresh: number; active: boolean; onClose: () => void;
  openNote: (date: string, create: boolean) => void; reportError: (error: unknown) => void;
}) {
  const [notes, setNotes] = useState<ActivityLogNote[]>([]); const [activity, setActivity] = useState<ActivityLogSummary | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0); const [checking, setChecking] = useState(false); const [dateError, setDateError] = useState("");
  const panel = useRef<HTMLDivElement>(null); const request = useRef(0); const noteTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    let current = true; setLoading(true); setError("");
    void Promise.all([api.activityLogDetail(activityId), api.activityLogNotes(activityId)]).then(([detail, items]) => { if (current) { setActivity(detail); setNotes(items); } })
      .catch(value => { if (current) { setError(value instanceof Error ? value.message : "Could not load notes."); reportError(value); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [activityId, refresh, attempt, reportError]);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (active) { const trigger = noteTrigger.current; if (trigger?.isConnected) trigger.focus(); else panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); } }, [active]);
  const back = () => { request.current++; setChecking(false); onClose(); };
  const addToday = async () => {
    if (activity?.archived) return;
    const token = ++request.current; setChecking(true); setDateError("");
    try {
      const [note, logs] = await Promise.all([api.activityLogNote(activityId, today), api.activityLogs(today)]);
      if (token !== request.current) return;
      if (!note.exists && !logs.some(item => item.id === activityId)) { setDateError("This activity is not active today. You can still read and edit its saved notes."); return; }
      openNote(today, true);
    } catch (value) { if (token === request.current) setDateError(value instanceof Error ? value.message : "Could not open note. Please retry."); }
    finally { if (token === request.current) setChecking(false); }
  };
  return <div ref={panel} className="habit-detail-view" role="dialog" aria-modal={active || undefined} aria-label={`Notes for ${activityName}`} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); back(); }
    if (event.key === "Tab") { const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')); if (!controls.length) return; const index = controls.indexOf(document.activeElement as HTMLElement); if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus(); } else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus(); } }
  }}>
    <header className="habit-detail-bar"><button className="round-bar-button" onClick={back} aria-label="Back to activity log details"><ChevronLeft /></button>{!activity?.archived && <div className="detail-actions"><button ref={noteTrigger} disabled={loading || checking || Boolean(error)} onClick={() => void addToday()} aria-label="Add activity log note" aria-busy={checking}><Plus /></button></div>}</header>
    <main className="habit-detail-content"><h1>{activityName}</h1><h2>Notes</h2>{checking && <p role="status">Opening today’s note…</p>}{dateError && <p role="alert">{dateError}</p>}
      {loading ? <p role="status">Loading notes…</p> : error ? <div role="alert"><p>{error}</p><button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : notes.length ? <div className="note-history">{notes.map(note => <button key={note.date} onClick={event => { noteTrigger.current = event.currentTarget; openNote(note.date, false); }}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div> : <div className="habit-notes-empty"><StickyNote aria-hidden="true" /><h3>No notes yet</h3><p>{activity?.archived ? "There are no saved notes for this archived activity." : "Use + to add the first note for this activity."}</p></div>}
    </main>
  </div>;
}
