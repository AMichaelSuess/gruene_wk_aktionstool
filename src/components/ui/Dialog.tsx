"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Dialog({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-ink/60 bg-white rounded-card border-ui border-line shadow-ui-xl p-0 max-w-lg w-full mx-4"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 border-b-ui border-line pb-4">
          <h2 className="font-headline font-bold text-xl case-ui text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-ink hover:bg-ink hover:text-white rounded-button w-8 h-8 flex items-center justify-center border-ui border-line text-xl leading-none font-bold transition-colors"
            aria-label="Schließen"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
