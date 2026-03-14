import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        info: "hsl(var(--info))",
        info_foreground: "hsl(var(--info-foreground))",
        success: "hsl(var(--success))",
        success_foreground: "hsl(var(--success-foreground))",
        warning: "hsl(var(--warning))",
        warning_foreground: "hsl(var(--warning-foreground))",
      },
    },
  },
};

export default config;
