import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAccount } from "@/lib/account";
const links = [
  { to: "/solution", text: "Why SLQG" },
  { to: "/benefits", text: "For your campus" },
  { to: "/privacy", text: "Trust & privacy" },
  { to: "/contact", text: "Connect with us" },
];
import { ThemeToggle } from "@/components/ThemeToggle";
export function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5">
      <img src="/slqg-logo.png" alt="" width="36" height="36" className="h-9 w-auto" />
      <img src="/slqg-lettering.png" alt="SLQG" className="h-5 w-auto" />
    </Link>
  );
}

/** Website nav item. The active page is marked by an ochre rule under the label. */
function NavLink({ to, text, onNavigate }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="group relative py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{ className: "!text-foreground" }}
    >
      {text}
      <span
        aria-hidden
        className="absolute -bottom-0.5 left-0 h-[2px] w-0 bg-ochre transition-all group-hover:w-full group-data-[status=active]:w-full"
      />
    </Link>
  );
}

export function PublicLayout({ children }) {
  const [open, setOpen] = useState(false);
  const { user } = useAccount();
  return (
    <div className="public-site min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-rule bg-background/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Website">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} text={l.text} />
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild>
              <Link to={user ? "/portal" : "/auth"}>{user ? "My account" : "Log in"}</Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col border-t border-rule lg:hidden" aria-label="Mobile website">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="border-b border-rule px-5 py-3.5 text-sm font-medium text-muted-foreground"
                activeProps={{
                  className: "!text-foreground shadow-[inset_3px_0_0_var(--ochre)] bg-ochre-pale",
                }}
              >
                {l.text}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {children}
      <footer className="paper-grain border-t border-rule bg-secondary/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.6fr_1fr_1fr] lg:px-8">
          <div className="max-w-sm">
            <Brand />
            <p className="mt-5 font-display text-xl font-medium leading-snug tracking-tight text-foreground">
              Turning campus data into student success.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-label">
              TEAM BIB · Biryani Intelligence Bureau
              <br />
              HacXLerate · Smart Campus Analytics
            </p>
          </div>
          <nav aria-label="Discover">
            <p className="rule-head">Discover</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link
                  to="/solution"
                  className="text-muted-foreground transition-colors hover:text-ochre-ink"
                >
                  Why SLQG
                </Link>
              </li>
              <li>
                <Link
                  to="/benefits"
                  className="text-muted-foreground transition-colors hover:text-ochre-ink"
                >
                  Campus benefits
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Stay connected">
            <p className="rule-head">Stay connected</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link
                  to="/contact"
                  className="text-muted-foreground transition-colors hover:text-ochre-ink"
                >
                  Connect with TEAM BIB
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-muted-foreground transition-colors hover:text-ochre-ink"
                >
                  Privacy & responsible use
                </Link>
              </li>
              <li>
                <Link
                  to="/auth"
                  className="font-medium text-foreground transition-colors hover:text-ochre-ink"
                >
                  Access your account
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 border-t border-rule px-5 py-5 text-xs text-label lg:px-8">
          <span>© 2026 TEAM BIB. Built for better student outcomes.</span>
          <span>Not connected to a live university system</span>
        </div>
      </footer>
    </div>
  );
}
