/**
 * @module config
 * @description Config normalization and validation entry point.
 */

export { normalizeInputOptions } from "./normalize-input.js";
export {
  normalizeInput,
  normalizeExternal,
  normalizePlugins,
  normalizeModuleContext,
} from "./normalize-input.js";
export { normalizeOutputOptions } from "./normalize-output.js";
export {
  normalizeInterop,
  normalizeGlobals,
  normalizeAddon,
  normalizeOutputPlugins,
} from "./normalize-output.js";
export { validateInputOptions, validateOutputOptions } from "./validate.js";
