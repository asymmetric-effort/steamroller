export interface GeneratedCodeOptions {
  readonly arrowFunctions: boolean;
  readonly constBindings: boolean;
  readonly objectShorthand: boolean;
  readonly reservedNamesAsProps: boolean;
  readonly symbols: boolean;
}

export type GeneratedCodePreset = "es5" | "es2015";

const ES5_PRESET: GeneratedCodeOptions = {
  arrowFunctions: false,
  constBindings: false,
  objectShorthand: false,
  reservedNamesAsProps: true,
  symbols: false,
};

const ES2015_PRESET: GeneratedCodeOptions = {
  arrowFunctions: true,
  constBindings: true,
  objectShorthand: true,
  reservedNamesAsProps: true,
  symbols: true,
};

export const normalizeGeneratedCode = (
  input?: GeneratedCodePreset | Partial<GeneratedCodeOptions>,
): GeneratedCodeOptions => {
  if (!input) return ES5_PRESET;
  if (input === "es5") return ES5_PRESET;
  if (input === "es2015") return ES2015_PRESET;
  return { ...ES5_PRESET, ...input };
};

// Helper: generate variable declaration keyword based on options
export const getVarKeyword = (options: GeneratedCodeOptions): string => {
  return options.constBindings ? "const" : "var";
};

// Helper: generate function wrapper based on options
export const wrapFunction = (
  params: string,
  body: string,
  options: GeneratedCodeOptions,
): string => {
  if (options.arrowFunctions) return `(${params}) => ${body}`;
  return `function(${params}) { ${body} }`;
};
