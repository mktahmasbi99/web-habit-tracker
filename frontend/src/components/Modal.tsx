import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lockScroll } from "../hooks/scrollLock";
import { useSheetHistory } from "../hooks/useSheetHistory";

export default function Modal({ title, titleDetail, titleEditor, children, onClose, wide = false, actions }: {
  title: string; titleDetail?: ReactNode; titleEditor?: ReactNode; children: ReactNode; onClose: () => void; wide?: boolean; actions?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const report = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("app-error", report);
    return () => window.removeEventListener("app-error", report);
  }, []);
  // Titles may change while renaming an activity; the history identity must not.
  const [identity] = useState(title);
  useSheetHistory(identity, onClose);
  useEffect(() => {
    const element = dialog.current!;
    element.dataset.sheetId = window.history.state?.sheet?.id ?? "";
    const trigger = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    element.showModal();
    const viewport = window.visualViewport;
    const resize = () => {
      element.style.setProperty("--viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      element.style.setProperty("--viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize);
      element.close();
      unlock();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialog} className={`modal-backdrop ${wide ? "modal-backdrop-wide" : ""}`} aria-label={title}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(item => item.getClientRects().length > 0);
      if (!items.length) { event.preventDefault(); return; }
      const index = items.indexOf(document.activeElement as HTMLElement);
      event.preventDefault(); items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal ${wide ? "modal-wide" : ""}`}>
      <header className="modal-head"><h2>{titleEditor ?? <>{title}{titleDetail}</>}</h2><div className="modal-head-actions">{actions}<button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div></header>
      <div className="modal-body">{error && <div className="inline-error" role="alert"><span>{error}</span><button className="small-button" onClick={() => setError("")}>Dismiss error</button></div>}{children}</div>
    </section>
  </dialog>, document.body);
}
