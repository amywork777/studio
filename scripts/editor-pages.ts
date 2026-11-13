// @effect-diagnostics nodeBuiltinImport:off - a build step the launcher runs before the app starts.
/**
 * Builds a Studio plugin's editor page into the one HTML file its MCP Apps view serves: Studio frames
 * views from a single document, so script and styles are inlined. React and lucide come from the web
 * app and three.js from client-runtime, so the pages need no packages of their own.
 */
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

/** What this uses of esbuild, which is loaded from beside Vite and so has no types here. */
interface Esbuild {
  readonly build: (
    options: Readonly<Record<string, unknown>>,
  ) => Promise<{ readonly outputFiles: ReadonlyArray<{ readonly text: string }> }>;
}

/** Builds the page in `editor` (its index.html and src/main.tsx) to `outFile`. */
export async function buildEditorPage(
  appRoot: string,
  editor: string,
  outFile: string,
): Promise<void> {
  const viteRoot = NodePath.dirname(
    NodeFS.realpathSync(
      NodePath.join(appRoot, "apps", "web", "node_modules", "vite", "package.json"),
    ),
  );
  const esbuild = NodeModule.createRequire(NodePath.join(viteRoot, "package.json"))(
    "esbuild",
  ) as Esbuild;
  const built = await esbuild.build({
    entryPoints: [NodePath.join(editor, "src", "main.tsx")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    write: false,
    jsx: "automatic",
    legalComments: "none",
    nodePaths: [
      NodePath.join(appRoot, "apps", "web", "node_modules"),
      NodePath.join(appRoot, "packages", "client-runtime", "node_modules"),
    ],
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  const script = built.outputFiles[0]?.text ?? "";
  const styles = NodeFS.readFileSync(NodePath.join(editor, "src", "styles.css"), "utf8");
  const page = NodeFS.readFileSync(NodePath.join(editor, "index.html"), "utf8")
    .replace("/*STYLES*/", () => styles.replaceAll("</style", "<\\/style"))
    .replace("/*SCRIPT*/", () => script.replaceAll("</script", "<\\/script"));
  NodeFS.mkdirSync(NodePath.dirname(outFile), { recursive: true });
  NodeFS.writeFileSync(outFile, page);
}
