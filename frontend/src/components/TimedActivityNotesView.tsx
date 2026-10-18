import { ChevronLeft, Plus, StickyNote } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { TimedActivityNote, TimedActivitySummary } from "../lib/types";

const prettyDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function TimedActivityNotesView({ activityId, today, refresh, active, portalIntoDialog = false, onClose, openNote, reportError }: {
  activityId: number; today: string; refresh: number; active: boolean; portalIntoDialog?: boolean; onClose: () => void;
  openNote: (date: string, create: boolean, activityName: string) => void; reportError: (error: unknown) => void;
}) {
  const [activity, setActivity] = useState<TimedActivitySummary | null>(null);
  const [notes, setNotes] = useState<TimedActivityNote[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false); const [dateError, setDateError] = useState("");
  const panel = useRef<HTMLDivElement>(null); const request = useRef(0); const noteTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let current = true; setLoading(true); setError("");
    void Promise.all([api.timedActivityDetail(activityId), api.timedActivityNotes(activityId)]).then(([detail, items]) => {
      if (current) { setActivity(detail); setNotes(items); }
    }).catch(value => { if (current) { setError(value instanceof Error ? value.message : "Could not load notes."); reportError(value); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [activityId, refresh, attempt, reportError]);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (active) { const trigger = noteTrigger.current; if (trigger?.isConnected) trigger.focus(); else panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); } }, [active]);

  const back = () => { request.current++; setChecking(false); onClose(); };
  const openTodayNote = async () => {
    if (!activity || activity.archived) return;
    const token = ++request.current; setChecking(true); setDateError("");
    try {
      const [note, activities] = await Promise.all([api.timedNote(activityId, today), api.timedActivities(today)]);
      if (token !== request.current) return;
      if (!note.exists && !activities.some(item => item.id === activityId)) {
        setDateError("This activity is not active today. You can still read and edit its saved notes."); return;
      }
      openNote(today, true, activity.name);
    } catch (value) { if (token === request.current) setDateError(value instanceof Error ? value.message : "Could not open note. Please retry."); }
    finally { if (token === request.current) setChecking(false); }
  };

  const view = <div ref={panel} className="habit-detail-view timed-notes-view" role="dialog" aria-modal={active || undefined} aria-label={activity ? `Notes for ${activity.name}` : "Timed activity notes"}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); back(); }
      if (event.key === "Tab") { const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')); if (!controls.length) return; const index = controls.indexOf(document.activeElement as HTMLElement); if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus(); } else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus(); } }
    }}>
    <header className="habit-detail-bar">
      <button className="round-bar-button" onClick={back} aria-label="Back to timed activity details"><ChevronLeft /></button>
      {!activity?.archived && <div className="detail-actions"><button ref={noteTrigger} disabled={!activity || loading || checking || Boolean(error)} onClick={() => void openTodayNote()} aria-label="Add timed activity note" aria-busy={checking}><Plus /></button></div>}
    </header>
    <main className="habit-detail-content">
      <h1>{activity?.name ?? "Notes"}</h1><h2>Notes</h2>
      {checking && <p role="status">Opening today’s note…</p>}{dateError && <p role="alert">{dateError}</p>}
      {loading ? <p role="status">Loading notes…</p> : error ? <div role="alert"><p>{error}</p><button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : notes.length ? <div className="note-history">{notes.map(note => <button key={note.date} onClick={event => { noteTrigger.current = event.currentTarget; openNote(note.date, false, activity?.name ?? note.activityName); }}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div> : <div className="habit-notes-empty"><StickyNote aria-hidden="true" /><h3>No notes yet</h3><p>{activity?.archived ? "There are no saved notes for this archived activity." : "Use + to add the first note for this activity."}</p></div>}
    </main>
  </div>;
  const dialog = portalIntoDialog ? document.querySelector<HTMLDialogElement>("dialog[open]") : null;
  return dialog ? createPortal(view, dialog) : view;
}
