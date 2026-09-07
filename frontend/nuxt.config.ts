export default defineNuxtConfig({
  ssr: false,
  telemetry: false,
  devtools: { enabled: false },
  app: {
    head: {
      title: "specifyr editor",
      htmlAttrs: { lang: "en" },
    },
  },
});
