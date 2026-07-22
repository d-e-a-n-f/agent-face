import { AgentFaceError } from "./errors.js";
import type { AgentFaceId } from "./ids.js";

/**
 * One navigable screen of the application: where it lives and which faces
 * it can mount. `:param` segments are placeholders (`/clients/:clientId`).
 */
export interface AgentRouteDeclaration {
  readonly path: string;
  /** What an agent finds on this screen. */
  readonly description: string;
  /** Face ids this route can mount. */
  readonly surfaces: readonly AgentFaceId[];
  /** Entity types operated on this route (e.g. `"invoice"`). */
  readonly entities?: readonly string[];
}

/**
 * The static application manifest: every screen that exists, which
 * capabilities can be found there, and which entities they operate on.
 *
 * The manifest answers *"where can capability X be found?"* — app-wide
 * capability search, navigation planning, docs generation, coverage
 * reporting. Live mounted surfaces remain the only source of truth for
 * what is *currently executable*.
 */
export interface AgentApplicationManifest {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly routes: readonly AgentRouteDeclaration[];
}

const PATH_PATTERN =
  /^\/$|^\/(?:[a-zA-Z0-9_.-]+|:[a-zA-Z0-9_]+)(?:\/(?:[a-zA-Z0-9_.-]+|:[a-zA-Z0-9_]+))*$/;

function invalid(message: string): never {
  throw new AgentFaceError({ code: "INVALID_INPUT", message });
}

/**
 * Validates and freezes an application manifest.
 *
 * @throws `AgentFaceError` with code `INVALID_INPUT` on malformed ids,
 * paths, duplicate routes, or blank descriptions.
 *
 * @example
 * ```ts
 * export const applicationManifest = defineAgentApplication({
 *   id: "acme-portal",
 *   name: "Acme Portal",
 *   routes: [
 *     {
 *       path: "/clients/:clientId",
 *       description: "One client: profile, onboarding, invoices",
 *       surfaces: ["crm.client"],
 *       entities: ["client"],
 *     },
 *   ],
 * });
 * ```
 */
export function defineAgentApplication(
  manifest: AgentApplicationManifest,
): AgentApplicationManifest {
  if (typeof manifest.id !== "string" || manifest.id.trim().length === 0) {
    invalid("Application id must be a non-empty string");
  }
  const seen = new Set<string>();
  for (const route of manifest.routes) {
    if (!PATH_PATTERN.test(route.path)) {
      invalid(
        `Route path ${JSON.stringify(route.path)} is invalid: expected "/" separated segments, ":param" placeholders allowed`,
      );
    }
    if (seen.has(route.path)) {
      invalid(`Route path "${route.path}" is declared twice`);
    }
    seen.add(route.path);
    if (
      typeof route.description !== "string" ||
      route.description.trim().length === 0
    ) {
      invalid(`Route "${route.path}" needs a non-empty description`);
    }
    if (!Array.isArray(route.surfaces)) {
      invalid(`Route "${route.path}" must declare surfaces (may be empty)`);
    }
  }
  return Object.freeze({
    ...manifest,
    routes: Object.freeze(
      manifest.routes.map((route) => Object.freeze({ ...route })),
    ),
  });
}
