// Map from IST/SOLL node type to a space-separated Tailwind utility class
// string. Kept small and static — no runtime lookups, no theme system yet.
// Applied on Vue Flow's node.class field in pages/index.vue.

export const NODE_TYPE_CLASSES: Record<string, string> = {
  // SOLL top-level (Slice X — hues preserved)
  component: "bg-blue-100 border-blue-500",
  module: "bg-green-100 border-green-500",
  "external-service": "bg-amber-100 border-amber-500",
  "data-store": "bg-pink-100 border-pink-500",
  // IST TypeScript pack types (Slice A)
  class: "bg-purple-100 border-purple-500",
  interface: "bg-indigo-100 border-indigo-500",
  "type-alias": "bg-teal-100 border-teal-500",
  enum: "bg-orange-100 border-orange-500",
  function: "bg-red-100 border-red-500",
};

const FALLBACK = "border-gray-400";

export function nodeTypeClasses(type: string): string {
  return NODE_TYPE_CLASSES[type] ?? FALLBACK;
}
