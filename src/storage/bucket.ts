import type { Node } from "../core/schemas.js";

export type SollBucket = "components" | "external";
export type SollLayout = "folder" | "file";

export const SUPPORTED_NODE_TYPES = [
  "component",
  "module",
  "external-service",
  "data-store",
] as const;

export type SupportedNodeType = (typeof SUPPORTED_NODE_TYPES)[number];

/** Map a supported model node to its SOLL bucket and on-disk layout. */
export function bucketForNode(node: Pick<Node, "type">): {
  bucket: SollBucket;
  layout: SollLayout;
} {
  switch (node.type) {
    case "component":
    case "module":
      return { bucket: "components", layout: "folder" };
    case "external-service":
    case "data-store":
      return { bucket: "external", layout: "file" };
    default:
      throw new Error(
        `SOLL storage: unsupported node type ${JSON.stringify(node.type)}. ` +
          `Supported types: ${SUPPORTED_NODE_TYPES.join(", ")}.`,
      );
  }
}
