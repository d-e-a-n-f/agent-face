/**
 * The AgentFace CLI's programmatic surface — everything the `agentface`
 * bin does is callable directly (used by tests and other tooling).
 *
 * @packageDocumentation
 */

export { runDoctor } from "./doctor.js";
export type { DoctorFinding } from "./doctor.js";
export { runInit } from "./init.js";
export type { InitOptions, InitResult } from "./init.js";
export {
  generateManifest,
  loadManifest,
  MANIFEST_OUTPUT_PATH,
} from "./manifest.js";
