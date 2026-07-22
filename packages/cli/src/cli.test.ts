import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { generateManifest } from "./manifest.js";

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentface-cli-"));
  cleanups.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const CONFIG = `module.exports.applicationManifest = {
  id: "fixture-app",
  routes: [
    { path: "/", description: "Home", surfaces: ["home.main"] },
    { path: "/items/:itemId", description: "One item", surfaces: ["items.item"] },
  ],
};
`;

describe("generate-manifest", () => {
  it("loads agentface.config, validates, and writes the JSON artefact", async () => {
    const dir = fixture({ "agentface.config.js": CONFIG });
    const { outputPath, manifest } = await generateManifest(dir);
    expect(manifest.id).toBe("fixture-app");
    const written = JSON.parse(readFileSync(outputPath, "utf8")) as {
      routes: unknown[];
    };
    expect(written.routes).toHaveLength(2);
  });

  it("rejects an invalid manifest with the core validation error", async () => {
    const dir = fixture({
      "agentface.config.js": `module.exports.default = { id: " ", routes: [] };`,
    });
    await expect(generateManifest(dir)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("explains when no config exists", async () => {
    const dir = fixture({});
    await expect(generateManifest(dir)).rejects.toThrow(
      /No manifest config found/,
    );
  });
});

describe("doctor", () => {
  it("fails on an unauthenticated model endpoint", async () => {
    const dir = fixture({
      "app/api/agentface/route.ts": `export const { POST } = createAgentFaceRouteHandler({ adapter });`,
      "app/page.tsx": `export default function Page() { return null; }`,
    });
    const { findings, failed } = await runDoctor(dir);
    expect(failed).toBe(true);
    expect(
      findings.find((finding) => finding.check === "endpoint-auth")?.level,
    ).toBe("fail");
  });

  it("passes a healthy app and verifies manifest routes against pages", async () => {
    const dir = fixture({
      "agentface.config.js": CONFIG,
      "app/api/agentface/route.ts": `export const { POST } = createAgentFaceRouteHandler({ adapter, authorize: myAuth });`,
      "app/page.tsx": `export default function Page() { return null; }`,
      "app/items/[itemId]/page.tsx": `export default function Item() { return null; }`,
      "app/layout.tsx": `<AgentFaceApp policy={standardUserPolicy()} />`,
    });
    const { findings, failed } = await runDoctor(dir);
    expect(failed).toBe(false);
    expect(
      findings.find((finding) => finding.check === "manifest-routes")?.level,
    ).toBe("ok");
    expect(
      findings.find((finding) => finding.check === "policy")?.level,
    ).toBe("ok");
  });

  it("fails when manifest routes have no page files", async () => {
    const dir = fixture({
      "agentface.config.js": CONFIG,
      "app/page.tsx": `export default function Page() { return null; }`,
    });
    const { findings, failed } = await runDoctor(dir);
    expect(failed).toBe(true);
    expect(
      findings.find((finding) => finding.check === "manifest-routes")?.detail,
    ).toContain("/items/:itemId");
  });

  it("warns on duplicate face ids and sensitive actions without confirmation", async () => {
    const dir = fixture({
      "app/a.tsx": `defineAgentFace({ id: "dup.face", description: "x" });
useAgentAction({
  id: "danger",
  sensitivity: "restricted",
  execute: () => ({}),
});`,
      "app/b.tsx": `<AgentSurface id="dup.face" description="again" />`,
    });
    const { findings } = await runDoctor(dir);
    expect(
      findings.find((finding) => finding.check === "duplicate-face-ids")?.level,
    ).toBe("warn");
    expect(
      findings.find((finding) => finding.check === "sensitive-actions")?.level,
    ).toBe("warn");
  });
});

describe("init", () => {
  it("writes route, config, setup wrapper, and example without overwriting", () => {
    const dir = fixture({
      "package.json": JSON.stringify({ dependencies: { next: "16.0.0" } }),
      "app/page.tsx": "export default function Page() { return null; }",
    });
    const result = runInit(dir, { skipInstall: true });
    expect(result.created.some((path) => path.endsWith("api/agentface/route.ts"))).toBe(true);
    expect(result.created.some((path) => path.endsWith("agentface.config.ts"))).toBe(true);
    const route = readFileSync(
      join(dir, "app/api/agentface/route.ts"),
      "utf8",
    );
    expect(route).toContain("authorize");
    expect(route).toContain("createAISDKAdapter");

    // Second run keeps existing files.
    const again = runInit(dir, { skipInstall: true });
    expect(again.created).toHaveLength(0);
    expect(again.skipped.length).toBeGreaterThan(0);
  });

  it("refuses non-Next projects with a clear error", () => {
    const dir = fixture({
      "package.json": JSON.stringify({ dependencies: {} }),
    });
    expect(() => runInit(dir, { skipInstall: true })).toThrow(/next/i);
  });
});
