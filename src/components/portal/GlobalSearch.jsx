import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, LogOut, Search, X } from "lucide-react";
import { SEARCH_GROUPS } from "@/lib/destinations";

// Every word typed must appear somewhere in the entry, so a student's name finds that student
// instead of fuzzy-matching unrelated pages.
const matches = (text, words) => words.every((w) => text.includes(w));

/**
 * The search panel. A click on the search box or Ctrl/Cmd+K opens a full-width panel that lists
 * every section of the workspace in columns, grouped like a menu; typing narrows the list.
 * Teachers and administrators can also find a student by name or ID. It only navigates, and what
 * each page shows is still decided by the server.
 */
export function GlobalSearch({ role, rows, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    setQ("");
    const t = setTimeout(() => input.current?.focus(), 30);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Several entries can open the same page; only the first one is ticked as "you are here".
  const currentLabel = (SEARCH_GROUPS[role] ?? [])
    .flatMap(([, items]) => items)
    .find(([, to]) => to === pathname)?.[0];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = useMemo(
    () =>
      (SEARCH_GROUPS[role] ?? [])
        .map(([title, items]) => [
          title,
          items.filter(
            ([label, , extra]) =>
              words.length === 0 || matches(`${label} ${extra} ${title}`.toLowerCase(), words),
          ),
        ])
        .filter(([, items]) => items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, q],
  );
  // People are only listed once something is typed, so the panel is not a wall of names.
  const students = useMemo(
    () =>
      role === "student" || words.length === 0
        ? []
        : rows
            .filter((r) => matches(`${r.name} ${r.id} ${r.branch}`.toLowerCase(), words))
            .slice(0, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, rows, q],
  );
  const actions = [["Sign out", onSignOut, LogOut, "logout exit"]].filter(
    ([label, , , extra]) => words.length === 0 || matches(`${label} ${extra}`.toLowerCase(), words),
  );

  const go = (fn) => {
    setOpen(false);
    fn();
  };
  const open1 = (to) => go(() => navigate({ to }));
  const total = groups.reduce((n, [, i]) => n + i.length, 0) + students.length + actions.length;
  const submit = (e) => {
    e.preventDefault();
    if (students[0])
      return go(() => navigate({ to: "/portal/students/$id", params: { id: students[0].id } }));
    const first = groups[0]?.[1][0];
    if (first) open1(first[1]);
    else if (actions[0]) go(actions[0][1]);
  };

  const Entry = ({ label, current, onClick, hint }) => (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left text-[15px] transition-colors hover:text-primary"
      >
        <span
          aria-hidden
          className={`flex size-5 shrink-0 items-center justify-center rounded ${
            current
              ? "bg-primary text-primary-foreground"
              : "bg-primary/20 group-hover:bg-primary/40"
          }`}
        >
          {current && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span className="min-w-0">
          {label}
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
      </button>
    </li>
  );
  const Heading = ({ children }) => (
    <h3 className="mb-2 flex items-center gap-3 border-b pb-2 font-display text-lg font-semibold">
      <span aria-hidden className="size-2.5 rounded-[3px] border border-muted-foreground/60" />
      {children}
    </h3>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search pages and features"
        className="flex h-9 min-w-9 items-center gap-2 rounded-full border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground md:w-48 xl:w-64"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-left md:block">
          Search pages and students…
        </span>
        <kbd className="hidden whitespace-nowrap rounded border bg-card px-1.5 text-[10px] xl:block">
          Ctrl K
        </kbd>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/50"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div className="max-h-[92vh] overflow-y-auto bg-card px-5 pb-8 pt-6 shadow-2xl sm:px-10">
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <h2 className="font-display text-4xl font-bold text-muted-foreground">Search</h2>
              <form onSubmit={submit} className="relative min-w-64 flex-1 sm:max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={input}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search results, placement, attendance, students…"
                  aria-label="Search"
                  className="h-12 w-full rounded-full border-0 bg-muted pl-12 pr-4 text-base outline-none focus:ring-2 focus:ring-primary"
                />
              </form>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="ml-auto flex size-10 items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="size-6" />
              </button>
            </div>
            {total === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                Nothing matches that. Try “results”, “placement” or a student’s name.
              </p>
            ) : (
              <div className="gap-x-12 [column-fill:balance] sm:columns-2 xl:columns-3">
                {students.length > 0 && (
                  <section className="mb-8 break-inside-avoid">
                    <Heading>Students</Heading>
                    <ul>
                      {students.map((r) => (
                        <Entry
                          key={r.id}
                          label={r.name}
                          hint={`${r.id} · ${r.branch} · Sem ${r.semester}`}
                          onClick={() =>
                            go(() => navigate({ to: "/portal/students/$id", params: { id: r.id } }))
                          }
                        />
                      ))}
                    </ul>
                  </section>
                )}
                {groups.map(([title, items]) => (
                  <section key={title} className="mb-8 break-inside-avoid">
                    <Heading>{title}</Heading>
                    <ul>
                      {items.map(([label, to]) => (
                        <Entry
                          key={label}
                          label={label}
                          current={label === currentLabel}
                          onClick={() => open1(to)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
                {actions.length > 0 && (
                  <section className="mb-8 break-inside-avoid">
                    <Heading>Quick actions</Heading>
                    <ul>
                      {actions.map(([label, fn]) => (
                        <Entry key={label} label={label} onClick={() => go(fn)} />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
