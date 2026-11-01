import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { api } from "../lib/api";
import type { HabitAdherenceDay } from "../lib/types";

export type AdherencePeriod = "week" | "year" | "all" | "custom";
const parse = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const shift = (value: string, days: number) => { const date = parse(value); date.setUTCDate(date.getUTCDate() + days); return iso(date); };
const weekStart = (value: string) => shift(value, -((parse(value).getUTCDay() + 6) % 7));
const fullDate = (value: string) => parse(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function HabitAdherence({ habitId, startDate, today, period, customStart, customEnd, onCustomStart, onCustomEnd, onNavigateToDate, onError }: {
  habitId: number; startDate: string; today: string; period: AdherencePeriod; customStart: string; customEnd: string;
  onCustomStart: (value: string) => void; onCustomEnd: (value: string) => void; onNavigateToDate: (date: string) => void; onError: (error: unknown) => void;
}) {
  const [viewYear, setViewYear] = useState(today.slice(0, 4));
  const [days, setDays] = useState<HabitAdherenceDay[] | null>(null);
  const [focusedDate, setFocusedDate] = useState("");
  const periodRange = period === "week" ? { start: weekStart(today), end: today }
    : period === "year" ? { start: `${viewYear}-01-01`, end: `${viewYear}-12-31` < today ? `${viewYear}-12-31` : today }
    : period === "all" ? { start: startDate, end: today }
        : { start: customStart, end: customEnd };
  const range = { ...periodRange, start: periodRange.start < startDate ? startDate : periodRange.start };
  const valid = range.start <= range.end && range.start <= today && range.end <= today;
  const displayRange = period === "year" ? { start: `${viewYear}-01-01`, end: `${viewYear}-12-31` } : range;

  useEffect(() => { if (period === "year") setViewYear(today.slice(0, 4)); }, [period, today]);

  useEffect(() => {
    if (!valid) { setDays(null); return; }
    const controller = new AbortController();
    setDays(null);
    void api.habitAdherence(habitId, range.start, range.end, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDays(value); })
      .catch(error => { if (!controller.signal.aborted) onError(error); });
    return () => controller.abort();
  }, [habitId, onError, range.end, range.start, valid]);

  const weeks = useMemo(() => {
    if (!days) return [];
    const byDate = new Map(days.map(day => [day.date, day.status]));
    const first = weekStart(displayRange.start);
    const count = Math.floor((parse(weekStart(displayRange.end)).getTime() - parse(first).getTime()) / 86_400_000 / 7) + 1;
    return Array.from({ length: count }, (_, week) => {
      const dates = Array.from({ length: 7 }, (_, weekday) => shift(first, week * 7 + weekday));
      const monthDate = dates.find(date => date >= displayRange.start && date <= displayRange.end && (date === displayRange.start || date.endsWith("-01")));
      return {
        month: monthDate ? parse(monthDate).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) : "",
        dates,
        statuses: dates.map(date => period === "year" && date >= displayRange.start && date <= displayRange.end && date < startDate ? "inactive" : date > today && date >= displayRange.start && date <= displayRange.end ? "future" : byDate.has(date) && date >= range.start && date <= range.end && date >= displayRange.start && date <= displayRange.end ? byDate.get(date)! : null),
      };
    });
  }, [days, displayRange.end, displayRange.start, period, range.end, range.start, startDate, today]);

  const interactiveDates = weeks.flatMap(week => week.dates.filter((_, weekday) => ["done", "missed", "pending"].includes(week.statuses[weekday] ?? "")));
  const tabStopDate = interactiveDates.includes(focusedDate) ? focusedDate : interactiveDates[0];
  const moveGridFocus = (event: KeyboardEvent<HTMLButtonElement>, week: number, weekday: number) => {
    const move = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[event.key];
    if (!move) return;
    event.preventDefault();
    const grid = event.currentTarget.closest("[role='grid']");
    let nextWeek = week + move[0], nextWeekday = weekday + move[1];
    while (grid && nextWeek >= 0 && nextWeek < weeks.length && nextWeekday >= 0 && nextWeekday < 7) {
      const next = grid.querySelector<HTMLButtonElement>(`button[data-week="${nextWeek}"][data-weekday="${nextWeekday}"]`);
      if (next) { next.focus(); return; }
      nextWeek += move[0]; nextWeekday += move[1];
    }
  };

  const done = days?.filter(day => day.status === "done").length ?? 0;
  const rate = days?.length ? Math.round(done / days.length * 100) : 0;
  const periodLabel = period === "week" ? `Weekly adherence · ${fullDate(range.start)}–${fullDate(range.end)}`
    : period === "year" ? `Yearly adherence · ${viewYear}`
      : period === "all" ? `All time adherence · ${fullDate(range.start)}–${fullDate(range.end)}`
        : `Custom adherence · ${fullDate(range.start)}–${fullDate(range.end)}`;
  const shiftYear = (offset: number) => setViewYear(String(Number(viewYear) + offset));

  return <section className="habit-adherence">
    {period === "custom" && <div className="timed-custom-range"><label>From<input type="date" min={startDate} max={today} value={customStart} onChange={event => onCustomStart(event.target.value)} /></label><label>To<input type="date" min={startDate} max={today} value={customEnd} onChange={event => onCustomEnd(event.target.value)} /></label></div>}
    {!valid ? <p className="secondary" role="status">Choose a valid date range.</p> : days === null ? <p className="secondary" role="status">Loading adherence…</p> : days.length === 0 ? <p className="secondary">No active days in this period.</p> : <>
      <div className={`adherence-heatmap-scroll${period === "year" ? " year" : ""}`}><div className={`adherence-heatmap${period === "year" ? " year" : ""}`} role="grid" aria-label={`${periodLabel}, ${range.start} to ${range.end}`}>
        <div className="adherence-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, ${period === "year" ? "minmax(0, 1fr)" : "12px"})` }} aria-hidden="true">{weeks.map((week, index) => week.month && <span key={index} style={{ gridColumn: index + 1 }}>{week.month}</span>)}</div>
        <div className="adherence-weekdays" aria-hidden="true"><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span /></div>
        <div className="adherence-day-rows">{Array.from({ length: 7 }, (_, weekday) => <div className="adherence-day-row" role="row" key={weekday}>{weeks.map((week, index) => { const status = week.statuses[weekday]; const day = week.dates[weekday]; const label = status === "done" ? "Done" : status === "missed" ? "Missed" : status === "pending" ? "Pending" : status === "future" ? "Future" : status === "inactive" ? "Before habit start" : null; const className = `adherence-cell${status === "done" ? " done" : status === "missed" ? " missed" : status === "pending" ? " pending" : status === "future" ? " future" : status === "inactive" ? " inactive" : " empty"}`; return label && status !== "inactive" && status !== "future" ? <button key={`${day}-${index}`} type="button" role="gridcell" className={className} title={`${day}: ${label}`} aria-label={`${day}, ${label}`} data-week={index} data-weekday={weekday} tabIndex={day === tabStopDate ? 0 : -1} onFocus={() => setFocusedDate(day)} onKeyDown={event => moveGridFocus(event, index, weekday)} onClick={() => onNavigateToDate(day)} /> : <i key={`${day}-${index}`} role={label ? "gridcell" : undefined} className={className} title={label ? `${day}: ${label}` : undefined} aria-label={label ? `${day}, ${label}` : undefined} />; })}</div>)}</div>
      </div></div>
      {period === "year" && <p className="status-calendar-key adherence-key"><span><i className="done-dot" />Done</span><span><i className="missed-cell-key" />Missed</span><span><i className="pending-dot" />Pending</span><span><i className="inactive-cell-key" />Before start</span></p>}
      {period === "year" && <div className="adherence-range-nav"><button type="button" aria-label="Previous year" disabled={Number(viewYear) <= Number(startDate.slice(0, 4))} onClick={() => shiftYear(-1)}>‹</button><strong>{viewYear}</strong><button type="button" aria-label="Next year" disabled={Number(viewYear) >= Number(today.slice(0, 4))} onClick={() => shiftYear(1)}>›</button></div>}
      <div className="adherence-summary"><div><span>{periodLabel}</span><strong>{rate}%</strong></div><div><span>Done days</span><strong>{done} / {days.length}</strong></div></div>
    </>}
  </section>;
}
