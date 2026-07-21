import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import base from "./base.js";

/**
 * Shared flat ESLint config for AgentFace React packages.
 * @type {import("eslint").Linter.Config[]}
 */
export default tseslint.config(...base, reactHooks.configs["recommended-latest"]);
