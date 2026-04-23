import * as React from "react";

/** Pull plain string from simple React nodes (text, numbers, nested fragments). */
export function extractPlainText(node: React.ReactNode): string | null {
  if (node == null || typeof node === "boolean") return null;
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    const parts = node.map(extractPlainText).filter((s): s is string => s != null && s !== "");
    return parts.length ? parts.join("") : null;
  }
  if (React.isValidElement(node) && node.props != null && typeof node.props === "object") {
    const p = node.props as { children?: React.ReactNode };
    if (node.type === React.Fragment) {
      return extractPlainText(p.children);
    }
    if (Object.prototype.hasOwnProperty.call(p, "children")) {
      return extractPlainText(p.children);
    }
  }
  return null;
}
