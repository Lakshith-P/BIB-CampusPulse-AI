import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Download, Info, Paperclip, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- toasts
const ToastContext = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

const TOAST_ICON = { success: CheckCircle2, error: XCircle, info: Info };
const TOAST_TONE = {
  success: "border-l-[3px] border-l-risk-track text-risk-track",
  error: "border-l-[3px] border-l-risk-critical text-risk-critical",
  info: "border-l-[3px] border-l-info text-info",
};

/** Short confirmations for completed actions. Announced politely to screen readers. */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const counter = useRef(0);
  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (message, tone = "success") => {
      const id = ++counter.current;
      setItems((list) => [...list.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 print:hidden"
      >
        {items.map((t) => {
          const Icon = TOAST_ICON[t.tone];
          return (
            <div
              key={t.id}
              className={cn(
                "surface-raised pointer-events-auto flex items-start gap-3 p-3 text-sm animate-in fade-in slide-in-from-bottom-2",
                TOAST_TONE[t.tone],
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <p className="min-w-0 flex-1 text-foreground">{t.message}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const messageOf = (error) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";

/**
 * Runs a save: shows a busy state, a toast on success or failure, and refreshes data afterwards.
 * `success` is only announced once the server confirmed the write.
 */
export function useAction(after) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (work, success) => {
      setBusy(true);
      try {
        const result = await work();
        if (success) toast(success);
        await after?.();
        return { ok: true, result };
      } catch (error) {
        toast(messageOf(error), "error");
        return { ok: false, error };
      } finally {
        setBusy(false);
      }
    },
    [after, toast],
  );
  return { busy, run };
}

// ---------------------------------------------------------------- loading
export function Skeleton({ className }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-sm bg-secondary ring-1 ring-rule", className)}
    />
  );
}

export function PageSkeleton({ rows = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <Skeleton className="h-9 w-56" />
      {/* The loading shape mirrors the real page: a row of ruled figures, then ledger rows. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="stat-tile">
            <Skeleton className="h-2.5 w-20" />
            <div className="stat-figure-row">
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="surface divide-y divide-rule">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A friendly inline error with a retry button. */
export function ErrorState({ error, onRetry }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-risk-critical/35 border-l-[3px] border-l-risk-critical bg-risk-critical-pale/60 px-6 py-7 text-center"
    >
      <AlertTriangle className="mx-auto size-6 text-risk-critical" />
      <p className="mt-2.5 font-semibold">This could not be loaded</p>
      <p className="mx-auto mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {messageOf(error)}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- confirmation
/** Asks before anything destructive. `onConfirm` may be async; the dialog closes when it finishes. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                onOpenChange(false);
              }
            }}
          >
            {confirmLabel ?? "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- files
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });

/** File picker that returns { name, type, base64 } for the server, with a size check up front. */
export function FileField({ value, onChange, label = "Attach a file", disabled }) {
  const [error, setError] = useState("");
  const input = useRef(null);
  useEffect(() => {
    if (!value && input.current) input.current.value = "";
  }, [value]);
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Paperclip className="size-4 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        <input
          ref={input}
          type="file"
          disabled={disabled}
          className="min-w-0 flex-1 text-xs file:mr-3 file:rounded-md file:border file:bg-secondary file:px-2 file:py-1"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv,.zip"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setError("");
            if (!file) return onChange(null);
            if (file.size > MAX_UPLOAD_BYTES) {
              setError("Files can be at most 3 MB.");
              e.target.value = "";
              return onChange(null);
            }
            try {
              onChange({
                name: file.name,
                type: file.type || guessType(file.name),
                base64: await toBase64(file),
              });
            } catch (err) {
              setError(messageOf(err));
              onChange(null);
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const guessType = (name) => TYPES[name.split(".").pop()?.toLowerCase()] ?? "";

/** Saves a file returned by the server. Files are always downloaded, never opened in the page. */
export function saveBase64File({ name, type, base64 }) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: type || "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function DownloadButton({ label, onFetch }) {
  const { busy, run } = useAction();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() => run(async () => saveBase64File(await onFetch()))}
    >
      <Download /> {label}
    </Button>
  );
}

// ---------------------------------------------------------------- status labels
// Status pills sit on the risk ramp, never on the brand ink or the ochre accent.
const LEVELS = {
  success: ["bg-risk-track-pale text-risk-track", CheckCircle2],
  warning: ["bg-risk-monitor-pale text-risk-monitor", AlertTriangle],
  danger: ["bg-risk-critical-pale text-risk-critical", XCircle],
  info: ["bg-info/10 text-info", Info],
  neutral: ["bg-secondary text-neutral", Info],
};

/** A status pill: always a text label plus an icon, never colour alone. */
export function StatusPill({ tone = "neutral", children }) {
  const [cls, Icon] = LEVELS[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        cls,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {children}
    </span>
  );
}

export const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm transition-colors placeholder:text-label hover:border-border-hover focus-visible:border-ochre focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35";

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-label">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
