import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { HabitMonth } from "../lib/types";
import HabitAdherence, { type AdherencePeriod } from "./HabitAdherence";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const parse = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);

export default function HabitStatusCalendar({ habitId, today, refreshKey, onError, onNavigateToDate }: { habitId: number; today: string; refreshKey: string; onError: (error: unknown) => void; onNavigateToDate: (date: string) => void }) {
  const [period, setPeriod] = useState<"month" | AdherencePeriod>("month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [customStart, setCustomStart] = useState(refreshKey > today ? today : refreshKey);
  const [customEnd, setCustomEnd] = useState(today);
  const [data, setData] = useState<HabitMonth | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const first = parse(`${month}-01`);
  const leading = (first.getUTCDay() + 6) % 7;
  const shift = (offset: number) => setMonth(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1, 12))).slice(0, 7));
  const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  useEffect(() => { if (period === "month") setMonth(today.slice(0, 7)); }, [period, today]);

  useEffect(() => {
    if (period !== "month") { setData(null); setError(""); return; }
    const controller = new AbortController();
    setData(null); setError("");
    void api.habitMonth(habitId, month, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(value => { if (!controller.signal.aborted) { setError("Could not load monthly status."); onError(value); } });
    return () => controller.abort();
  }, [habitId, month, period, attempt, refreshKey, onError]);

  const activeDays = data?.days.filter(day => day.active) ?? [];
  const doneDays = activeDays.filter(day => day.status === "done").length;

  return <section className="habit-calendar-view">
    <label className="habit-calendar-period" htmlFor="habit-calendar-period">Period<select id="habit-calendar-period" value={period} onChange={event => setPeriod(event.target.value as "month" | AdherencePeriod)}><option value="month">Month</option><option value="week">Week</option><option value="year">Year</option><option value="all">All time</option><option value="custom">Custom</option></select></label>
    {period === "month" ? <section className="habit-status-calendar" aria-labelledby="monthly-status-heading">
      <h2 id="monthly-status-heading">Monthly status</h2>
      <div className="calendar">
        <div className="calendar-head">
          <button className="icon-button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></button>
          <strong>{title}</strong>
          <button className="icon-button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></button>
        </div>
        {error && <p role="status">{error} <button className="small-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
        <div className="calendar-grid weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid days" role="grid" aria-label={`${title} habit status`}>
          {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} role="presentation" />)}
          {data?.days.map(day => day.active ? <button key={day.date} className={`calendar-day habit-status-day active ${day.date === today ? "today" : ""}`} role="gridcell" onClick={() => onNavigateToDate(day.date)} aria-label={`${day.date}, ${day.status}`}><span>{Number(day.date.slice(-2))}</span><span className="markers" aria-hidden="true"><i className={`${day.status}-dot`} /></span></button> : <span key={day.date} className="calendar-day habit-status-day inactive" role="gridcell" aria-label={`${day.date}, inactive`}><span>{Number(day.date.slice(-2))}</span></span>)}
        </div>
      </div>
      <p className="status-calendar-key"><span><i className="done-dot" />Done</span><span><i className="missed-dot" />Missed</span><span><i className="pending-dot" />Pending</span></p>
      {data && (activeDays.length ? <div className="adherence-summary"><div><span>Monthly adherence · {title}</span><strong>{Math.round(doneDays / activeDays.length * 100)}%</strong></div><div><span>Done days</span><strong>{doneDays} / {activeDays.length}</strong></div></div> : <p className="secondary">No active days in this month.</p>)}
    </section> : <HabitAdherence habitId={habitId} startDate={refreshKey} today={today} period={period} customStart={customStart} customEnd={customEnd} onCustomStart={setCustomStart} onCustomEnd={setCustomEnd} onNavigateToDate={onNavigateToDate} onError={onError} />}
  </section>;
}
