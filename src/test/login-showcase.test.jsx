import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { LoginShowcase } from "@/components/auth/LoginShowcase";
import { PAGE_STARTS, ROLE_DURATION, STAGE_STARTS, stageAt } from "@/components/auth/tour-data";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
});
afterEach(() => vi.useRealTimers());

const play = (ms) => act(() => vi.advanceTimersByTime(ms));
const screenText = () => document.querySelector(".ls-screen").textContent;
const inputs = () =>
  [...document.querySelectorAll(".ls-input > div > span")].map((e) => e.textContent);

describe("the sign-in walkthrough timeline", () => {
  it("moves through the eight stages at the published times", () => {
    expect(STAGE_STARTS).toHaveLength(8);
    expect(stageAt(0)).toBe(0);
    expect(stageAt(2200)).toBe(1);
    expect(stageAt(3600)).toBe(2);
    expect(stageAt(4500)).toBe(3);
    expect(stageAt(5300)).toBe(4);
    expect(stageAt(8800)).toBe(5);
    expect(stageAt(15600)).toBe(7);
    expect(PAGE_STARTS).toEqual([5300, 8800, 12200, 15600]);
    expect(ROLE_DURATION).toBe(19000);
  });
});

describe("the animated demo", () => {
  it("types the sample email, then a masked password, then signs in", () => {
    render(<LoginShowcase workspace="student" />);
    expect(screen.getByText("STUDENT ACCESS")).toBeInTheDocument();
    play(700);
    const typing = inputs()[0];
    expect(typing.length).toBeGreaterThan(0);
    expect("student@example.edu".startsWith(typing)).toBe(true);
    expect(typing).not.toBe("student@example.edu");
    play(900); // 1600 ms: the whole address is typed
    expect(inputs()[0]).toBe("student@example.edu");
    play(1500); // 3100 ms: part of a masked password
    expect(inputs()[1]).toMatch(/^•+$/);
    expect(inputs()[1].length).toBeLessThan(10);
    play(700); // 3800 ms
    expect(screenText()).toContain("Signing in…");
    expect(inputs()[1]).toBe("••••••••••");
  });

  it("then opens the dashboard and the role's three pages", () => {
    render(<LoginShowcase workspace="student" />);
    play(4600);
    expect(screenText()).toContain("You're in.");
    play(900); // 5500 ms
    expect(screenText()).toContain("Hello, Aarav.");
    expect(screenText()).toContain("Student success score");
    play(3500); // 9000 ms
    expect(screenText()).toContain("Attendance planner");
    expect(screenText()).toContain("Computer Networks");
    play(3400); // 12400 ms
    expect(screenText()).toContain("My learning");
    play(3400); // 15800 ms
    expect(screenText()).toContain("Placement readiness");
    expect(screen.getByText(/Opening Placement/)).toBeInTheDocument();
  });

  it("plays whichever workspace the sign-in form has selected, with its own account and pages", () => {
    const { rerender } = render(<LoginShowcase workspace="student" />);
    play(1700);
    expect(inputs()[0]).toBe("student@example.edu");
    rerender(<LoginShowcase workspace="faculty" />);
    expect(screen.getByText("TEACHER ACCESS")).toBeInTheDocument();
    expect(inputs()[0]).toBe(""); // restarted from the beginning
    play(1700);
    expect(inputs()[0]).toBe("teacher@example.edu");
    rerender(<LoginShowcase workspace="admin" />);
    expect(screen.getByText("ADMINISTRATOR ACCESS")).toBeInTheDocument();
    play(9100);
    expect(screenText()).toContain("Campus analytics");
  });

  it("never switches the selected workspace by itself, even after a full loop", () => {
    const onWorkspace = vi.fn();
    render(<LoginShowcase workspace="faculty" onWorkspace={onWorkspace} />);
    play(ROLE_DURATION + 3000);
    expect(onWorkspace).not.toHaveBeenCalled();
    expect(screen.getByText("TEACHER ACCESS")).toBeInTheDocument(); // wrapped back to its sign-in
  });

  it("lets the visitor pick a role, jump between screens, pause and replay", () => {
    const onWorkspace = vi.fn();
    render(<LoginShowcase workspace="student" onWorkspace={onWorkspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Administrator preview" }));
    expect(onWorkspace).toHaveBeenCalledWith("admin");

    fireEvent.click(screen.getByRole("button", { name: "Portal" }));
    expect(screenText()).toContain("Hello, Aarav.");
    fireEvent.click(screen.getByRole("button", { name: /Placement/ })); // bottom navigation
    expect(screenText()).toContain("Placement readiness");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("STUDENT ACCESS")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause the walkthrough" }));
    play(2000);
    expect(inputs()[0]).toBe(""); // paused: nothing typed
    fireEvent.click(screen.getByRole("button", { name: "Replay this walkthrough" }));
    play(1700);
    expect(inputs()[0]).toBe("student@example.edu");
  });

  it("starts paused for people who prefer reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    render(<LoginShowcase workspace="student" />);
    play(3000);
    expect(inputs()[0]).toBe("");
    expect(screen.getByRole("button", { name: "Play the walkthrough" })).toBeInTheDocument();
    window.matchMedia = original;
  });

  it("states clearly that nothing real is collected", () => {
    render(<LoginShowcase workspace="student" />);
    expect(screen.getByText("Animated demo · no credentials collected")).toBeInTheDocument();
    expect(screen.getByText(/ANIMATED DEMO · SAMPLE ACCOUNT/)).toBeInTheDocument();
  });
});
