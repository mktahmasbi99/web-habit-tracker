import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { HabitMonth } from "../lib/types";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const parse = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);

export default function HabitStatusCalendar({ habitId, today, refreshKey, onError }: { habitId: number; today: string; refreshKey: string; onError: (error: unknown) => void }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<HabitMonth | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const first = parse(`${month}-01`);
  const leading = (first.getUTCDay() + 6) % 7;
  const shift = (offset: number) => setMonth(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1, 12))).slice(0, 7));

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    void api.habitMonth(habitId, month, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(value => { if (!controller.signal.aborted) { setError("Could not load monthly status."); onError(value); } });
    return () => controller.abort();
  }, [habitId, month, attempt, refreshKey, onError]);

  return <section className="habit-status-calendar" aria-labelledby="monthly-status-heading">
    <h2 id="monthly-status-heading">Monthly status</h2>
    <div className="calendar">
      <div className="calendar-head">
        <button className="icon-button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></button>
        <strong>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
        <button className="icon-button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></button>
      </div>
      {error && <p role="status">{error} <button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
      <div className="calendar-grid weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid days" role="grid" aria-label={`${first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} habit status`}>
        {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} role="presentation" />)}
        {data?.days.map(day => <span key={day.date} className={`calendar-day habit-status-day ${day.date === today ? "today" : ""} ${day.active ? "active" : "inactive"}`} role="gridcell" aria-label={`${day.date}${day.active ? `, ${day.status}` : ", inactive"}`}><span>{Number(day.date.slice(-2))}</span>{day.active && <span className="markers" aria-hidden="true"><i className={`${day.status}-dot`} /></span>}</span>)}
      </div>
    </div>
    <p className="status-calendar-key"><span><i className="done-dot" />Done</span><span><i className="missed-dot" />Missed</span><span><i className="pending-dot" />Pending</span></p>
  </section>;
}
