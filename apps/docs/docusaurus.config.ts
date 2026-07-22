import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "agentface",
  tagline:
    "The agent interface layer for software — typed, policy-checked surfaces AI assistants can operate, with humans confirming what matters.",
  favicon: "img/favicon.ico",

  future: { v4: true },

  // Canonical domain (GitHub Pages deployment + custom domain via CNAME).
  url: "https://agentface.dev",
  baseUrl: "/",
  organizationName: "d-e-a-n-f",
  projectName: "agent-face",
  trailingSlash: false,

  onBrokenLinks: "throw",

  markdown: { hooks: { onBrokenMarkdownLinks: "throw" } },

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/d-e-a-n-f/agent-face/tree/main/apps/docs/",
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/agentface-og-1200x630.png",
    navbar: {
      logo: {
        alt: "agentface",
        src: "img/agentface-lockup-horizontal-dark.svg",
        srcDark: "img/agentface-lockup-horizontal-light.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs",
        },
        { to: "/docs/playground", label: "Demo", position: "left" },
        {
          href: "https://github.com/d-e-a-n-f/agent-face",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Quick start", to: "/docs/quick-start" },
            { label: "Core concepts", to: "/docs/core-concepts" },
            { label: "The Portal demo", to: "/docs/playground" },
          ],
        },
        {
          title: "Project",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/d-e-a-n-f/agent-face",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} agentface.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
