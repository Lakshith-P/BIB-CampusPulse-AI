import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { LANDING, MENUS, RAIL, SEARCH_GROUPS, landingFor } from "@/lib/destinations";

// Every place the interface can send someone must be a real page, so a renamed or removed page
// cannot leave a dead link behind.
const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
const exists = (path) => router.matchRoutes(path).at(-1)?.routeId !== rootRouteId;
const ROLES = ["student", "faculty", "admin"];

describe("destinations", () => {
  it("login landing choices are real pages and start with the overview", () => {
    for (const role of ROLES) {
      expect(LANDING[role][0].to).toBe("/portal");
      for (const { to } of LANDING[role]) expect(exists(to), `${role}: ${to}`).toBe(true);
    }
  });
  it("rail and menu shortcuts are real pages", () => {
    for (const role of ROLES) {
      for (const [to] of RAIL[role]) expect(exists(to), `rail ${role}: ${to}`).toBe(true);
      for (const menu of MENUS[role])
        for (const [to] of menu.items) expect(exists(to), `menu ${role}: ${to}`).toBe(true);
    }
  });
  it("every search entry is a real page", () => {
    for (const role of ROLES)
      for (const [, items] of SEARCH_GROUPS[role])
        for (const [label, to] of items) expect(exists(to), `${role} "${label}": ${to}`).toBe(true);
  });
  it("search lists every page of each workspace", () => {
    const pages = {
      student: [
        "/portal",
        "/portal/results",
        "/portal/attendance",
        "/portal/lms",
        "/portal/skills",
      ],
      faculty: ["/portal/students", "/portal/results", "/portal/interventions", "/portal/monitor"],
      admin: [
        "/portal/teachers",
        "/portal/assign",
        "/portal/people",
        "/portal/records",
        "/portal/audit",
      ],
    };
    for (const role of ROLES) {
      const listed = new Set(SEARCH_GROUPS[role].flatMap(([, items]) => items.map(([, to]) => to)));
      for (const page of pages[role]) expect(listed.has(page), `${role}: ${page}`).toBe(true);
    }
  });
  it("only accepts landing pages offered for that workspace", () => {
    expect(landingFor("student", "/portal/results")).toBe("/portal/results");
    expect(landingFor("student", "/portal/audit")).toBe("/portal");
    expect(landingFor("admin", "/somewhere/else")).toBe("/portal");
    expect(landingFor("nobody", "/portal/results")).toBe("/portal/results");
  });
});
