import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Options for {@link runInit}. */
export interface InitOptions {
  /** Skip dependency installation (used by tests and monorepos). */
  readonly skipInstall?: boolean;
  /** Model provider wiring to generate. Default "ai-sdk". */
  readonly provider?: "ai-sdk" | "bedrock";
}

/** What {@link runInit} did, for reporting. */
export interface InitResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
  readonly installed: boolean;
  readonly nextSteps: readonly string[];
}

const ROUTE_TEMPLATE_AI_SDK = `import { createAgentFaceRouteHandler } from "@agentface/next";

export const { POST } = createAgentFaceRouteHandler({
  adapter: async () => {
    const { createAISDKAdapter } = await import("@agentface/ai-sdk");
    // Pick any Vercel AI SDK provider (install it first), e.g.:
    //   pnpm add @ai-sdk/anthropic   →  anthropic("claude-opus-4-8")
    //   pnpm add @ai-sdk/openai      →  openai("gpt-5.2")
    const { anthropic } = await import("@ai-sdk/anthropic");
    return createAISDKAdapter({ model: anthropic("claude-opus-4-8") });
  },
  // ⚠ The endpoint is a model proxy. Replace this with your real auth
  // before deploying — anyone who can POST consumes your model account.
  authorize: async () => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Wire authorize to your auth before deploying the AgentFace endpoint.",
      );
    }
    return null;
  },
  redactErrors: process.env.NODE_ENV === "production",
});
`;

const ROUTE_TEMPLATE_BEDROCK = `import { createAgentFaceRouteHandler } from "@agentface/next";

export const { POST } = createAgentFaceRouteHandler({
  adapter: async () => {
    const { createBedrockAdapter } = await import("@agentface/assistant/bedrock");
    return createBedrockAdapter(); // AWS credential chain; AWS_REGION required
  },
  // ⚠ The endpoint is a model proxy. Replace this with your real auth
  // before deploying — anyone who can POST consumes your model account.
  authorize: async () => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Wire authorize to your auth before deploying the AgentFace endpoint.",
      );
    }
    return null;
  },
  redactErrors: process.env.NODE_ENV === "production",
});
`;

const CONFIG_TEMPLATE = `import { defineAgentApplication } from "@agentface/core";

/**
 * The static application manifest: every screen, which capabilities live
 * there, and which entities they operate on. Drives navigation, the
 * assistant's app-wide context, and the DevTools coverage report.
 * Keep it current as you add screens; verify with \`agentface doctor\`.
 */
export const applicationManifest = defineAgentApplication({
  id: "my-app",
  routes: [
    { path: "/", description: "Home", surfaces: ["examples.notes"] },
  ],
});

export default applicationManifest;
`;

const PROVIDER_TEMPLATE = `"use client";

import { standardUserPolicy } from "@agentface/policy";
import { AgentFaceApp } from "@agentface/next/app";
import type { ReactNode } from "react";
import { applicationManifest } from "../../agentface.config";

/**
 * Wrap your root layout's children with this component:
 *
 *   <AgentFaceSetup>{children}</AgentFaceSetup>
 *
 * It wires the runtime, policy, navigation, the assistant widget, and
 * dev-only DevTools in one place.
 */
export function AgentFaceSetup({ children }: { children: ReactNode }): ReactNode {
  return (
    <AgentFaceApp
      manifest={applicationManifest}
      // Replace with your signed-in user (see the auth recipes in the docs):
      user={{ type: "user", id: "user_dev", displayName: "Developer" }}
      policy={standardUserPolicy()}
    >
      {children}
    </AgentFaceApp>
  );
}
`;

const EXAMPLE_TEMPLATE = `"use client";

import { fromZod } from "@agentface/core/zod";
import { AgentSurface, useAgentAction, useAgentResource } from "@agentface/react";
import { useState } from "react";
import { z } from "zod";

/**
 * Your first Agent Surface: a note list the assistant can read and add to.
 * Open the assistant widget and try: "add a note that says hello".
 */
function Notes(): React.JSX.Element {
  const [notes, setNotes] = useState<readonly string[]>([]);

  useAgentResource({
    id: "notes",
    description: "The current notes, oldest first",
    value: notes,
  });

  useAgentAction({
    id: "add-note",
    description: "Add a note to the list",
    input: fromZod(z.object({ text: z.string().min(1) })),
    execute: ({ text }) => {
      setNotes((current) => [...current, text]);
      return { count: notes.length + 1 };
    },
  });

  return (
    <ul>
      {notes.map((note, index) => (
        <li key={index}>{note}</li>
      ))}
    </ul>
  );
}

export function NotesExample(): React.JSX.Element {
  return (
    <AgentSurface id="examples.notes" description="A simple note list">
      <Notes />
    </AgentSurface>
  );
}
`;

const PACKAGES = [
  "@agentface/core",
  "@agentface/policy",
  "@agentface/runtime",
  "@agentface/react",
  "@agentface/assistant",
  "@agentface/next",
  "@agentface/ai-sdk",
  "@agentface/devtools",
];

function detectPackageManager(rootDir: string): string {
  if (existsSync(join(rootDir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(rootDir, "yarn.lock"))) {
    return "yarn";
  }
  if (existsSync(join(rootDir, "bun.lock")) || existsSync(join(rootDir, "bun.lockb"))) {
    return "bun";
  }
  return "npm";
}

/**
 * Sets up AgentFace in an existing Next.js App Router project: installs
 * the packages, writes the model endpoint (authorize placeholder that
 * refuses to deploy unauthenticated), the manifest config, a one-component
 * setup wrapper, and a first example surface. Never overwrites existing
 * files. The one manual step — wrapping the root layout — is printed, not
 * automated: your layout is yours.
 */
export function runInit(
  rootDir: string,
  options: InitOptions = {},
): InitResult {
  const packageJsonPath = join(rootDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json in ${rootDir} — run inside your app.`);
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  if (packageJson.dependencies?.["next"] === undefined) {
    throw new Error(
      "This project does not depend on next. agentface init currently supports Next.js App Router apps.",
    );
  }

  const appDir = ["src/app", "app"]
    .map((candidate) => join(rootDir, candidate))
    .find((candidate) => existsSync(candidate));
  if (appDir === undefined) {
    throw new Error(
      "No app/ or src/app directory found — agentface init needs the App Router.",
    );
  }
  const componentsDir = appDir.includes(`${resolve(rootDir)}/src`)
    ? join(rootDir, "src/components")
    : join(rootDir, "components");

  const files: readonly { path: string; content: string }[] = [
    {
      path: join(appDir, "api/agentface/route.ts"),
      content:
        (options.provider ?? "ai-sdk") === "bedrock"
          ? ROUTE_TEMPLATE_BEDROCK
          : ROUTE_TEMPLATE_AI_SDK,
    },
    { path: join(rootDir, "agentface.config.ts"), content: CONFIG_TEMPLATE },
    { path: join(componentsDir, "agentface-setup.tsx"), content: PROVIDER_TEMPLATE },
    { path: join(componentsDir, "notes-example.tsx"), content: EXAMPLE_TEMPLATE },
  ];

  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (existsSync(file.path)) {
      skipped.push(file.path);
      continue;
    }
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content);
    created.push(file.path);
  }

  let installed = false;
  if (options.skipInstall !== true) {
    const packageManager = detectPackageManager(rootDir);
    execSync(`${packageManager} add ${PACKAGES.join(" ")} ai zod`, {
      cwd: rootDir,
      stdio: "inherit",
    });
    installed = true;
  }

  return {
    created,
    skipped,
    installed,
    nextSteps: [
      "Wrap your root layout's children: <AgentFaceSetup>{children}</AgentFaceSetup>",
      "Render <NotesExample /> on a page and ask the assistant to add a note",
      "Install your model provider (e.g. pnpm add @ai-sdk/anthropic) and set its credentials",
      "Replace the authorize placeholder in app/api/agentface/route.ts with your real auth",
      "Keep agentface.config.ts current; run `agentface doctor` to verify",
    ],
  };
}
