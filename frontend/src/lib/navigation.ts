let leaveGuard: (() => boolean) | null = null;
let guardedPath = "";
let restoring = false;

export function registerLeaveGuard(guard: () => boolean) {
  leaveGuard = guard;
  guardedPath = window.location.pathname;
  return () => { if (leaveGuard === guard) { leaveGuard = null; restoring = false; } };
}

// The route listener invokes this before changing React state. popstate is
// dispatched at Window, so a later capture listener cannot reliably precede it.
export function allowHistoryNavigation() {
  if (restoring) { restoring = false; return false; }
  if (leaveGuard && window.location.pathname !== guardedPath && !leaveGuard()) {
    restoring = true;
    window.history.forward();
    return false;
  }
  return true;
}

export function closeHistoryRoute() {
  window.history.go(-1 - (window.history.state?.sheet?.depth ?? 0));
}
