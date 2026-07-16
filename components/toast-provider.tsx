"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error";

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Call from any client component under <ToastProvider> to flash a message.
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// Renders a single bottom-center toast (styles: .toast / .toast.show in
// chemmemo.css). Auto-dismisses after 3s; a new toast resets the timer.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, kind: ToastKind = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, kind });
    setShow(true);
    timer.current = setTimeout(() => setShow(false), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={`toast${show ? " show" : ""}`} role="status" aria-live="polite">
        {toast && (
          <>
            <span
              className="tk"
              style={toast.kind === "error" ? { color: "var(--rose)" } : undefined}
            >
              {toast.kind === "error" ? "✕" : "✓"}
            </span>
            {toast.message}
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}
