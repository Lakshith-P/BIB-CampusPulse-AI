import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getCaptcha } from "@/lib/auth.functions";

/** Loads a captcha image and token, and lets the form ask for a new one. */
export function useCaptcha(onError) {
  const [captcha, setCaptcha] = useState(null);
  // Keep the latest error handler in a ref so `reload` stays the same function between renders.
  const report = useRef(onError);
  useEffect(() => {
    report.current = onError;
  });
  const reload = useCallback(async () => {
    setCaptcha(null);
    try {
      setCaptcha(await getCaptcha());
    } catch {
      report.current?.("The verification image could not be loaded. Refresh and try again.");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { captcha, reload };
}

/** The image, the box for its letters (named "captcha") and a refresh button. */
export function CaptchaField({ captcha, reload }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-2">
      <div className="flex flex-wrap items-center gap-3">
        {captcha ? (
          <img
            src={captcha.image}
            alt="Verification text"
            width={190}
            height={64}
            className="h-11 w-auto rounded-lg"
          />
        ) : (
          <div className="h-11 w-32 animate-pulse rounded-lg bg-muted" />
        )}
        <input
          key={captcha?.token}
          name="captcha"
          required
          maxLength={8}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Type the letters"
          aria-label="Type the letters you see"
          className="order-last h-11 w-full rounded-xl border bg-card px-3 uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary sm:order-none sm:w-auto sm:min-w-0 sm:flex-1"
        />
        <button
          type="button"
          onClick={reload}
          aria-label="Get a new verification image"
          className="rounded-lg border bg-card p-2.5 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>
    </div>
  );
}
