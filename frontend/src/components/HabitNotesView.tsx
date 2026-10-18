import { ChevronLeft, Plus, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { HabitDetail, HabitNote } from "../lib/types";

const prettyDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

export default function HabitNotesView({ habitId, today, refresh, active, onClose, openNote }: {
  habitId: number; today: string; refresh: number; active: boolean;
  onClose: () => void; openNote: (date: string, create: boolean) => void;
}) {
  const [habit, setHabit] = useState<HabitDetail | null>(null);
  const [notes, setNotes] = useState<HabitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [dateError, setDateError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const noteTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    void Promise.all([api.habitDetail(habitId), api.habitNotes(habitId)]).then(([detail, items]) => {
      if (current) { setHabit(detail); setNotes(items); }
    }).catch(value => { if (current) setError(value instanceof Error ? value.message : "Could not load notes."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [habitId, refresh, attempt]);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (active) {
      const trigger = noteTrigger.current;
      if (trigger?.isConnected) trigger.focus();
      else panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [active]);

  const back = () => {
    request.current++;
    setChecking(false);
    onClose();
  };
  const openTodayNote = async () => {
    if (!habit || habit.archived) return;
    const token = ++request.current;
    setChecking(true); setDateError("");
    try {
      const [note, habits] = await Promise.all([api.note(habitId, today), api.habits(today)]);
      if (token !== request.current) return;
      if (!note.exists && !habits.some(item => item.id === habitId)) {
        setDateError("This habit is not active today. You can still read and edit its saved notes.");
        return;
      }
      // The existing editor loads the saved body even when entering edit mode.
      openNote(today, true);
    } catch (value) {
      if (token === request.current) setDateError(value instanceof Error ? value.message : "Could not open note. Please retry.");
    } finally { if (token === request.current) setChecking(false); }
  };

  return <div ref={panel} className="habit-detail-view" role="dialog" aria-modal={active || undefined}
    aria-label={habit ? `Notes for ${habit.name}` : "Habit notes"}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); back(); }
      if (event.key === "Tab") {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
        if (!controls.length) return;
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
      }
    }}>
    <header className="habit-detail-bar">
      <button className="round-bar-button" onClick={back} aria-label="Back to habit details"><ChevronLeft /></button>
      {!habit?.archived && <div className="detail-actions"><button disabled={!habit || loading || checking || Boolean(error)} onClick={event => { noteTrigger.current = event.currentTarget; void openTodayNote(); }} aria-label="Add habit note" aria-busy={checking}><Plus /></button></div>}
    </header>
    <main className="habit-detail-content">
      <h1>{habit?.name ?? "Notes"}</h1>
      <h2>Notes</h2>
      {checking && <p role="status">Opening today’s note…</p>}
      {dateError && <p role="alert">{dateError}</p>}
      {loading ? <p role="status">Loading notes…</p> : error ? <div role="alert"><p>{error}</p><button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : notes.length ? <div className="note-history">{notes.map(note => <button key={note.date} onClick={event => { noteTrigger.current = event.currentTarget; openNote(note.date, false); }}><strong>{prettyDate(note.date)}</strong><p>{note.body}</p></button>)}</div> : <div className="habit-notes-empty"><StickyNote aria-hidden="true" /><h3>No notes yet</h3><p>{habit?.archived ? "There are no saved notes for this archived habit." : "Use + to add the first note for this habit."}</p></div>}
    </main>
  </div>;
}
