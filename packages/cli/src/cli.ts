#!/usr/bin/env node
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { generateManifest } from "./manifest.js";

const LEVEL_ICON = { ok: "✓", warn: "⚠", fail: "✕" } as const;

const HELP = `agentface — the AgentFace CLI

Commands:
  init                    Set up AgentFace in an existing Next.js app
      --provider <ai-sdk|bedrock>   Model endpoint template (default ai-sdk)
      --no-install                  Write files only, skip installing packages
  doctor                  Static health checks (CI-friendly: fails non-zero)
  generate-manifest       Write .agentface/manifest.json from agentface.config.*
      --from <path>                 Explicit config path
`;

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = rest.indexOf(`--${name}`);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const cwd = process.cwd();

  switch (command) {
    case "init": {
      const provider = flag("provider");
      const result = runInit(cwd, {
        ...(provider === "bedrock" ? { provider: "bedrock" as const } : {}),
        ...(rest.includes("--no-install") ? { skipInstall: true } : {}),
      });
      for (const path of result.created) {
        console.log(`  created  ${path}`);
      }
      for (const path of result.skipped) {
        console.log(`  kept     ${path} (already exists)`);
      }
      console.log("\nNext steps:");
      result.nextSteps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step}`);
      });
      return 0;
    }
    case "doctor": {
      const { findings, failed } = await runDoctor(cwd);
      for (const finding of findings) {
        console.log(
          `${LEVEL_ICON[finding.level]} [${finding.check}] ${finding.detail}`,
        );
      }
      return failed ? 1 : 0;
    }
    case "generate-manifest": {
      const { outputPath, manifest } = await generateManifest(
        cwd,
        flag("from"),
      );
      console.log(
        `Wrote ${outputPath} (${manifest.routes.length} routes, app "${manifest.id}")`,
      );
      return 0;
    }
    default:
      console.log(HELP);
      return command === undefined || command === "help" ? 0 : 1;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
