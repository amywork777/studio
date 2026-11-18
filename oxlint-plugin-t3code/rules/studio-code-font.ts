import { defineRule, type ESTree } from "@oxlint/plugins";

// Studio's look (STUDIO.md): text is set in the sans-serif face; monospace is only for code.
const CODE_ELEMENTS = new Set(["code", "kbd", "pre", "samp"]);
const MONO_CLASS = /(?:^|[\s:])font-mono(?=$|[\s!])/u;

function hasMonoClass(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasMonoClass);
  if (typeof node !== "object" || node === null || !("type" in node)) return false;
  const current = node as ESTree.Node;
  if (current.type === "Literal" && typeof current.value === "string") {
    return MONO_CLASS.test(current.value);
  }
  if (current.type === "TemplateElement") {
    return MONO_CLASS.test(current.value.cooked ?? current.value.raw);
  }
  return Object.entries(current).some(([key, value]) => key !== "parent" && hasMonoClass(value));
}

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Studio's look (STUDIO.md): font-mono only on <pre>, <code>, <kbd> or <samp>; everything else is sans-serif.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type === "JSXIdentifier" && CODE_ELEMENTS.has(node.name.name)) return;
        for (const attribute of node.attributes) {
          if (attribute.type !== "JSXAttribute") continue;
          if (attribute.name.type !== "JSXIdentifier" || attribute.name.name !== "className")
            continue;
          if (!hasMonoClass(attribute.value)) continue;
          context.report({
            node: attribute,
            message:
              "Monospace is only for code (Studio's look, STUDIO.md). Put code in <pre>, <code>, <kbd> or <samp>, and leave text sans-serif.",
          });
        }
      },
    };
  },
});
