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
      // Keep the light theme as the default; dark remains opt-in through
      // `[data-theme="dark"]` in `assets/css/tailwind.css`.
      htmlAttrs: { lang: "en", "data-theme": "light" },
    },
  },
});
