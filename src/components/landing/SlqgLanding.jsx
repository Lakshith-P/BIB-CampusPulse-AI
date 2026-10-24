import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAccount } from "@/lib/account";
import { DEFAULT_WEIGHTS, riskBand } from "@/lib/types";

const LOGO = "/slqg-logo.png";
const LETTERING = "/slqg-lettering.png";

// Score components in the order the bars are drawn; the weights are the app's own.
const COMPONENTS = [
  ["academics", "Academics"],
  ["attendance", "Attendance"],
  ["lms", "LMS"],
  ["engagement", "Engagement"],
  ["skills", "Skills"],
  ["placement", "Placement"],
];

const SCENARIOS = [
  {
    name: "Aarav · Year 3",
    initial: "A",
    values: [82, 68, 75, 70, 66, 60],
    title: "Strong academics. An attendance gap.",
    reason:
      "Attendance is 68%, below the illustrative 75% threshold. Placement readiness is 60%, so the below-60% flag does not fire.",
    next: "Discuss the attendance gap and agree on a recovery plan.",
    plan: "Meet with Aarav to understand the attendance gap, verify the record together and agree on an achievable recovery plan.",
  },
  {
    name: "Meera · Year 3",
    initial: "M",
    values: [85, 88, 80, 72, 55, 48],
    title: "A strong semester. A readiness gap.",
    reason:
      "Placement readiness is 48%, below the illustrative 60% threshold. Keep placement support separate from academic performance.",
    next: "Review the skills gap and agree on a practice schedule.",
    plan: "Discuss Meera’s placement goals, review the readiness checklist together and agree on a manageable skills practice schedule.",
  },
  {
    name: "Riya · Year 3",
    initial: "R",
    values: [88, 92, 85, 80, 84, 82],
    title: "Steady progress across the picture.",
    reason:
      "Neither of the illustrative attendance and placement rules fires. This does not mean every possible student need has been assessed.",
    next: "Celebrate progress and discuss the student’s next goal.",
    plan: "Check in with Riya about current goals, recognise steady progress and ask what additional opportunities or support would be useful.",
  },
];

const ROLES = [
  {
    kicker: "THE STUDENT WORKSPACE",
    title: ["Know where you stand.", "See where to go next."],
    desc: "Understand your score, plan your attendance and check your learning and placement readiness in one place.",
    list: [
      "Personal score & clear explanations",
      "Attendance planning & learning progress",
      "Placement eligibility & skills history",
    ],
  },
  {
    kicker: "THE FACULTY & MENTOR WORKSPACE",
    title: ["Less searching.", "More meaningful support."],
    desc: "See assigned students with the context you need for a focused conversation and a practical follow-up.",
    list: [
      "Assigned students & declining-performance alerts",
      "Visible risk reasons & student comparison",
      "Intervention ownership & follow-up tracking",
    ],
  },
  {
    kicker: "THE ADMINISTRATOR WORKSPACE",
    title: ["The campus picture.", "With the detail that matters."],
    desc: "Explore campus analytics, manage access and notice data-quality gaps before drawing conclusions.",
    list: [
      "Campus analytics & filters",
      "CSV import & data-quality alerts",
      "Role assignments & audit log",
    ],
  },
];

const SCENES = [
  {
    color: "#123c7a",
    kicker: "01 / FOR STUDENTS",
    title: ["Your learning.", "Your next chapter."],
    description:
      "A clearer view of your progress, your strengths and the next step that matters to you.",
    greeting: "YOUR LEARNING JOURNEY",
    phoneTitle: "Hello, Aarav",
    subtitle: "A little clarity. A confident next step.",
    metricLabel: "Student success score",
    metric: "72",
    unit: "/ 100",
    status: "Monitor · understand the context",
    listTitle: "Your connected picture",
    rows: [
      ["▤", "Academics", "A strong foundation", "82"],
      ["◷", "Attendance", "A gap worth discussing", "68%"],
      ["✧", "Placement readiness", "Your next opportunity", "60"],
    ],
    tipTitle: "A conversation comes first",
    tipText: "Your score is a starting point for support.",
    points: [
      ["Understand your progress", "See your learning picture in one place."],
      ["See the reason, not just a number", "Explore the signals behind your score."],
      ["Take a confident next step", "Plan learning and support with context."],
    ],
  },
  {
    color: "#217567",
    kicker: "02 / FOR FACULTY & MENTORS",
    title: ["Earlier conversations.", "More meaningful support."],
    description:
      "Spot a gap, understand the context and turn a signal into a practical next step with your student.",
    greeting: "YOUR MENTOR WORKSPACE",
    phoneTitle: "Make support count",
    subtitle: "The right context for a thoughtful check-in.",
    metricLabel: "Assigned students · sample",
    metric: "24",
    unit: "students",
    status: "Illustrative mentor overview",
    listTitle: "Conversations to prioritise",
    rows: [
      ["A", "Aarav", "Attendance below 75%", "68%"],
      ["M", "Meera", "Placement readiness gap", "48"],
      ["R", "Riya", "Progress check-in", "86"],
    ],
    tipTitle: "An owner. A date. A next step.",
    tipText: "Keep each intervention visible through follow-up.",
    points: [
      ["Notice the right signal", "See assigned students and their risk reasons."],
      ["Start with the full context", "Check the rule, value and threshold."],
      ["Follow through with care", "Agree on support and track the next conversation."],
    ],
  },
  {
    color: "#5b57a0",
    kicker: "03 / FOR ADMINISTRATORS",
    title: ["The bigger picture.", "Without losing the detail."],
    description:
      "Bring campus analytics, data quality and access management into one focused perspective.",
    greeting: "YOUR CAMPUS OVERVIEW",
    phoneTitle: "Clarity across campus",
    subtitle: "A shared view. A more informed conversation.",
    metricLabel: "Connected data domains",
    metric: "07",
    unit: "domains",
    status: "Illustrative campus overview",
    listTitle: "Campus management",
    rows: [
      ["▦", "Campus analytics", "Explore cohorts and filters", "↗"],
      ["▤", "CSV imports", "Review data quality", "↗"],
      ["◎", "Roles & assignments", "Manage access with purpose", "↗"],
    ],
    tipTitle: "Good insight starts with good data",
    tipText: "Review completeness before drawing conclusions.",
    points: [
      ["See across your campus", "Explore a connected view of student data."],
      ["Check the quality behind it", "Review imports and data-quality alerts."],
      ["Give access with purpose", "Manage roles, assignments and accountability."],
    ],
  },
];
const SCENE_MS = 3500;

const lines = (parts) =>
  parts.map((line, i) => (
    <Fragment key={line}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));

const scoreOf = (values) =>
  Math.round(values.reduce((sum, v, i) => sum + v * (DEFAULT_WEIGHTS[COMPONENTS[i][0]] / 100), 0));
const statusLabel = (score) => {
  const band = riskBand(score);
  return band[0] + band.slice(1).toLowerCase();
};

/** Left/Right/Home/End move between tabs in a tablist, as in the reference. */
function onTabKeys(e, count, current, select) {
  let next;
  if (e.key === "ArrowRight") next = (current + 1) % count;
  if (e.key === "ArrowLeft") next = (current - 1 + count) % count;
  if (e.key === "Home") next = 0;
  if (e.key === "End") next = count - 1;
  if (next === undefined) return;
  e.preventDefault();
  select(next);
  e.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
}

function Brand({ footer }) {
  return (
    <a className="brand" href="#" aria-label="SLQG home">
      <img
        className="brand-logo"
        src={LOGO}
        alt=""
        width={footer ? 50 : 48}
        height={footer ? 50 : 48}
      />
      <strong>
        <img className="slqg-wordmark" src={LETTERING} alt="SLQG" width={112} height={35} />
        <span className="brand-sub">Student Learning, Quality &amp; Growth</span>
      </strong>
    </a>
  );
}

function Showcase() {
  const reduced = useRef(false);
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [cycle, setCycle] = useState(0);
  const frame = useRef(null);
  const animated = useRef([]);
  const first = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    setPaused(mq.matches);
    const onMotion = (e) => {
      reduced.current = e.matches;
      setPaused(e.matches);
    };
    mq.addEventListener("change", onMotion);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    });
    if (frame.current) io.observe(frame.current);
    return () => {
      mq.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
    };
  }, []);

  const playing = inView && !paused && !hidden;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(timer);
  }, [playing, scene, cycle]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced.current) return;
    for (const el of animated.current) {
      if (!el) continue;
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
    }
  }, [scene]);

  const select = (i) => {
    setScene(i);
    setCycle((c) => c + 1);
  };
  const s = SCENES[scene];

  return (
    <div className="scroll-story">
      <div
        ref={frame}
        className={`showcase-frame${playing ? " is-playing" : ""}`}
        style={{ "--scene": s.color }}
      >
        <div className="role-rail" aria-label="Select a workspace preview">
          {["▥", "◎", "▦"].map((icon, i) => (
            <button
              key={icon}
              type="button"
              aria-label={["Student preview", "Mentor preview", "Administrator preview"][i]}
              aria-pressed={scene === i}
              onClick={() => select(i)}
            >
              {icon}
            </button>
          ))}
        </div>
        <div className="showcase-layout">
          <div className="story-copy" ref={(el) => (animated.current[0] = el)}>
            <span className="micro">{s.kicker}</span>
            <h3>{lines(s.title)}</h3>
            <p>{s.description}</p>
            <a className="text-link" href="#explore">
              Explore the experience ↗
            </a>
          </div>
          <div className="device-holder">
            <div className="phone">
              <div className="phone-island" aria-hidden="true" />
              <div className="phone-status" aria-hidden="true">
                <span>9:41</span>
                <span>▮▮ ▰</span>
              </div>
              <div className="phone-app" ref={(el) => (animated.current[1] = el)}>
                <div className="phone-brand">
                  <img src={LOGO} alt="" width={26} height={26} />
                  <strong>
                    <img
                      className="slqg-wordmark"
                      src={LETTERING}
                      alt="SLQG"
                      width={48}
                      height={16}
                    />
                  </strong>
                  <span>◉</span>
                </div>
                <div className="phone-greeting">
                  <span>{s.greeting}</span>
                  <h4>{s.phoneTitle}</h4>
                  <p>{s.subtitle}</p>
                </div>
                <div className="phone-feature">
                  <div className="phone-feature-top">
                    <span>{s.metricLabel}</span>
                    <span>↗</span>
                  </div>
                  <div className="phone-score">
                    <b>{s.metric}</b>
                    <span>{s.unit}</span>
                    <svg viewBox="0 0 100 50" aria-hidden="true">
                      <path
                        d="M2 44L18 34L34 37L50 18L66 24L82 12L98 3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>
                  <span className="phone-chip">{s.status}</span>
                </div>
                <div className="phone-section-title">
                  <strong>{s.listTitle}</strong>
                  <span>View all ↗</span>
                </div>
                <div>
                  {s.rows.map((r) => (
                    <div className="phone-row" key={r[1]}>
                      <span>{r[0]}</span>
                      <div>
                        <strong>{r[1]}</strong>
                        <small>{r[2]}</small>
                      </div>
                      <b>{r[3]}</b>
                    </div>
                  ))}
                </div>
                <div className="phone-tip">
                  <span>✧</span>
                  <div>
                    <strong>{s.tipTitle}</strong>
                    <p>{s.tipText}</p>
                  </div>
                </div>
                <div className="phone-nav" aria-hidden="true">
                  <span>
                    ▦<small>Overview</small>
                  </span>
                  <span>
                    ▤<small>Learning</small>
                  </span>
                  <span>
                    ◎<small>Support</small>
                  </span>
                  <span>
                    ◉<small>Profile</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <ol className="story-points" ref={(el) => (animated.current[2] = el)}>
            {s.points.map(([h, p], i) => (
              <li key={h}>
                <span>{i + 1}</span>
                <div>
                  <h4>{h}</h4>
                  <p>{p}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="scene-disc" aria-hidden="true">
          <img src={LOGO} alt="" />
        </div>
        <button
          className="showcase-playback"
          type="button"
          aria-label={paused ? "Play automatic showcase" : "Pause automatic showcase"}
          aria-pressed={!paused}
          onClick={() => {
            setPaused((p) => !p);
            setCycle((c) => c + 1);
          }}
        >
          {paused ? "▶ Play showcase" : "Ⅱ Pause showcase"}
        </button>
        <div className="scene-progress" aria-label="Showcase progress" key={`${scene}-${cycle}`}>
          {SCENES.map((x, i) => (
            <span key={x.kicker} className={i === scene ? "active" : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Studio() {
  const [current, setCurrent] = useState(0);
  const [formula, setFormula] = useState(false);
  const dialog = useRef(null);
  const s = SCENARIOS[current];
  const score = scoreOf(s.values);
  const onTrack = score >= 80;

  const closeOnBackdrop = useCallback((e) => {
    const d = dialog.current;
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      d.close();
  }, []);

  return (
    <section id="explore" className="demo-section">
      <div className="wrap">
        <div className="section-top">
          <div className="eyebrow">02 / TRY THE SIGNAL-TO-SUPPORT STUDIO</div>
          <span className="demo-badge">ILLUSTRATIVE DATA · NO LIVE RECORDS</span>
        </div>
        <div className="intro-grid">
          <h2>
            A number opens the door.
            <br />
            <em>The explanation matters.</em>
          </h2>
          <p>
            Choose a student scenario. Explore the score, understand the signals, then see what a
            thoughtful next step could look like.
          </p>
        </div>
        <div className="studio">
          <div className="studio-bar">
            <div>
              <img className="mini-logo" src={LOGO} alt="" width={24} height={24} /> Success
              workspace <span className="sep">/</span> Student overview
            </div>
            <span className="live-dot">Interactive preview</span>
          </div>
          <div
            className="scenario-tabs"
            role="tablist"
            aria-label="Student scenarios"
            onKeyDown={(e) => onTabKeys(e, SCENARIOS.length, current, setCurrent)}
          >
            {["Attendance gap", "Placement readiness", "On track"].map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={current === i}
                id={`scenario-${i}`}
                aria-controls="scenario-panel"
                tabIndex={current === i ? 0 : -1}
                onClick={() => setCurrent(i)}
              >
                0{i + 1} <span>{label}</span>
              </button>
            ))}
          </div>
          <div
            id="scenario-panel"
            role="tabpanel"
            aria-labelledby={`scenario-${current}`}
            className="studio-body"
          >
            <div className="score-column">
              <div className="student-heading">
                <span className="avatar">{s.initial}</span>
                <div>
                  <h3>{s.name}</h3>
                  <span>Fictional student · CSE</span>
                </div>
              </div>
              <div
                className="score-ring"
                style={{
                  background: `conic-gradient(${onTrack ? "#738775" : "#572639"} ${score}%,#eae1dd 0)`,
                }}
              >
                <div>
                  <strong>{score}</strong>
                  <span>SUCCESS SCORE / 100</span>
                </div>
              </div>
              <span className="status" style={{ background: onTrack ? "#e2e9df" : "#eee5cf" }}>
                {statusLabel(score)}
              </span>
              <p className="score-note">
                A conversation starter.
                <br />
                Never a decision about a student.
              </p>
              <button
                type="button"
                className="formula-toggle"
                aria-expanded={formula}
                aria-controls="formula"
                onClick={() => setFormula((f) => !f)}
              >
                How is this calculated? <span>{formula ? "−" : "+"}</span>
              </button>
              <div id="formula" hidden={!formula}>
                {COMPONENTS.map(([k, label]) => `${label} ${DEFAULT_WEIGHTS[k]}%`).join(" · ")}. Six
                components; feedback adds context, not a score. This demo uses complete illustrative
                data.
              </div>
            </div>
            <div className="signals-column">
              <div className="micro">THE CONTEXT BEHIND THE SCORE</div>
              <h3>{s.title}</h3>
              <div className="bars">
                {s.values.map((v, j) => (
                  <div
                    key={COMPONENTS[j][0]}
                    className={`bar-row${(j === 1 && v < 75) || (j === 5 && v < 60) ? " flag" : ""}`}
                  >
                    <span>{COMPONENTS[j][1]}</span>
                    <div className="bar-track" aria-hidden="true">
                      <div className="bar-fill" style={{ width: `${v}%` }} />
                    </div>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
              <div className="reason">
                <span>↳</span>
                <div>
                  <strong>Why this signal appeared</strong>
                  <p>{s.reason}</p>
                </div>
              </div>
              <div className="next-step">
                <div>
                  <span className="micro">SUGGESTED HUMAN NEXT STEP</span>
                  <p>{s.next}</p>
                </div>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => dialog.current?.showModal()}
                >
                  Preview support plan ↗
                </button>
              </div>
            </div>
          </div>
          <div className="studio-bottom">
            <span>◈ Explainable rules, not an AI prediction</span>
            <span>Example only · no changes to a real student record</span>
          </div>
        </div>
        <div className="score-bands">
          <span>
            <i className="green" />
            80+ On track
          </span>
          <span>
            <i className="gold" />
            65–79 Monitor
          </span>
          <span>
            <i className="orange" />
            50–64 Needs attention
          </span>
          <span>
            <i className="red" />
            Below 50 High priority
          </span>
        </div>
      </div>
      <dialog ref={dialog} aria-labelledby="plan-title" onClick={closeOnBackdrop}>
        <button
          type="button"
          className="close"
          aria-label="Close support plan"
          onClick={() => dialog.current.close()}
        >
          ×
        </button>
        <div className="eyebrow">ILLUSTRATIVE WORKFLOW</div>
        <h2 id="plan-title">
          A small step.
          <br />A clear follow-through.
        </h2>
        <p>{s.plan}</p>
        <dl>
          <div>
            <dt>Proposed owner</dt>
            <dd>Assigned faculty mentor</dd>
          </div>
          <div>
            <dt>Follow-up</dt>
            <dd>Within one week of the conversation</dd>
          </div>
          <div>
            <dt>Review</dt>
            <dd>Discuss progress with the student and record the outcome</dd>
          </div>
        </dl>
        <p className="muted">This is a preview. No intervention has been created or sent.</p>
        <button type="button" className="btn close-plan" onClick={() => dialog.current.close()}>
          Back to the demo ↗
        </button>
      </dialog>
    </section>
  );
}

function Workspaces({ workspaceTo }) {
  const [role, setRole] = useState(0);
  const r = ROLES[role];
  return (
    <section id="workspaces" className="section wrap">
      <div className="section-top">
        <div className="eyebrow">03 / DIFFERENT ROLES. SHARED PURPOSE.</div>
        <span className="section-side">THE RIGHT CONTEXT FOR THE RIGHT PERSON</span>
      </div>
      <div className="workspace-layout">
        <div>
          <h2>
            Your campus.
            <br />
            <em>Your perspective.</em>
          </h2>
          <p className="muted">
            A student needs direction. A mentor needs context. A campus leader needs the bigger
            picture.
          </p>
          <div
            className="role-tabs"
            role="tablist"
            aria-label="Explore workspaces"
            onKeyDown={(e) => onTabKeys(e, ROLES.length, role, setRole)}
          >
            {["Students", "Faculty & mentors", "Administrators"].map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={role === i}
                id={`role-${i}`}
                aria-controls="role-panel"
                tabIndex={role === i ? 0 : -1}
                onClick={() => setRole(i)}
              >
                <span>0{i + 1}</span> {label} <b>↗</b>
              </button>
            ))}
          </div>
        </div>
        <article
          id="role-panel"
          role="tabpanel"
          aria-labelledby={`role-${role}`}
          className="role-card"
        >
          <div className="micro">{r.kicker}</div>
          <h3>{lines(r.title)}</h3>
          <p>{r.desc}</p>
          <ul>
            {r.list.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <Link className="text-link" to={workspaceTo}>
            Go to your workspace ↗
          </Link>
          <span className="role-watermark" aria-hidden="true">
            0{role + 1}
          </span>
        </article>
      </div>
    </section>
  );
}

const FAQ = [
  [
    "Is this connected to a live university?",
    "No. The platform is not connected to a live university system, and the interactive preview on this page uses fictional student scenarios.",
  ],
  [
    "Are the scores generated by AI?",
    "No. SLQG uses a rule-based score with six weighted components. Feedback is the seventh data domain and is not part of the published weighted score.",
  ],
  [
    "Does this replace an LMS or campus ERP?",
    "No. SLQG is a connected intelligence layer across student data domains. Records are added through CSV import and the staff workspaces; it does not claim production connectors to campus systems.",
  ],
  [
    "What happens when data is missing?",
    "Missing data is shown as missing and never counted as zero. The score is calculated from the components that are recorded, and the gaps are listed so they can be filled in.",
  ],
  [
    "How can I try the actual platform?",
    "Log in opens your SLQG workspace. The interactive preview on this page needs no account and uses illustrative data only.",
  ],
];

export function SlqgLanding() {
  const { user } = useAccount();
  const [menu, setMenu] = useState(false);
  const workspaceTo = user ? "/portal" : "/auth";

  useEffect(() => {
    document.documentElement.classList.add("slqg-page");
    return () => document.documentElement.classList.remove("slqg-page");
  }, []);

  return (
    <div className="slqg">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className={menu ? "open" : undefined}>
        <Brand />
        <nav aria-label="Main navigation">
          {[
            ["#platform", "The platform"],
            ["#workspaces", "For your campus"],
            ["#trust", "Trust & clarity"],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenu(false)}>
              {label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <Link className="login" to={workspaceTo}>
            {user ? "My account ↗" : "Log in ↗"}
          </Link>
          <a className="btn small" href="#explore">
            Explore demo <span>↗</span>
          </a>
        </div>
        <button
          type="button"
          className="menu"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          ☰
        </button>
      </header>

      <main id="main">
        <section className="cinema-hero" aria-labelledby="hero-title">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-orb orb-one" aria-hidden="true" />
          <div className="hero-orb orb-two" aria-hidden="true" />
          <div className="hero-content">
            <div className="eyebrow">STUDENT LEARNING, QUALITY &amp; GROWTH</div>
            <h1 id="hero-title">
              Every student.
              <br />
              One <em>extraordinary</em> journey.
            </h1>
            <p>
              Seven campus data domains. One connected picture.
              <br />
              More clarity for learning. More room for growth.
            </p>
            <div className="hero-pillars">
              <span>
                <b>07</b>Connected domains
              </span>
              <span>
                <b>03</b>Purposeful workspaces
              </span>
              <span>
                <b>01</b>Student at the centre
              </span>
            </div>
            <div className="actions">
              <a className="btn" href="#platform">
                Discover SLQG <span>↓</span>
              </a>
              <a className="hero-secondary" href="#explore">
                Try the interactive demo ↗
              </a>
            </div>
            <div className="scroll-cue">
              <span /> SCROLL TO SEE THE WHOLE PICTURE
            </div>
          </div>
          <div className="hero-bottom-fade" aria-hidden="true" />
        </section>

        <section id="platform" className="showcase-section" aria-labelledby="showcase-heading">
          <div className="showcase-heading">
            <div className="eyebrow">ONE PLATFORM. THREE PERSPECTIVES.</div>
            <h2 id="showcase-heading">
              A whole campus.
              <br />
              <em>Connected around you.</em>
            </h2>
            <p>Watch the student, mentor and administrator experience unfold automatically.</p>
          </div>
          <Showcase />
        </section>

        <div className="connection-band wrap">
          <span>THE FULL PICTURE, TOGETHER</span>
          <p>
            {[
              "Academics",
              "Attendance",
              "LMS",
              "Engagement",
              "Skills",
              "Placement",
              "Feedback",
            ].map((d, i) => (
              <Fragment key={d}>
                {i > 0 && (
                  <>
                    {" "}
                    <i>✧</i>{" "}
                  </>
                )}
                {d}
              </Fragment>
            ))}
          </p>
        </div>

        <Studio />
        <Workspaces workspaceTo={workspaceTo} />

        <section className="journey wrap">
          <div>
            <div className="eyebrow">04 / FROM INSIGHT TO FOLLOW-THROUGH</div>
            <h2>
              Don&apos;t stop at
              <br />
              <em>“student flagged.”</em>
            </h2>
          </div>
          <ol>
            {[
              ["Notice the signal", "A rule highlights a gap worth understanding."],
              ["Read the context", "Check the source value and the reason behind the flag."],
              ["Start a conversation", "A mentor agrees on support, an owner and a date."],
              ["Close the loop", "Follow up and record what happened next."],
            ].map(([h, p], i) => (
              <li key={h}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="trust" className="trust-section">
          <div className="wrap trust-grid">
            <div>
              <div className="eyebrow">05 / TRUST IS PART OF THE EXPERIENCE</div>
              <h2>
                Transparent by design.
                <br />
                <em>Human by intention.</em>
              </h2>
              <p>
                SLQG&apos;s published approach puts explanations and people at the centre of student
                support.
              </p>
              <Link className="text-link" to="/privacy">
                Read the privacy &amp; responsible use approach ↗
              </Link>
            </div>
            <div className="trust-items">
              {[
                [
                  "Understand the score",
                  "Published weights, visible thresholds and clear reasons. The score is rule-based, not an AI prediction.",
                ],
                [
                  "Access follows responsibility",
                  "Students see their records; teachers see assigned students; administrators have separately granted access.",
                ],
                [
                  "Support stays human-led",
                  "Scores are advisory. People interpret the context and decide the appropriate support.",
                ],
              ].map(([h, p], i) => (
                <article key={h}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section wrap faq">
          <div>
            <div className="eyebrow">A LITTLE MORE CLARITY</div>
            <h2>
              Good questions.
              <br />
              <em>Clear answers.</em>
            </h2>
          </div>
          <div>
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final-cta wrap">
          <div className="eyebrow">A BETTER VIEW. A MORE THOUGHTFUL NEXT STEP.</div>
          <h2>
            See the whole picture.
            <br />
            <em>Support the whole student.</em>
          </h2>
          <div className="actions">
            <Link className="btn light" to={workspaceTo}>
              Open your workspace ↗
            </Link>
            <Link className="text-link" to="/contact">
              Talk to TEAM BIB ↗
            </Link>
          </div>
          <div className="cta-orbit" aria-hidden="true" />
        </section>
      </main>

      <footer className="wrap">
        <div className="footer-top">
          <Brand footer />
          <p>
            Turning campus data into student success.
            <br />
            Built by TEAM BIB · HacXLerate.
          </p>
          <a href="#explore">Explore the demo ↗</a>
          <Link to="/contact">Contact the team ↗</Link>
        </div>
        <div className="footer-bottom">
          <span>© 2026 TEAM BIB</span>
          <Link to="/privacy">Privacy &amp; responsible use</Link>
          <span>Illustrative data. No live university connection.</span>
        </div>
      </footer>
    </div>
  );
}
