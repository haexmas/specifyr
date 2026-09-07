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
      htmlAttrs: { lang: "en" },
    },
  },
});
