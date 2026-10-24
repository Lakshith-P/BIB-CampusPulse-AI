import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlqgLoader } from "@/components/SlqgLoader";
import { PageSkeleton } from "@/components/ui-kit";
import { readFileSync } from "node:fs";

describe("SLQG loader", () => {
  it("spells SLQG, announced once as a status", () => {
    const { container } = render(<SlqgLoader label="Loading page" />);
    expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
    const letters = [...container.querySelectorAll(".slqg-loader-letter")].map(
      (e) => e.textContent,
    );
    expect(letters).toEqual(["S", "L", "Q", "G"]);
  });

  it("is what a loading page shows", () => {
    render(<PageSkeleton />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByText("Q", { selector: ".slqg-loader-letter" })).toBeInTheDocument();
  });

  it("makes S, L, Q and G shine one after another", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const block = (selector) => {
      const start = css.indexOf(`${selector} {`);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(block(".slqg-loader-letter")).toContain("slqg-shine");
    // S starts first; each later letter starts a fifth of the cycle after the one before
    for (const [letter, delay] of [
      ["L", "0.2"],
      ["Q", "0.4"],
      ["G", "0.6"],
    ])
      expect(block(`.slqg-loader-${letter}`)).toContain(`* ${delay}`);
    expect(css).not.toContain("slqg-dash");
  });
});
