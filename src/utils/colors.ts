/**
 * Zero-dependency ANSI color utility with TTY detection,
 * NO_COLOR/FORCE_COLOR support, and graceful degradation.
 *
 * @module utils/colors
 */

/** Detect whether the current environment supports color output. */
const detectColorSupport = (): boolean => {
  if ("FORCE_COLOR" in process.env && process.env["FORCE_COLOR"] !== "0") {
    return true;
  }
  if ("NO_COLOR" in process.env) {
    return false;
  }
  return !!process.stdout.isTTY;
};

/** Whether color output is supported in the current environment. */
export const isColorSupported: boolean = detectColorSupport();

/** Create an ANSI wrapper function for the given open/close codes. */
const createFormatter = (
  open: string,
  close: string,
): ((input: string) => string) => {
  return (input: string): string => {
    if (!isColorSupported) {
      return input;
    }
    return `${open}${input}${close}`;
  };
};

/** Apply red foreground color. */
export const red: (input: string) => string = createFormatter(
  "\x1b[31m",
  "\x1b[39m",
);
/** Apply green foreground color. */
export const green: (input: string) => string = createFormatter(
  "\x1b[32m",
  "\x1b[39m",
);
/** Apply yellow foreground color. */
export const yellow: (input: string) => string = createFormatter(
  "\x1b[33m",
  "\x1b[39m",
);
/** Apply blue foreground color. */
export const blue: (input: string) => string = createFormatter(
  "\x1b[34m",
  "\x1b[39m",
);
/** Apply magenta foreground color. */
export const magenta: (input: string) => string = createFormatter(
  "\x1b[35m",
  "\x1b[39m",
);
/** Apply cyan foreground color. */
export const cyan: (input: string) => string = createFormatter(
  "\x1b[36m",
  "\x1b[39m",
);
/** Apply gray (bright black) foreground color. */
export const gray: (input: string) => string = createFormatter(
  "\x1b[90m",
  "\x1b[39m",
);
/** Apply bold styling. */
export const bold: (input: string) => string = createFormatter(
  "\x1b[1m",
  "\x1b[22m",
);
/** Apply underline styling. */
export const underline: (input: string) => string = createFormatter(
  "\x1b[4m",
  "\x1b[24m",
);
/** Apply dim (faint) styling. */
export const dim: (input: string) => string = createFormatter(
  "\x1b[2m",
  "\x1b[22m",
);
