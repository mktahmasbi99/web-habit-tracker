import { useEffect, useRef } from "react";

let nextSheetId = 0;

// A sheet owns one history entry. Nested sheets consume Back one at a time.
export function useSheetHistory(name: string, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = window.history.state;
    const token = previous?.sheet?.name === name ? previous.sheet.id : `sheet-${++nextSheetId}`;
    if (previous?.sheet?.id !== token) {
      window.history.pushState({ ...previous, sheet: { id: token, name, depth: (previous?.sheet?.depth ?? 0) + 1 } }, "");
    }
    const pop = () => {
      if (window.history.state?.sheet?.id !== token) close.current();
    };
    window.addEventListener("popstate", pop);
    let mounted = true;
    return () => {
      mounted = false;
      window.removeEventListener("popstate", pop);
      // Route changes (for example opening a note from history) own their new entry.
      // Defer so a replacement sheet can claim the entry before we remove it.
      queueMicrotask(() => {
        if (!mounted && window.history.state?.sheet?.id === token && !document.querySelector(`[data-sheet-id="${token}"]`)) window.history.back();
      });
    };
  }, [name]);
}
