import { NODE_ROLES } from "specifyr";
import { describe, expect, it } from "vitest";
import { ROLE_CLASSES, nodeRole } from "../../frontend/composables/node-role.js";

describe("nodeRole", () => {
  it("returns the explicit role when the node carries one", () => {
    expect(nodeRole({ type: "component", role: "database" })).toBe("database");
  });

  it("maps every SOLL top-level type via the type-role fallback", () => {
    expect(nodeRole({ type: "component" })).toBe("backend");
    expect(nodeRole({ type: "module" })).toBe("frontend");
    expect(nodeRole({ type: "external-service" })).toBe("external");
    expect(nodeRole({ type: "data-store" })).toBe("database");
  });

  it("maps every IST TypeScript pack type via the type-role fallback", () => {
    expect(nodeRole({ type: "class" })).toBe("frontend");
    expect(nodeRole({ type: "interface" })).toBe("frontend");
    expect(nodeRole({ type: "type-alias" })).toBe("frontend");
    expect(nodeRole({ type: "enum" })).toBe("frontend");
    expect(nodeRole({ type: "function" })).toBe("frontend");
  });

  it("falls back to the neutral external role for an unknown type", () => {
    expect(nodeRole({ type: "mystery-type" })).toBe("external");
  });

  it("explicit role overrides the type-based fallback", () => {
    // A `component` normally maps to backend, but an explicit role wins.
    expect(nodeRole({ type: "component", role: "frontend" })).toBe("frontend");
    expect(nodeRole({ type: "class", role: "security" })).toBe("security");
  });
});

describe("ROLE_CLASSES", () => {
  it("has a class string for every role in NODE_ROLES", () => {
    for (const role of NODE_ROLES) {
      expect(ROLE_CLASSES[role], `role: ${role}`).toBeDefined();
    }
  });

  it("gives every role both a bg-fill and a border-stroke utility for the same role", () => {
    // Guards against a regression that silently drops one of the two
    // (e.g. keeps border color but loses the fill), which would produce
    // an unstyled or half-styled node. Text color deliberately isn't part
    // of ROLE_CLASSES — RoleNode.vue uses shadcn's `text-foreground` so
    // labels stay readable on both themes.
    for (const role of NODE_ROLES) {
      const classes = ROLE_CLASSES[role];
      expect(classes, `role: ${role} bg`).toMatch(new RegExp(`\\bbg-role-${role}-fill\\b`));
      expect(classes, `role: ${role} border`).toMatch(
        new RegExp(`\\bborder-role-${role}-stroke\\b`),
      );
    }
  });
});
