import { Link } from "@tanstack/react-router";
import { Menu, Orbit, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAccount } from "@/lib/account";
const links = [
  { to: "/solution", text: "Why BIB InsightIQ" },
  { to: "/benefits", text: "For your campus" },
  { to: "/privacy", text: "Trust & privacy" },
  { to: "/contact", text: "Connect with us" },
];
import { ThemeToggle } from "@/components/ThemeToggle";
export function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5">
      <span className="brand-mark">
        <Orbit className="size-6" />
      </span>
      <span className="font-display text-xl font-bold">
        <span className="text-primary">BIB InsightIQ</span>
      </span>
    </Link>
  );
}
export function PublicLayout({ children }) {
  const [open, setOpen] = useState(false);
  const { user } = useAccount();
  return (
    <div className="public-site min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Website">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                activeProps={{ className: "text-primary" }}
              >
                {l.text}
              </Link>
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
          <nav
            className="flex flex-col gap-3 border-t px-5 py-4 lg:hidden"
            aria-label="Mobile website"
          >
            {links.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="text-sm">
                {l.text}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {children}
      <footer className="border-t bg-muted/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[2fr_1fr_1fr] lg:px-8">
          <div>
            <Brand />
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Turning campus data into student success.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              TEAM BIB · Biryani Intelligence Bureau
              <br />
              HacXLerate · Smart Campus Analytics
            </p>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-semibold">Discover</p>
            <Link to="/solution" className="block text-muted-foreground">
              Why BIB InsightIQ
            </Link>
            <Link to="/benefits" className="block text-muted-foreground">
              Campus benefits
            </Link>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-semibold">Stay connected</p>
            <Link to="/contact" className="block text-muted-foreground">
              Connect with TEAM BIB
            </Link>
            <Link to="/privacy" className="block text-muted-foreground">
              Privacy & responsible use
            </Link>
            <Link to="/auth" className="block text-muted-foreground">
              Access your account
            </Link>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 border-t px-5 py-5 text-xs text-muted-foreground">
          <span>© 2026 TEAM BIB. Built for better student outcomes.</span>
          <span>Not connected to a live university system</span>
        </div>
      </footer>
    </div>
  );
}
