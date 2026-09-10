import type { Node, NodeRole } from "specifyr";

const TYPE_ROLE_FALLBACK: Record<string, NodeRole> = {
  component: "backend",
  module: "frontend",
  "external-service": "external",
  "data-store": "database",
  class: "frontend",
  interface: "frontend",
  "type-alias": "frontend",
  enum: "frontend",
  function: "frontend",
};

export function nodeRole(node: Pick<Node, "type" | "role">): NodeRole {
  return node.role ?? TYPE_ROLE_FALLBACK[node.type] ?? "external";
}

// Static role → Tailwind utility-class string map. Every class listed here
// is a real utility built at Tailwind scan time (see the role tokens in
// tailwind.css's `@theme inline` block). Do NOT compose the class string
// dynamically (e.g. `bg-role-${role}-fill`) — Tailwind's static scanner
// would miss it and no CSS would ship for those utilities.
// Role text color is intentionally NOT in the class list: stroke colors
// like `#22d3ee` (frontend cyan) read fine on the dark translucent fill
// but poorly on a light-theme white background. RoleNode.vue applies
// `text-foreground` (a shadcn token that flips with the theme) instead.
export const ROLE_CLASSES: Record<NodeRole, string> = {
  frontend: "bg-role-frontend-fill border-role-frontend-stroke",
  backend: "bg-role-backend-fill border-role-backend-stroke",
  database: "bg-role-database-fill border-role-database-stroke",
  cloud: "bg-role-cloud-fill border-role-cloud-stroke",
  external: "bg-role-external-fill border-role-external-stroke",
  messagebus: "bg-role-messagebus-fill border-role-messagebus-stroke",
  security: "bg-role-security-fill border-role-security-stroke",
};
