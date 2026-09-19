import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { TimedActivityTimer, TimedActivityTimers } from "../lib/types";

let audioContext: AudioContext | null = null;

export async function primeTimerAlerts() {
  if ("Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch { /* alerts are optional */ }
  }
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
  } catch { /* audio is optional */ }
}

function announceTimer(title: string, body: string) {
  try {
    if (audioContext) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = 880; gain.gain.value = 0.08;
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + 0.18);
    }
  } catch { /* audio is optional */ }
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch { /* notifications are optional */ }
}

export function liveTimer(timer: TimedActivityTimer, serverNow: string, clock: number): TimedActivityTimer {
  if (timer.status !== "running") return timer;
  const drift = Math.max(0, Math.floor((clock - Date.parse(serverNow)) / 1000));
  const elapsedSeconds = timer.mode === "stopwatch" ? timer.elapsedSeconds + drift : Math.min(timer.targetMinutes * 60, timer.elapsedSeconds + drift);
  const remainingSeconds = timer.mode === "stopwatch" ? 0 : Math.max(0, timer.targetMinutes * 60 - elapsedSeconds);
  return { ...timer, elapsedSeconds, remainingSeconds, percent: timer.targetMinutes ? Math.min(100, Math.round((elapsedSeconds / (timer.targetMinutes * 60)) * 1000) / 10) : 0 };
}

export function useTimedActivityTimers(enabled: boolean, changed: () => void, reportError: (error: unknown) => void) {
  const [snapshot, setSnapshot] = useState<TimedActivityTimers>({ serverNow: "1970-01-01T00:00:00Z", timers: [] });
  const [clock, setClock] = useState(0);
  const previous = useRef(new Map<number, TimedActivityTimer>());
  const announcedIntervals = useRef(new Map<number, number>());
  const changedRef = useRef(changed);
  useEffect(() => { changedRef.current = changed; }, [changed]);
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await api.timers();
      const nextMap = new Map(next.timers.map(timer => [timer.activityId, timer]));
      for (const timer of next.timers) {
        const old = previous.current.get(timer.activityId);
        if (old?.mode === "pomodoro" && old.phase !== timer.phase) {
          announceTimer(timer.phase === "ready_focus" ? "Pomodoro break complete" : "Pomodoro focus complete", timer.phase === "ready_focus" ? "Your next focus is ready." : "Your focus time was recorded.");
        }
      }
      if ([...previous.current].some(([id, timer]) => timer.mode === "countdown" && !nextMap.has(id) && timer.remainingSeconds <= 5)) {
        announceTimer("Countdown complete", "The completed duration was recorded.");
      }
      const changedState = previous.current.size !== nextMap.size || [...nextMap].some(([id, timer]) => previous.current.get(id)?.revision !== timer.revision);
      if (previous.current.size && changedState) changedRef.current();
      for (const id of announcedIntervals.current.keys()) if (!nextMap.has(id)) announcedIntervals.current.delete(id);
      previous.current = nextMap; setSnapshot(next); setClock(Date.now());
    } catch (error) { reportError(error); }
  }, [enabled, reportError]);
  useEffect(() => { if (!enabled) { previous.current.clear(); announcedIntervals.current.clear(); setSnapshot(current => ({ ...current, timers: [] })); return; } void load(); const interval = window.setInterval(() => void load(), 5_000); return () => window.clearInterval(interval); }, [enabled, load]);
  useEffect(() => { if (!enabled || snapshot.timers.length === 0) return; const interval = window.setInterval(() => { setClock(Date.now()); if (snapshot.timers.some(timer => timer.mode !== "stopwatch" && liveTimer(timer, snapshot.serverNow, Date.now()).remainingSeconds === 0)) void load(); }, 1_000); return () => window.clearInterval(interval); }, [enabled, load, snapshot]);
  useEffect(() => {
    for (const timer of snapshot.timers) {
      if (timer.mode !== "stopwatch" || timer.status !== "running" || !timer.intervalEnabled) continue;
      const interval = timer.intervalMinutes * 60;
      const completed = Math.floor(liveTimer(timer, snapshot.serverNow, clock).elapsedSeconds / interval);
      const announced = announcedIntervals.current.get(timer.activityId);
      if (announced === undefined) announcedIntervals.current.set(timer.activityId, completed);
      else if (completed > announced) {
        announcedIntervals.current.set(timer.activityId, completed);
        announceTimer("Stopwatch interval", `${timer.intervalMinutes}-minute interval complete.`);
      }
    }
  }, [clock, snapshot]);
  const replace = useCallback((timer: TimedActivityTimer | null, activityId: number) => {
    setSnapshot(current => ({ ...current, serverNow: new Date().toISOString(), timers: timer ? [...current.timers.filter(item => item.activityId !== activityId), timer] : current.timers.filter(item => item.activityId !== activityId) }));
    if (timer) { const wasKnown = previous.current.has(activityId); previous.current.set(activityId, timer); if (timer.mode === "stopwatch" && !wasKnown) announcedIntervals.current.set(activityId, 0); }
    else { previous.current.delete(activityId); announcedIntervals.current.delete(activityId); }
  }, []);
  return { snapshot, clock, load, replace };
}
