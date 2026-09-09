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
      // `data-theme` is fixed to `light` on purpose while the chrome (top bar,
      // sidebars, dialog) still uses hard-coded Tailwind zinc classes. The
      // full dark palette landed for later Plan 005 slices (Schnitt A tokens,
      // Schnitt E shadcn top bar); flipping the default before those ship
      // would leave the chrome unstyled against a dark canvas.
      htmlAttrs: { lang: "en", "data-theme": "light" },
    },
  },
});
