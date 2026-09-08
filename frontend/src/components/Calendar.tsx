import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { MonthDay } from "../lib/types";

const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const parse = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);

export default function Calendar({ selected, today, onSelect }: {
  selected: string; today: string; onSelect: (day: string) => void;
}) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [summary, setSummary] = useState<MonthDay[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setSummary([]); setError(""); setLoading(true);
    void api.month(month, controller.signal).then(value => { if (!controller.signal.aborted) setSummary(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load calendar."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, attempt]);
  const counts = useMemo(() => new Map(summary.map(day => [day.date, day])), [summary]);
  const first = parse(`${month}-01`);
  const leading = (first.getUTCDay() + 6) % 7;
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1, 12));
  const days = Math.round((next.getTime() - first.getTime()) / 86_400_000);
  const shift = (offset: number) => {
    const value = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1, 12));
    setMonth(iso(value).slice(0, 7));
  };
  return <div className="calendar">
    <div className="calendar-head">
      <button className="icon-button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></button>
      <strong>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
      <button className="icon-button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></button>
    </div>
    {error && <p role="status">{error} <button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    <div className="calendar-grid weekdays">{week.map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid days">
      {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: days }, (_, index) => {
        const value = `${month}-${String(index + 1).padStart(2, "0")}`;
        const dayCounts = counts.get(value);
        return <button key={value} className={`calendar-day ${value === selected ? "selected" : ""} ${value === today ? "today" : ""}`} onClick={() => onSelect(value)} aria-label={value} aria-pressed={value === selected} aria-current={value === today ? "date" : undefined} aria-describedby={`summary-${value}`}>
          <span>{index + 1}</span><span id={`summary-${value}`} className="visually-hidden">{loading ? "Loading completion summary" : error ? "Completion summary unavailable" : `${dayCounts?.done ?? 0} done, ${dayCounts?.missed ?? 0} missed`}</span><span className="markers" aria-hidden="true">{dayCounts?.done ? <i className="done-dot" /> : null}{dayCounts?.missed ? <i className="missed-dot" /> : null}</span>
        </button>;
      })}
    </div>
  </div>;
}

