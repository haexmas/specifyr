import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { nodeTypeClasses } from "../../frontend/composables/node-type-classes.js";

const CLI_ENTRY = resolve(process.cwd(), "dist", "cli", "index.js");
const FRONTEND_BUILD = resolve(process.cwd(), "frontend", ".output", "server", "index.mjs");
const PUBLIC_NUXT = resolve(process.cwd(), "frontend", ".output", "public", "_nuxt");

function stripVitestEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const {
    VITEST: _v,
    VITEST_POOL_ID: _vp,
    VITEST_WORKER_ID: _vw,
    NODE_ENV: _ne,
    TEST: _t,
    ...clean
  } = env;
  void [_v, _vp, _vw, _ne, _t];
  return { ...clean, NO_COLOR: "1" };
}

async function waitForOutput(
  child: ChildProcessWithoutNullStreams,
  needle: RegExp,
  timeoutMs: number,
): Promise<string> {
  return await new Promise((resolvePromise, rejectPromise) => {
    let buffer = "";
    const timer = setTimeout(() => {
      rejectPromise(new Error(`Timed out waiting for ${needle} in\n${buffer}`));
    }, timeoutMs);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const match = buffer.match(needle);
      if (match) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.stderr.off("data", onData);
        resolvePromise(match[0]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });
}

describe("specifyr editor /api/ist (end-to-end)", () => {
  let child: ChildProcessWithoutNullStreams | undefined;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) {
      throw new Error(`CLI not built: ${CLI_ENTRY} — run 'pnpm build'`);
    }
    if (!existsSync(FRONTEND_BUILD)) {
      throw new Error(`Frontend not built: ${FRONTEND_BUILD}`);
    }
  });

  afterEach(() => {
    if (child && !child.killed) child.kill("SIGTERM");
    child = undefined;
  });

  it("extracts IST nodes from the specifyr repo itself", async () => {
    const repoRoot = process.cwd(); // The specifyr repo — has plenty of TS.
    child = spawn(process.execPath, [CLI_ENTRY, "editor", repoRoot, "--no-open"], {
      env: stripVitestEnv(process.env),
    }) as ChildProcessWithoutNullStreams;

    const runningLine = await waitForOutput(
      child,
      /Editor running at (http:\/\/127\.0\.0\.1:\d+)/,
      20000,
    );
    const url = runningLine.replace(/^Editor running at /, "");

    const res = await fetch(`${url}/api/ist`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meta: { source: string };
      nodes: Array<{ type: string; name: string }>;
      edges: Array<{ id: string; from: string; to: string; type: string }>;
    };
    expect(body.meta.source).toBe("ist");
    expect(body.nodes.length).toBeGreaterThan(10);
    const names = body.nodes.map((n) => n.name);
    expect(names).toContain("src/core/schemas.ts");
    expect(body.edges.length).toBeGreaterThan(0);
    for (const edge of body.edges) {
      expect(edge.type).toBe("imports");
      expect(edge.id).toMatch(/^tse-[0-9a-f]{12}$/);
    }

    // Sanity check: the page bundle references ELK, so the layout composable
    // is wired in. A regression that dropped useElkLayout would silently ship
    // a build with the grid math again — this catches that.
    const bundles = readdirSync(PUBLIC_NUXT).filter((n) => n.endsWith(".js"));
    const anyMentionsElk = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return (
        content.includes("elkjs") || content.includes("elk.algorithm") || content.includes("ELK")
      );
    });
    expect(anyMentionsElk).toBe(true);

    // Tailwind sanity check: the CSS bundle should contain at least one of the
    // node-type utilities we mapped in nodeTypeClasses. A regression that
    // dropped @tailwindcss/vite would ship the page unstyled.
    const cssBundles = readdirSync(PUBLIC_NUXT).filter((n) => n.endsWith(".css"));
    const anyMentionsTailwindColor = cssBundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return content.includes("bg-blue-100") || content.includes("bg-purple-100");
    });
    expect(anyMentionsTailwindColor).toBe(true);

    // Selection sanity check: the details-sidebar copy plus Vue Flow's
    // selection wiring must both survive into the JS bundle. A regression
    // that dropped the sidebar or reverted elements-selectable would silently
    // ship an editor that no longer reacts to clicks — this catches that.
    const anyMentionsSelection = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return (
        content.includes("Nothing selected") &&
        (content.includes("elementsSelectable") || content.includes("elements-selectable")) &&
        content.includes("onNodeClick")
      );
    });
    expect(anyMentionsSelection).toBe(true);

    // Neighbors sanity check: the sidebar's Imports / Imported by sections
    // must survive into the JS bundle. A regression that dropped the
    // neighbor lists would silently ship a graph that can no longer be
    // traversed from a selection — this catches that.
    const anyMentionsNeighbors = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return content.includes("Imports (") && content.includes("Imported by (");
    });
    expect(anyMentionsNeighbors).toBe(true);

    // Search sanity check: the header input placeholder AND the
    // match-highlight class token must both survive into the JS bundle.
    // Slice 5 removed the fitView jump on Enter (camera stays put; only
    // the ancestor wrappers auto-expand and the match's file wrapper
    // pulses once). A regression that dropped the search input or
    // silently reintroduced fitView would break either the visible input
    // or the "no camera teleport" invariant — this catches both.
    const anyMentionsSearch = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return content.includes("Search nodes") && content.includes("wrapper-highlight");
    });
    expect(anyMentionsSearch).toBe(true);

    // Camera-stability guard: application code must not call fitView any
    // more. PR #28 removed the click/select-side call; Slice 5 removed the
    // search-side one. Any reintroduction is a regression against the
    // "flow layout is the eye's anchor" design decision. Checked at source
    // level rather than the bundle, because Vue Flow's own core (which we
    // still bundle) legitimately exposes and internally calls `fitView` —
    // the string is unavoidable in shipped JS. Scan all authored frontend
    // sources so the guard cannot be bypassed by moving the call out of the
    // page component. Comments are stripped first so explanatory text does
    // not trip the guard.
    const frontendRoot = resolve(process.cwd(), "frontend");
    const frontendSourceRoots = [
      "app.vue",
      "nuxt.config.ts",
      "components",
      "composables",
      "pages",
      "server",
    ];
    const frontendSources = frontendSourceRoots
      .flatMap((sourceRoot) => {
        const root = resolve(frontendRoot, sourceRoot);
        if (/\.(?:ts|vue)$/.test(sourceRoot)) return [readFileSync(root, "utf8")];
        return readdirSync(root, { recursive: true })
          .filter(
            (name): name is string =>
              typeof name === "string" && /\.(?:ts|vue)$/.test(name),
          )
          .map((name) => readFileSync(resolve(root, name), "utf8"));
      })
      .join("\n");
    const frontendCode = frontendSources
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(frontendCode).not.toMatch(/\bfitView\s*\(/);
    expect(frontendCode).not.toMatch(/\buseVueFlow\b/);

    // Repo picker sanity check: the modal copy and the browse endpoint URL
    // must both survive into the JS bundle. A regression that dropped the
    // picker or the /api/browse call would silently ship an editor with no
    // way to change the repository from the browser — this catches that.
    const anyMentionsPicker = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return content.includes("Select this folder") && content.includes("/api/browse");
    });
    expect(anyMentionsPicker).toBe(true);

    // Explorer pane sanity check: the tree's heading text must survive into
    // the JS bundle. A regression that dropped the Explorer pane would
    // silently ship an editor with no folder/file navigation — this catches
    // that.
    const anyMentionsExplorer = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return content.includes("Explorer");
    });
    expect(anyMentionsExplorer).toBe(true);

    // Nested canvas sanity check: the wrapper-node CSS class must survive
    // into both the CSS and JS bundles. A regression that reverted to the
    // flat canvas layout would silently ship today's disconnected wall of
    // tiles again — this catches that. Component / composable names (like
    // useNestedElkLayout) are minified away by Vite, so the assertion
    // anchors on the class-name literal that is applied to every wrapper.
    const anyMentionsWrapperCss = cssBundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return content.includes("wrapper-node");
    });
    expect(anyMentionsWrapperCss).toBe(true);

    const anyMentionsWrapperJs = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return content.includes("wrapper-node") && content.includes("wrapper-expanded");
    });
    expect(anyMentionsWrapperJs).toBe(true);
  }, 30000);

  it("computes mapped SOLL and IST colors over Vue Flow's default theme", () => {
    const css = readdirSync(PUBLIC_NUXT)
      .filter((name) => name.endsWith(".css"))
      .map((name) => readFileSync(resolve(PUBLIC_NUXT, name), "utf8"))
      .join("\n");

    const themeRule = css.match(/\.vue-flow__node-default\{[^}]*background:[^}]*\}/)?.[0];
    expect(themeRule).toBeDefined();
    // happy-dom does not resolve Tailwind's oklch custom properties, so only
    // the generated utility declarations are normalized to known RGB values.
    // Put Vue Flow's unlayered rule last to model the cascade that required
    // the important Tailwind modifiers in the first place. Expand its
    // background shorthand because happy-dom otherwise does not compare it
    // correctly with an important background-color declaration.
    const normalizedThemeRule = themeRule?.replace(
      "background:var(--vf-node-bg)",
      "background-color:#fff",
    );

    /** Extract a generated utility rule and replace its color variable for DOM evaluation. */
    const utilityRule = (className: string, computedValue: string): string => {
      const escapedClass = className.replace("!", "\\\\!");
      const rule = css.match(new RegExp(`\\.${escapedClass}\\{[^}]+\\}`))?.[0];
      expect(rule, `missing generated utility for ${className}`).toBeDefined();
      return rule?.replace(/var\(--color-[^)]+\)/, computedValue) ?? "";
    };

    /** Return the mapped background and border utility classes for a node type. */
    const mappedClasses = (type: string): [string, string] => {
      const classes = nodeTypeClasses(type).split(" ");
      const background = classes.find((className) => className.startsWith("bg-"));
      const border = classes.find((className) => className.startsWith("border-"));
      if (!background || !border) {
        throw new Error(`incomplete color mapping for ${type}`);
      }
      return [background, border];
    };

    const [sollBackground, sollBorder] = mappedClasses("component");
    const [istBackground, istBorder] = mappedClasses("class");
    const stylesheet = [
      utilityRule(sollBackground, "rgb(219 234 254)"),
      utilityRule(sollBorder, "rgb(59 130 246)"),
      utilityRule(istBackground, "rgb(243 232 255)"),
      utilityRule(istBorder, "rgb(168 85 247)"),
      normalizedThemeRule,
    ].join("");

    const browser = new Window();
    const style = browser.document.createElement("style");
    style.textContent = stylesheet;
    browser.document.head.append(style);

    const sollNode = browser.document.createElement("div");
    sollNode.className = `vue-flow__node-default ${nodeTypeClasses("component")}`;
    browser.document.body.append(sollNode);
    const sollStyle = browser.getComputedStyle(sollNode);
    expect(sollStyle.backgroundColor).toBe("rgb(219 234 254)");
    expect(sollStyle.borderColor).toBe("rgb(59 130 246)");

    const istNode = browser.document.createElement("div");
    istNode.className = `vue-flow__node-default ${nodeTypeClasses("class")}`;
    browser.document.body.append(istNode);
    const istStyle = browser.getComputedStyle(istNode);
    expect(istStyle.backgroundColor).toBe("rgb(243 232 255)");
    expect(istStyle.borderColor).toBe("rgb(168 85 247)");

    browser.close();
  });
});
