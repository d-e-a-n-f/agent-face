#!/usr/bin/env node
/**
 * One-shot interactive release for AgentFace. Run from the repo root:
 *
 *   pnpm release
 *
 * Walks the whole flow with checkpoints: preflight (git clean, on main,
 * synced, npm login), shows the release plan from pending changesets,
 * versions, runs the quality gates, commits, publishes with your local
 * npm credentials (npm will prompt for OTP if you use 2FA), and pushes
 * commit + tags. Also handles the "retry" case where versions were bumped
 * earlier but never reached the registry.
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function out(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function run(label, command) {
  console.log(`\n▶ ${label}: ${command}`);
  const result = spawnSync(command, { shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    fail(`"${command}" exited with ${result.status ?? "signal"}`);
  }
}

function fail(message) {
  console.error(`\n✕ ${message}`);
  process.exit(1);
}

async function ask(question) {
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

function workspacePackages() {
  return readdirSync("packages")
    .map((dir) => `packages/${dir}/package.json`)
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, "utf8")))
    .filter((pkg) => pkg.name?.startsWith("@agentface/") && pkg.private !== true);
}

function publishedVersion(name) {
  try {
    return out(`npm view ${name} version 2>/dev/null`);
  } catch {
    return null; // never published
  }
}

// ── Preflight ────────────────────────────────────────────────────────────

console.log("AgentFace release\n─────────────────");

if (!existsSync(".changeset/config.json")) {
  fail("Run from the repo root.");
}

const branch = out("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  fail(`On branch "${branch}" — releases ship from main.`);
}

if (out("git status --porcelain") !== "") {
  fail("Working tree is not clean. Commit or stash first.");
}

console.log("▶ Syncing with origin…");
run("fetch", "git fetch origin main --quiet");
const behind = Number(out("git rev-list --count HEAD..origin/main"));
const ahead = Number(out("git rev-list --count origin/main..HEAD"));
if (behind > 0) {
  fail(`main is ${behind} commit(s) behind origin — pull first.`);
}
if (ahead > 0) {
  console.log(`⚠ main is ${ahead} commit(s) ahead of origin (will be pushed at the end).`);
}

let npmUser;
try {
  npmUser = out("npm whoami");
} catch {
  fail("Not logged in to npm. Run `npm login` (account with publish rights on @agentface) and retry.");
}
console.log(`✓ npm: logged in as ${npmUser}`);

// ── What needs releasing? ────────────────────────────────────────────────

const changesetFiles = readdirSync(".changeset").filter(
  (file) => file.endsWith(".md") && file !== "README.md",
);
const unpublished = workspacePackages().filter(
  (pkg) => publishedVersion(pkg.name) !== pkg.version,
);

if (changesetFiles.length === 0 && unpublished.length === 0) {
  console.log("\n✓ Nothing to release: no pending changesets and the registry matches every package version.");
  process.exit(0);
}

if (changesetFiles.length > 0) {
  console.log(`\nPending changesets (${changesetFiles.length}):`);
  for (const file of changesetFiles) {
    const body = readFileSync(`.changeset/${file}`, "utf8");
    const bumps = [...body.matchAll(/"(@agentface\/[^"]+)":\s*(\w+)/g)]
      .map((match) => `${match[1]} → ${match[2]}`)
      .join(", ");
    console.log(`  • ${file}: ${bumps}`);
  }
  if (!(await ask("\nApply these changesets (bump versions + changelogs)?"))) {
    fail("Aborted.");
  }
  run("version", "pnpm changeset version");
  run("lockfile", "pnpm install --no-frozen-lockfile");
  console.log("\nResulting versions:");
  run("diff", 'git --no-pager diff --stat -- "packages/*/package.json"');
} else {
  console.log("\nNo pending changesets — retry mode. Unpublished versions:");
  for (const pkg of unpublished) {
    console.log(`  • ${pkg.name}@${pkg.version} (registry: ${publishedVersion(pkg.name) ?? "never published"})`);
  }
  if (!(await ask("Publish these existing versions?"))) {
    fail("Aborted.");
  }
}

// ── Quality gates ────────────────────────────────────────────────────────

console.log("\nQuality gates (types, lint, tests, build)…");
run("check-types", "pnpm check-types");
run("lint", "pnpm lint");
run("test", "pnpm test");
run("build", "pnpm build");

if (await ask("Also run the Playwright e2e suite? (recommended for feature releases)")) {
  run("e2e", "pnpm --filter web test:e2e");
}

// ── Commit the version bump ──────────────────────────────────────────────

if (out("git status --porcelain") !== "") {
  run("commit", 'git add -A && git commit -m "Version packages"');
}

// ── Publish ──────────────────────────────────────────────────────────────

console.log(`\nPublishing to npm as ${npmUser} (npm will prompt for an OTP if 2FA is enabled)…`);
if (!(await ask("Publish now?"))) {
  fail("Aborted before publish. The version commit (if any) is local — push or reset as you prefer.");
}
run("publish", "pnpm changeset publish");
run("push", "git push --follow-tags origin main");

// ── Verify ───────────────────────────────────────────────────────────────

console.log("\nVerifying against the registry…");
let allGood = true;
for (const pkg of workspacePackages()) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (publishedVersion(pkg.name) === pkg.version) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  const live = publishedVersion(pkg.name);
  const ok = live === pkg.version;
  allGood &&= ok;
  console.log(` ${ok ? "✓" : "✕"} ${pkg.name}@${pkg.version}${ok ? "" : ` (registry says ${live ?? "missing"})`}`);
}

rl.close();
if (!allGood) {
  fail("Some packages did not verify — re-run `pnpm release` (publish is idempotent).");
}
console.log("\n✓ Release complete.");
