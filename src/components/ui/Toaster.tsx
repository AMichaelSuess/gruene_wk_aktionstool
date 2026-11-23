"use client";

import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import { useEffect, type ReactNode, type RefObject } from "react";

// Kurze Rueckmeldungen nach Aktionen in Listen (Loeschen, Absagen, Import).
// Fehler in Formularen bleiben am Formular stehen, nicht als Toast.
//
// Fehler und Hinweise bleiben laenger stehen als Erfolgsmeldungen, damit
// auch langsamere Leser*innen sie erfassen; jede Meldung hat ein "X".
const DURATION_SHORT = 5000;
const DURATION_LONG = 10000;

type ToastOptions = { description?: ReactNode };

export const toast = {
  success: (message: ReactNode, options?: ToastOptions) =>
    sonnerToast.success(message, { duration: DURATION_SHORT, ...options }),
  info: (message: ReactNode, options?: ToastOptions) =>
    sonnerToast.info(message, { duration: DURATION_LONG, ...options }),
  warning: (message: ReactNode, options?: ToastOptions) =>
    sonnerToast.warning(message, { duration: DURATION_LONG, ...options }),
  error: (message: ReactNode, options?: ToastOptions) =>
    sonnerToast.error(message, { duration: DURATION_LONG, ...options }),
};

// Leisten, die unten am Bildschirm kleben (z. B. die Auswahlleiste im
// Dashboard), schieben die Toasts per --toast-lift nach oben, solange sie
// sichtbar sind. Sonst lagen die Meldungen unter der Leiste.
export function useToastLift(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--toast-lift", `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--toast-lift");
    };
  }, [ref, active]);
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const icons = {
  success: (
    <Icon>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  ),
  error: (
    <Icon>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  ),
  warning: (
    <Icon>
      <path d="M12 5v9" />
      <path d="M12 19h.01" />
    </Icon>
  ),
  info: (
    <Icon>
      <path d="M12 11v8" />
      <path d="M12 5h.01" />
    </Icon>
  ),
  close: (
    <Icon>
      <path d="M7 7l10 10M17 7L7 17" />
    </Icon>
  ),
};

// Signalfarbe als Band links mit dem Icon darin. Helle Signalfarben
// (warning) tragen ein dunkles Icon, dunkle ein weisses.
// Kein ::before/::after: die nutzt sonner selbst fuer die Hover-Luecke.
const signal = {
  success: "[&_[data-icon]]:bg-success [&_[data-icon]]:text-white",
  error: "[&_[data-icon]]:bg-danger [&_[data-icon]]:text-white",
  warning: "[&_[data-icon]]:bg-warning [&_[data-icon]]:text-ink",
  info: "[&_[data-icon]]:bg-info [&_[data-icon]]:text-white",
};

export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      offset={{ bottom: "calc(24px + var(--toast-lift, 0px))" }}
      mobileOffset={{ bottom: "calc(16px + var(--toast-lift, 0px))" }}
      visibleToasts={4}
      closeButton
      icons={icons}
      containerAriaLabel="Benachrichtigungen"
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "Meldung schließen",
        classNames: {
          // sonner setzt eine eigene Schrift am Container, daher font-sans
          toast:
            "relative flex w-full items-stretch overflow-hidden rounded-card border-ui border-line bg-white font-sans text-ink shadow-ui-lg",
          icon: "flex w-12 shrink-0 items-center justify-center",
          content: "flex min-w-0 flex-col justify-center gap-0.5 py-3 pl-4 pr-11",
          title: "text-sm font-bold leading-snug",
          description: "text-sm leading-snug text-ink/80",
          closeButton:
            "absolute right-2 top-2 flex size-8 items-center justify-center rounded-button text-ink/70 transition-colors hover:bg-muted hover:text-ink focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus",
          ...signal,
        },
      }}
    />
  );
}
