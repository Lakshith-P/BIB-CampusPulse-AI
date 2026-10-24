import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  CAPTIONS,
  PAGE_STARTS,
  ROLE_DURATION,
  ROLE_KEYS,
  SCENES,
  TOUR_ROLES,
  sceneCopy,
  stageAt,
} from "@/components/auth/tour-data";
import "@/components/auth/login-showcase.css";

// The animated sign-in demonstration on the login page: a phone that types a sample account and a
// masked password, "signs in", then opens the three main pages of the chosen workspace. It sends
// no credentials and makes no request. It plays the workspace selected in the sign-in form, and
// choosing a role here changes that selection; it never changes it on its own.

const NATURAL = { width: 640, height: 640 }; // the size the content is designed at, scaled to fit

const ROW_ICONS = ["▤", "◎", "↗"];
const NAV_ICONS = ["▦", "◷", "▤", "◎"];

function Rows({ rows }) {
  return rows.map((r, i) => (
    <div className="ls-row" key={r[0]}>
      <span className="ls-row-icon">{ROW_ICONS[i]}</span>
      <div>
        <strong>{r[0]}</strong>
        <small>{r[1]}</small>
      </div>
      <b>{r[2]}</b>
    </div>
  ));
}

function BottomNav({ role, active, onPage }) {
  return (
    <div
      className="ls-nav"
      role="group"
      aria-label={`Explore ${role.name.toLowerCase()} demo pages`}
    >
      {role.nav.map((name, i) => (
        <button key={name} type="button" aria-pressed={i === active} onClick={() => onPage(i)}>
          <span>{NAV_ICONS[i]}</span>
          {name}
        </button>
      ))}
    </div>
  );
}

function Screen({ role, scene, stage, time, onPage, onSignIn }) {
  if (stage < 3) {
    const email =
      stage === 0
        ? role.account.slice(
            0,
            Math.min(role.account.length, Math.floor(Math.max(0, time - 250) / 65)),
          )
        : role.account;
    const dots = stage === 0 ? 0 : stage === 1 ? Math.min(10, Math.floor((time - 2200) / 105)) : 10;
    return (
      <>
        <div className="ls-login-head">
          <span>{role.name.toUpperCase()} ACCESS</span>
          <h4>Welcome back.</h4>
          <p>Sign in to your SLQG workspace.</p>
        </div>
        <div className="ls-badge">{role.name} · sample account</div>
        <div className={`ls-input ${stage === 0 ? "is-typing" : ""}`}>
          <label>Account email</label>
          <div>
            <span>{email}</span>
            <i />
          </div>
        </div>
        <div className={`ls-input ${stage === 1 ? "is-typing" : ""}`}>
          <label>Password</label>
          <div>
            <span>{"•".repeat(Math.max(0, dots))}</span>
            <i />
          </div>
        </div>
        <div className="ls-help">Your account is linked to your assigned role.</div>
        <button type="button" className="ls-signin" onClick={onSignIn} tabIndex={-1}>
          {stage === 2 ? (
            <>
              <span className="ls-spinner" /> Signing in…
            </>
          ) : (
            "Sign in →"
          )}
        </button>
        <div className="ls-disclosure">Animated demo · no credentials collected</div>
        <div className="ls-login-foot">
          ◈<br />
          Student and teacher access
          <br />
          follow the permissions of each account.
        </div>
      </>
    );
  }
  if (stage === 3)
    return (
      <div className="ls-success">
        <span>✓</span>
        <h4>You&apos;re in.</h4>
        <p>Demo sign-in complete.</p>
        <strong>Opening {role.name.toLowerCase()} dashboard…</strong>
      </div>
    );
  if (stage === 4)
    return (
      <>
        <div className="ls-page-head">
          <span>{role.name.toUpperCase()} DASHBOARD</span>
          <h4>{scene.greeting}.</h4>
          <p>{scene.subtitle}</p>
        </div>
        <div className="ls-metric">
          <span>{scene.metricLabel}</span>
          <strong>
            {scene.metric}
            <small>{scene.unit}</small>
          </strong>
          <div className="ls-spark" aria-hidden="true">
            ▂ ▃ ▂ ▅ ▄ ▆ █
          </div>
        </div>
        <div className="ls-list-label">{scene.listTitle}</div>
        <Rows rows={scene.rows} />
        <div className="ls-callout">{scene.tip}</div>
        <BottomNav role={role} active={0} onPage={onPage} />
      </>
    );
  const page = role.pages[stage - 5];
  return (
    <>
      <div className="ls-crumb">
        Overview <span>› {role.nav[stage - 4]}</span>
      </div>
      <div className="ls-page-head ls-page-head-tight">
        <span>{page.eyebrow}</span>
        <h4>{page.title}</h4>
      </div>
      <div className="ls-metric">
        <span>{page.unit}</span>
        <strong>{page.metric}</strong>
        <small>{page.note}</small>
      </div>
      <div className="ls-list-label">{role.nav[stage - 4]} overview</div>
      <Rows rows={page.rows} />
      <div className="ls-callout">{page.callout}</div>
      <BottomNav role={role} active={stage - 4} onPage={onPage} />
    </>
  );
}

export function LoginShowcase({ workspace, onWorkspace, showAdmin = true }) {
  const roleIndex = Math.max(0, ROLE_KEYS.indexOf(workspace));
  const role = TOUR_ROLES[roleIndex];
  const scene = SCENES[roleIndex];
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  const [onScreen, setOnScreen] = useState(true);
  const [hidden, setHidden] = useState(false);
  const root = useRef(null);
  const stageBox = useRef(null);
  const [scale, setScale] = useState(1);

  // The demo restarts whenever a different workspace is chosen.
  useEffect(() => setTime(0), [roleIndex]);

  // One timer drives everything; it runs only while the demo is visible and not paused.
  useEffect(() => {
    if (paused || !onScreen || hidden) return undefined;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const step = Math.min(150, now - last);
      last = now;
      setTime((t) => (t + step >= ROLE_DURATION ? 0 : t + step));
    }, 60);
    return () => clearInterval(timer);
  }, [paused, onScreen, hidden]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const observer = new IntersectionObserver((entries) => setOnScreen(entries[0].isIntersecting), {
      threshold: 0,
    });
    if (root.current) observer.observe(root.current);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
    };
  }, []);

  // Scale the fixed-size content so it fits any screen height without scrolling.
  useLayoutEffect(() => {
    const box = stageBox.current;
    if (!box) return undefined;
    const fit = () => {
      // A box that has not been measured yet counts as full size, never as zero.
      const w = box.clientWidth || NATURAL.width;
      const h = box.clientHeight || NATURAL.height;
      setScale(Math.min(1, w / NATURAL.width, h / NATURAL.height));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const stage = stageAt(time);
  const copy = sceneCopy(role, scene, stage, roleIndex);
  const seek = useCallback((ms) => setTime(ms), []);
  const phase = stage < 4 ? "login" : "portal";

  return (
    <section
      ref={root}
      className={`ls-root ${paused ? "" : "is-playing"}`}
      style={{ "--scene": scene.color, "--scene-light": scene.light }}
      aria-label="Sign-in preview"
    >
      <div className="ls-grid" aria-hidden="true" />
      <div className="ls-orb ls-orb-a" aria-hidden="true" />
      <div className="ls-orb ls-orb-b" aria-hidden="true" />

      <header className="ls-top">
        <span className="ls-brand">
          <img src="/slqg-logo.png" alt="" width="40" height="40" />
          <img src="/slqg-lettering.png" alt="SLQG" className="ls-wordmark" />
        </span>
        <span className="ls-tagline">Student Learning, Quality &amp; Growth</span>
      </header>

      <div className="ls-rail" role="group" aria-label="Choose a workspace to preview">
        {TOUR_ROLES.map((r, i) =>
          ROLE_KEYS[i] === "admin" && !showAdmin ? null : (
            <button
              key={r.name}
              type="button"
              aria-pressed={i === roleIndex}
              aria-label={`${r.name} preview`}
              title={`${r.name} workspace`}
              onClick={() => onWorkspace?.(ROLE_KEYS[i])}
            >
              {["▥", "◎", "▦"][i]}
            </button>
          ),
        )}
      </div>

      <div className="ls-stage" ref={stageBox}>
        <div
          className="ls-fit"
          style={{ width: NATURAL.width, height: NATURAL.height, transform: `scale(${scale})` }}
        >
          <div className="ls-copy" aria-live="off">
            <span className="ls-micro">{copy.kicker}</span>
            <h3>{copy.title}</h3>
            <p>{copy.description}</p>
            <ol>
              {copy.points.map(([title, text], i) => (
                <li key={title}>
                  <span>{i + 1}</span>
                  <div>
                    <h4>{title}</h4>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="ls-device">
            <div className="ls-mode" role="group" aria-label="Choose phone screen">
              <button type="button" aria-pressed={phase === "login"} onClick={() => seek(0)}>
                Sign in
              </button>
              <button
                type="button"
                aria-pressed={phase === "portal"}
                onClick={() => seek(PAGE_STARTS[0])}
              >
                Portal
              </button>
            </div>
            <div className="ls-phone">
              <div className="ls-island" aria-hidden="true" />
              <div className="ls-status" aria-hidden="true">
                <span>9:41</span>
                <span>▮▮ ▰</span>
              </div>
              <div className="ls-app">
                <div className="ls-phone-brand">
                  <img src="/slqg-logo.png" alt="" width="22" height="22" />
                  <img src="/slqg-lettering.png" alt="SLQG" />
                  <span>◉</span>
                </div>
                <div className="ls-screen" key={`${roleIndex}:${stage}`}>
                  <Screen
                    role={role}
                    scene={scene}
                    stage={stage}
                    time={time}
                    onPage={(i) => seek(PAGE_STARTS[i])}
                    onSignIn={() => stage < 2 && seek(3600)}
                  />
                </div>
              </div>
            </div>
            <div className="ls-caption" aria-live="polite">
              <span className="ls-dot" /> {CAPTIONS(role)[stage]}
            </div>
            <div className="ls-timeline">
              <span style={{ transform: `scaleX(${time / ROLE_DURATION})` }} />
            </div>
            <div className="ls-meta">
              <span>ANIMATED DEMO · SAMPLE ACCOUNT</span>
              <button
                type="button"
                onClick={() => {
                  setPaused(false);
                  seek(0);
                }}
                aria-label="Replay this walkthrough"
              >
                <RotateCcw className="size-3" /> Replay
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="ls-play"
        aria-pressed={!paused}
        aria-label={paused ? "Play the walkthrough" : "Pause the walkthrough"}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
        {paused ? "Play walkthrough" : "Pause walkthrough"}
      </button>
      <p className="ls-foot">Turning campus data into student success.</p>
    </section>
  );
}
