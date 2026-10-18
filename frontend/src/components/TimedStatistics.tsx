import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { TimedActivityStatistics as StatisticsData } from "../lib/types";

type Period = "week" | "month" | "sixMonths" | "year" | "all" | "custom";
const parse = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const moveDays = (value: string, days: number) => { const date = parse(value); date.setUTCDate(date.getUTCDate() + days); return iso(date); };
const startOfMonth = (value: string, monthOffset = 0) => { const date = parse(value); return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1, 12))); };
const startOfWeek = (value: string) => { const date = parse(value); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return iso(date); };
const minutesLabel = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
const shortDay = (value: string) => parse(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function rangeFor(period: Period, selected: string, startDate: string, customStart: string, customEnd: string) {
  if (period === "week") return { start: startOfWeek(selected), end: selected };
  if (period === "month") return { start: startOfMonth(selected), end: selected };
  if (period === "sixMonths") return { start: startOfMonth(selected, -5), end: selected };
  if (period === "year") return { start: `${selected.slice(0, 4)}-01-01`, end: selected };
  if (period === "all") return { start: startDate, end: selected };
  return { start: customStart, end: customEnd };
}

export default function TimedStatistics({ activityId, activityStart, selectedDate, selectedMinutes, reportError }: {
  activityId: number; activityStart: string; selectedDate: string; selectedMinutes: number; reportError: (error: unknown) => void;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [hoveredBucketKey, setHoveredBucketKey] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState(() => moveDays(selectedDate, -6) < activityStart ? activityStart : moveDays(selectedDate, -6));
  const [customEnd, setCustomEnd] = useState(selectedDate);
  const range = rangeFor(period, selectedDate, activityStart, customStart, customEnd);
  const [data, setData] = useState<StatisticsData | null>(null);
  useEffect(() => {
    let active = true;
    if (range.start > range.end || range.start < activityStart || range.end > selectedDate) { setData(null); return () => { active = false; }; }
    void api.timedStatistics(activityId, range.start, range.end).then(result => { if (active) setData(result); }).catch(error => { if (active) reportError(error); });
    return () => { active = false; };
  }, [activityId, activityStart, selectedDate, range.start, range.end, reportError]);

  const buckets = useMemo(() => {
    const daily = new Map((data?.days ?? []).map(day => [day.date, day.minutes]));
    const totalDays = Math.max(0, Math.round((parse(range.end).getTime() - parse(range.start).getTime()) / 86_400_000) + 1);
    const mode = period === "week" || period === "month" || (period === "custom" && totalDays <= 45) ? "day" : period === "sixMonths" || period === "year" || period === "all" || (period === "custom" && totalDays > 180) ? "month" : "week";
    const groups = new Map<string, { label: string; minutes: number }>();
    for (let offset = 0; offset < totalDays; offset++) {
      const date = moveDays(range.start, offset);
      const key = mode === "day" ? date : mode === "week" ? startOfWeek(date) : startOfMonth(date);
      const label = mode === "day" ? shortDay(date) : mode === "week" ? shortDay(key) : parse(key).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
      const item = groups.get(key) ?? { label, minutes: 0 };
      item.minutes += daily.get(date) ?? 0;
      groups.set(key, item);
    }
    return [...groups.entries()].map(([key, item]) => ({ key, ...item }));
  }, [data, period, range.start, range.end]);
  useEffect(() => { setSelectedBucketKey(null); setHoveredBucketKey(null); }, [period, range.start, range.end]);
  const activeBucket = buckets.find(bucket => bucket.key === hoveredBucketKey) ?? buckets.find(bucket => bucket.key === selectedBucketKey);
  const total = data?.days.reduce((sum, day) => sum + day.minutes, 0) ?? 0;
  const maxValue = Math.max(1, ...buckets.map(bucket => bucket.minutes));
  const chartWidth = Math.max(640, buckets.length * 34);
  const plotTop = 18, plotHeight = 150, barSlot = chartWidth / Math.max(1, buckets.length), barWidth = Math.max(4, Math.min(24, barSlot * .62));
  const activeBucketIndex = activeBucket ? buckets.findIndex(bucket => bucket.key === activeBucket.key) : -1;
  const activeBucketHeight = activeBucket ? (activeBucket.minutes ? Math.max(2, activeBucket.minutes / maxValue * plotHeight) : 0) : 0;
  const activeLabel = activeBucket ? minutesLabel(activeBucket.minutes) : "";
  const activeLabelWidth = Math.max(38, activeLabel.length * 6 + 12);
  const activeLabelX = activeBucketIndex < 0 ? 0 : Math.max(0, Math.min(chartWidth - activeLabelWidth, activeBucketIndex * barSlot + barSlot / 2 - activeLabelWidth / 2));
  const activeLabelY = activeBucketIndex < 0 ? 0 : Math.max(18, plotTop + plotHeight - activeBucketHeight - 27);
  const periodLabel: Record<Period, string> = { week: "Week", month: "Month", sixMonths: "6 months", year: "Year", all: "All time", custom: "Custom" };
  const options: Period[] = ["week", "month", "sixMonths", "year", "all", "custom"];
  const validCustom = customStart >= activityStart && customStart <= customEnd && customEnd <= selectedDate;

  return <section className="timed-statistics">
    <div className="timed-statistics-heading"><h3>Time chart</h3></div>
    {validCustom || period !== "custom" ? <>
      <div className="timed-chart-scroll"><svg className="timed-chart" viewBox={`0 0 ${chartWidth} 220`} role="img" aria-label={`${periodLabel[period]} time chart from ${range.start} to ${range.end}`}>
        <line x1="0" y1={plotTop + plotHeight} x2={chartWidth} y2={plotTop + plotHeight} className="timed-chart-axis" />
        <text x="0" y="12" className="timed-chart-scale">{minutesLabel(maxValue)}</text>
        {buckets.map((bucket, index) => { const height = bucket.minutes ? Math.max(2, bucket.minutes / maxValue * plotHeight) : 0; const x = index * barSlot + (barSlot - barWidth) / 2; const showLabel = buckets.length <= 14 || index % Math.ceil(buckets.length / 12) === 0 || index === buckets.length - 1; const active = activeBucket?.key === bucket.key; return <g key={bucket.key} className={`timed-chart-point ${active ? "active" : ""}`} role="button" tabIndex={0} aria-label={`${bucket.label} total: ${minutesLabel(bucket.minutes)}`} aria-pressed={selectedBucketKey === bucket.key} onPointerEnter={() => setHoveredBucketKey(bucket.key)} onPointerLeave={() => setHoveredBucketKey(null)} onFocus={() => setHoveredBucketKey(bucket.key)} onBlur={() => setHoveredBucketKey(null)} onClick={() => setSelectedBucketKey(bucket.key)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedBucketKey(bucket.key); } }}><title>{bucket.label}: {minutesLabel(bucket.minutes)}{active ? " (selected interval)" : ""}</title><rect className="timed-chart-bar" x={x} y={plotTop + plotHeight - height} width={barWidth} height={height} rx="3" /><rect className="timed-chart-hit-area" x={index * barSlot} y={plotTop} width={barSlot} height={plotHeight} /><text className="timed-chart-label" textAnchor="middle" x={x + barWidth / 2} y="190">{showLabel ? bucket.label : ""}</text></g>; })}
        {activeBucket && activeBucketIndex >= 0 && <g className="timed-chart-value" aria-hidden="true"><rect x={activeLabelX} y={activeLabelY} width={activeLabelWidth} height="21" rx="6" /><text x={activeLabelX + activeLabelWidth / 2} y={activeLabelY + 14} textAnchor="middle">{activeLabel}</text></g>}
      </svg></div>
    </> : <p className="secondary" role="status">Choose a valid date range within this activity.</p>}
    <div className="timed-chart-controls">
      <div className="timed-period-picker"><label htmlFor="timed-chart-period">Chart period</label><select id="timed-chart-period" aria-label="Chart period" value={period} onChange={event => setPeriod(event.target.value as Period)}>{options.map(option => <option key={option} value={option}>{periodLabel[option]}</option>)}</select></div>
      {period === "custom" && <div className="timed-custom-range"><label>From<input type="date" min={activityStart} max={selectedDate} value={customStart} onChange={event => setCustomStart(event.target.value)} /></label><label>To<input type="date" min={activityStart} max={selectedDate} value={customEnd} onChange={event => setCustomEnd(event.target.value)} /></label></div>}
    </div>
    {validCustom || period !== "custom" ? <div className="timed-selected-head"><div><span>{shortDay(selectedDate)} activity</span><strong>{minutesLabel(selectedMinutes)}</strong></div><div><span>{periodLabel[period]} total · {shortDay(range.start)}–{shortDay(range.end)}</span><strong>{minutesLabel(total)}</strong></div></div> : null}
  </section>;
}
