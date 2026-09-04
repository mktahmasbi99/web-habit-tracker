import { X } from "lucide-react";
import type { ReactNode } from "react";

export default function Modal({ title, children, onClose, wide = false, actions }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean; actions?: ReactNode;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-head"><h2>{title}</h2><div className="modal-head-actions">{actions}<button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}
