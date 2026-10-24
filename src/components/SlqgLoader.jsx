import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

// The name SLQG on its own: the letters shine one after another, S, then L, Q and G.
// The motion lives in styles.css (.slqg-loader); with reduced motion the letters stay still.
const LETTERS = ["S", "L", "Q", "G"];

/** The SLQG loading mark. `size="sm"` is the compact version used inside a page. */
export function SlqgLoader({ label = "Loading", size = "lg", className = "" }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`slqg-loader slqg-loader-${size} ${className}`}
    >
      {LETTERS.map((letter) => (
        <span
          key={letter}
          className={`slqg-loader-letter slqg-loader-${letter}`}
          aria-hidden="true"
        >
          {letter}
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A full-screen version, for when a whole workspace is loading. */
export function SlqgLoaderScreen({ label = "Loading" }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <SlqgLoader label={label} />
      <p className="text-sm text-muted-foreground" aria-hidden="true">
        {label}…
      </p>
    </div>
  );
}

/**
 * Shown over the page while the router is moving to another page, so every page change has the
 * same transition. It waits a moment first, so quick changes do not flash.
 */
export function RouteTransition({ delay = 100 }) {
  // A route that has its own pending screen shows that instead, so the loader never appears twice.
  const busy = useRouterState({
    select: (s) =>
      (s.isLoading || s.isTransitioning) && !s.matches.some((m) => m.status === "pending"),
  });
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!busy) return setShow(false);
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [busy, delay]);
  if (!show) return null;
  return (
    <div className="slqg-transition" aria-live="polite">
      <SlqgLoader label="Loading page" />
    </div>
  );
}
