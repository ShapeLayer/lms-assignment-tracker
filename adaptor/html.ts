import { parse, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export type LmsDocument = DefaultTreeAdapterMap["document"];
export function parseLmsHtml(html: string): LmsDocument {
  return parse(html);
}
export function elements(root: Node): Element[] {
  const result: Element[] = [];
  function visit(node: Node) {
    if ("tagName" in node) {
      if (["script", "style", "svg", "template"].includes(node.tagName)) return;
      result.push(node);
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  }
  visit(root);
  return result;
}
export function attribute(element: Element, name: string): string {
  return element.attrs.find((a) => a.name === name)?.value ?? "";
}
export function content(root: Node | undefined): string {
  if (!root) return "";
  if ("value" in root && root.nodeName === "#text") return root.value;
  if (
    "tagName" in root &&
    ["script", "style", "svg", "template"].includes(root.tagName)
  )
    return "";
  return ("childNodes" in root ? root.childNodes.map(content).join("") : "")
    .replace(/\s+/g, " ")
    .trim();
}
export function findLinks(root: Node): string[] {
  return elements(root)
    .filter((e) => e.tagName === "a" && !!attribute(e, "href"))
    .map((e) => attribute(e, "href"));
}
