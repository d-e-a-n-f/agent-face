import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "index",
    "quick-start",
    "core-concepts",
    {
      type: "category",
      label: "Guides",
      collapsed: false,
      items: [
        "guides/actions",
        "guides/resources",
        "guides/policy-and-confirmation",
        "guides/forms",
        "guides/assistant",
        "guides/recommendations",
        "guides/knowledge-and-navigation",
        "guides/auth-recipes",
        "guides/testing",
      ],
    },
    "playground",
    "architecture",
    "roadmap",
  ],
};

export default sidebars;
