// Tiny DOM builder used to construct the injected UI without a framework.

type Child = Node | string | null | undefined | false;

interface Attrs {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  title?: string;
  html?: string;
  [key: string]: unknown;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === "style" && typeof v === "object") {
        Object.assign(node.style, v as Record<string, string>);
      } else if (k === "class") {
        node.className = String(v);
      } else if (k === "html") {
        node.innerHTML = String(v);
      } else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === "dataset" && typeof v === "object") {
        Object.assign(node.dataset, v as Record<string, string>);
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Build an SVG icon from one or more path `d` segments (space-separated in data). */
export function icon(
  pathData: string,
  opts: { size?: number; stroke?: string; strokeWidth?: number; fill?: string } = {}
): SVGSVGElement {
  const { size = 16, stroke = "currentColor", strokeWidth = 1.6, fill = "none" } = opts;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", fill);
  svg.setAttribute("stroke", stroke);
  svg.setAttribute("stroke-width", String(strokeWidth));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  svg.append(path);
  return svg;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
