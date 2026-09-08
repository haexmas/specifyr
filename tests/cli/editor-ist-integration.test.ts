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
