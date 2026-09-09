import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  ssr: false,
  telemetry: false,
  devtools: { enabled: false },
  css: ["~/assets/css/tailwind.css"],
  vite: {
    // @ts-expect-error — @tailwindcss/vite returns Plugin<any>[] which
    // Nuxt's PluginOption type narrows differently; runtime is compatible.
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: "specifyr editor",
      // Dark theme per Plan 005 Schnitt A. The chrome (top bar, sidebars,
      // dialog) still holds hard-coded Tailwind `zinc-*` classes — those
      // are flipped automatically by the palette overrides under
      // `[data-theme="dark"]` in `assets/css/tailwind.css`. When Plan 005
      // Schnitt E replaces the chrome with shadcn primitives, the overrides
      // can go away in favour of native shadcn dark tokens.
      htmlAttrs: { lang: "en", "data-theme": "dark" },
    },
  },
});
