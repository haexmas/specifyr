import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  ssr: false,
  telemetry: false,
  devtools: { enabled: false },
  css: ["~/assets/css/tailwind.css"],
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: "specifyr editor",
      htmlAttrs: { lang: "en" },
    },
  },
});
