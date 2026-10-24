import { useCallback, useEffect, useRef, useState } from "react";

// Lets a fixed box (anchored bottom right) be dragged anywhere on the page. The box keeps its place
// as a distance from the right and bottom edges, so it grows upward when it opens, is kept inside
// the window, and is remembered in this browser. Anything marked data-nodrag inside a handle (a
// close button, say) still works as a button.

const MOVE_FIRST = 4; // pixels before a press counts as a drag rather than a click

const read = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && Number.isFinite(v.right) && Number.isFinite(v.bottom) ? v : null;
  } catch {
    return null;
  }
};

export function useDraggable(boxRef, key, watch) {
  const [offset, setOffset] = useState(null);
  const start = useRef(null);
  const moved = useRef(false);

  const keepInside = useCallback(
    ({ right, bottom }) => {
      const el = boxRef.current;
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      return {
        right: Math.min(Math.max(right, 0), Math.max(0, window.innerWidth - w)),
        bottom: Math.min(Math.max(bottom, 0), Math.max(0, window.innerHeight - h)),
      };
    },
    [boxRef],
  );

  useEffect(() => {
    const saved = read(key);
    if (saved) setOffset(keepInside(saved));
  }, [key, keepInside]);
  // the box changes size when it opens, and the window can change size
  useEffect(() => {
    const fit = () => setOffset((o) => (o ? keepInside(o) : o));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [watch, keepInside]);

  const handle = {
    style: { touchAction: "none", cursor: "grab" },
    onPointerDown(e) {
      if (e.button !== 0 || e.target.closest("[data-nodrag]")) return;
      const r = boxRef.current.getBoundingClientRect();
      start.current = {
        x: e.clientX,
        y: e.clientY,
        right: window.innerWidth - r.right,
        bottom: window.innerHeight - r.bottom,
      };
      moved.current = false;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove(e) {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!moved.current && Math.hypot(dx, dy) < MOVE_FIRST) return;
      moved.current = true;
      setOffset(keepInside({ right: s.right - dx, bottom: s.bottom - dy }));
    },
    onPointerUp() {
      if (start.current && moved.current)
        setOffset((o) => {
          try {
            if (o) localStorage.setItem(key, JSON.stringify(o));
          } catch {
            /* the position just is not remembered */
          }
          return o;
        });
      start.current = null;
    },
    onPointerCancel() {
      start.current = null;
    },
  };

  return {
    handle,
    style: offset ? { right: offset.right, bottom: offset.bottom } : undefined,
    /** True once after a drag, so the click that ends a drag does not also press the button. */
    wasDragged() {
      const was = moved.current;
      moved.current = false;
      return was;
    },
  };
}
