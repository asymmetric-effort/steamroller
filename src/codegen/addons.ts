/**
 * @module codegen/addons
 * @description Banner/footer/intro/outro addon hooks for output generation.
 * Processes addon values that can be strings or functions (sync or async),
 * and applies them to generated code in the correct positions.
 */

/**
 * An addon value: a string literal, a sync function returning a string,
 * or an async function returning a string.
 */
export type AddonValue =
  string | (() => string) | (() => Promise<string>) | null | undefined;

/**
 * Collection of all addon hooks for output generation.
 */
export interface Addons {
  readonly banner?: AddonValue;
  readonly footer?: AddonValue;
  readonly intro?: AddonValue;
  readonly outro?: AddonValue;
}

/**
 * Resolved addon strings ready for application.
 */
export interface ResolvedAddons {
  readonly banner: string;
  readonly footer: string;
  readonly intro: string;
  readonly outro: string;
}

/**
 * Resolve a single addon value to a string.
 * Handles null/undefined (returns empty string), string literals,
 * and sync/async function values.
 *
 * @param value - The addon value to resolve
 * @returns The resolved string value
 */
export const resolveAddon = async (value: AddonValue): Promise<string> => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  const result = value();
  if (typeof result === "string") {
    return result;
  }
  return await result;
};

/**
 * Resolve all addon values in an Addons object to strings.
 *
 * @param addons - The addons object with potentially unresolved values
 * @returns A fully resolved addons object with string values
 */
export const resolveAllAddons = async (
  addons: Addons,
): Promise<ResolvedAddons> => {
  const [banner, footer, intro, outro] = await Promise.all([
    resolveAddon(addons.banner),
    resolveAddon(addons.footer),
    resolveAddon(addons.intro),
    resolveAddon(addons.outro),
  ]);
  return { banner, footer, intro, outro };
};

/**
 * Apply resolved addons to generated code.
 *
 * Placement order:
 * 1. Banner goes before everything
 * 2. Intro goes at the start of the wrapper function body (after banner)
 * 3. The main code
 * 4. Outro goes at the end of the wrapper function body (before footer)
 * 5. Footer goes after everything
 *
 * @param code - The generated code to wrap with addons
 * @param addons - The resolved addon strings
 * @returns The code with all addons applied
 */
export const applyAddons = (code: string, addons: ResolvedAddons): string => {
  const parts: Array<string> = [];

  if (addons.banner.length > 0) {
    parts.push(addons.banner);
    parts.push("\n");
  }

  if (addons.intro.length > 0) {
    parts.push(addons.intro);
    parts.push("\n");
  }

  parts.push(code);

  if (addons.outro.length > 0) {
    if (code.length > 0 && !code.endsWith("\n")) {
      parts.push("\n");
    }
    parts.push(addons.outro);
  }

  if (addons.footer.length > 0) {
    const current = parts.join("");
    if (current.length > 0 && !current.endsWith("\n")) {
      parts.push("\n");
    }
    parts.push(addons.footer);
  }

  return parts.join("");
};
