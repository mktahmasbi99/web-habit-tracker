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
  const elapsedSeconds = Math.min(timer.targetMinutes * 60, timer.elapsedSeconds + drift);
  const remainingSeconds = Math.max(0, timer.targetMinutes * 60 - elapsedSeconds);
  return { ...timer, elapsedSeconds, remainingSeconds, percent: Math.min(100, Math.round((elapsedSeconds / (timer.targetMinutes * 60)) * 1000) / 10) };
}

export function useTimedActivityTimers(enabled: boolean, changed: () => void, reportError: (error: unknown) => void) {
  const [snapshot, setSnapshot] = useState<TimedActivityTimers>({ serverNow: "1970-01-01T00:00:00Z", timers: [] });
  const [clock, setClock] = useState(0);
  const previous = useRef(new Map<number, TimedActivityTimer>());
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
      previous.current = nextMap; setSnapshot(next); setClock(Date.now());
    } catch (error) { reportError(error); }
  }, [enabled, reportError]);
  useEffect(() => { if (!enabled) { previous.current.clear(); setSnapshot(current => ({ ...current, timers: [] })); return; } void load(); const interval = window.setInterval(() => void load(), 5_000); return () => window.clearInterval(interval); }, [enabled, load]);
  useEffect(() => { if (!enabled || snapshot.timers.length === 0) return; const interval = window.setInterval(() => { setClock(Date.now()); if (snapshot.timers.some(timer => liveTimer(timer, snapshot.serverNow, Date.now()).remainingSeconds === 0)) void load(); }, 1_000); return () => window.clearInterval(interval); }, [enabled, load, snapshot]);
  const replace = useCallback((timer: TimedActivityTimer | null, activityId: number) => {
    setSnapshot(current => ({ ...current, serverNow: new Date().toISOString(), timers: timer ? [...current.timers.filter(item => item.activityId !== activityId), timer] : current.timers.filter(item => item.activityId !== activityId) }));
    if (timer) previous.current.set(activityId, timer); else previous.current.delete(activityId);
  }, []);
  return { snapshot, clock, load, replace };
}
