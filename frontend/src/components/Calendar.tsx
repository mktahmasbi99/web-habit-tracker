import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const parse = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);

export default function Calendar({ selected, today, onSelect, onJumpToToday }: {
  selected: string; today: string; onSelect: (day: string) => void; onJumpToToday: () => void;
}) {
  const [month, setMonth] = useState(selected.slice(0, 7));
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
    <div className="calendar-grid weekdays">{week.map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid days">
      {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: days }, (_, index) => {
        const value = `${month}-${String(index + 1).padStart(2, "0")}`;
        return <button key={value} className={`calendar-day ${value === selected ? "selected" : ""} ${value === today ? "today" : ""}`} onClick={() => onSelect(value)} aria-label={value} aria-pressed={value === selected} aria-current={value === today ? "date" : undefined}><span>{index + 1}</span></button>;
      })}
    </div>
    <button className="form-submit calendar-jump" onClick={onJumpToToday}>Jump to today</button>
  </div>;
}
