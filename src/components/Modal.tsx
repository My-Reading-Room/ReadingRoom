"use client";

import { useEffect, useRef } from "react";

/**
 * Accessible modal on the native <dialog>: focus is trapped, Escape closes,
 * and focus returns to the opener. Clicking the backdrop also closes it.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // No close() in cleanup: it fires onClose, which (with React's dev double
  // effect) would dismiss the dialog as soon as it opens. Unmounting removes it.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="btn icon-only" type="button" onClick={onClose} aria-label="Close dialog">
          ✕
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
