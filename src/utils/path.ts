/**
 * Cross-platform path handling utilities.
 *
 * All functions normalize to forward slashes internally,
 * ensuring consistent behavior across Windows, macOS, and Linux.
 *
 * @module utils/path
 */

/** Windows reserved device names that are invalid as filenames. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

/** Characters that are reserved or unsafe on one or more platforms. */
const RESERVED_CHARS_RE = /[<>:"|?*]/g;

/** Drive letter pattern (e.g. C: or D:). */
const DRIVE_LETTER_RE = /^[A-Za-z]:/;

/**
 * Normalize a file path to use forward slashes exclusively.
 *
 * Handles Windows-style backslashes, UNC paths (\\\\server\\share),
 * and drive letters (C:\\foo). Returns the path unchanged if it
 * already uses forward slashes.
 *
 * @param filePath - The path to normalize.
 * @returns The normalized path with forward slashes.
 */
export const normalizePath = (filePath: string): string => {
  return filePath.replace(/\\/g, "/");
};

/**
 * Check whether a path is absolute.
 *
 * A path is absolute if it starts with a forward slash or a drive letter
 * (e.g. C:/ or D:/).
 *
 * @param filePath - The path to check.
 * @returns True if the path is absolute.
 */
export const isAbsolute = (filePath: string): boolean => {
  const normalized = normalizePath(filePath);
  return normalized.startsWith("/") || DRIVE_LETTER_RE.test(normalized);
};

/**
 * Compute the relative path from one location to another.
 *
 * Both paths are normalized to forward slashes before comparison.
 * The result always uses forward slashes.
 *
 * @param from - The base path.
 * @param to - The target path.
 * @returns The relative path from `from` to `to`.
 */
export const relativePath = (from: string, to: string): string => {
  const fromParts = normalizePath(from)
    .split("/")
    .filter((p) => p !== "");
  const toParts = normalizePath(to)
    .split("/")
    .filter((p) => p !== "");

  let commonLength = 0;
  const maxLength = Math.min(fromParts.length, toParts.length);
  for (let i = 0; i < maxLength; i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++;
    } else {
      break;
    }
  }

  const upCount = fromParts.length - commonLength;
  const upSegments: Array<string> = [];
  for (let i = 0; i < upCount; i++) {
    upSegments.push("..");
  }

  const downSegments = toParts.slice(commonLength);
  const result = [...upSegments, ...downSegments].join("/");
  return result === "" ? "." : result;
};

/**
 * Get the directory portion of a path.
 *
 * @param filePath - The path to extract the directory from.
 * @returns The directory portion, or "." if no directory separator is found.
 */
export const getDirectory = (filePath: string): string => {
  const normalized = normalizePath(filePath);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return ".";
  }
  const dir = normalized.substring(0, lastSlash);
  return dir === "" ? "/" : dir;
};

/**
 * Get the filename (base name) portion of a path.
 *
 * @param filePath - The path to extract the filename from.
 * @returns The filename portion of the path.
 */
export const getBaseName = (filePath: string): string => {
  const normalized = normalizePath(filePath);
  const lastSlash = normalized.lastIndexOf("/");
  return normalized.substring(lastSlash + 1);
};

/**
 * Get the file extension, including the leading dot.
 *
 * @param filePath - The path to extract the extension from.
 * @returns The extension (e.g. ".ts") or an empty string if none.
 */
export const getExtension = (filePath: string): string => {
  const baseName = getBaseName(filePath);
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return "";
  }
  return baseName.substring(dotIndex);
};

/**
 * Sanitize a filename by removing or replacing platform-reserved
 * characters and names.
 *
 * Reserved Windows device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 * are prefixed with an underscore. Characters <, >, :, ", |, ?, * are
 * replaced with underscores.
 *
 * @param name - The filename to sanitize.
 * @returns The sanitized filename.
 */
export const sanitizeFileName = (name: string): string => {
  const baseName = name.replace(/\.[^.]*$/, "");
  const ext = name.substring(baseName.length);
  const upperBase = baseName.toUpperCase();

  const sanitizedBase = RESERVED_NAMES.has(upperBase)
    ? `_${baseName}`
    : baseName;
  const sanitizedName = `${sanitizedBase}${ext}`;
  return sanitizedName.replace(RESERVED_CHARS_RE, "_");
};

/**
 * Warn if two identifiers differ only by letter case.
 *
 * This helps catch case-sensitivity issues that cause problems on
 * case-insensitive filesystems (Windows, macOS default).
 *
 * @param id1 - The first identifier.
 * @param id2 - The second identifier.
 * @returns A warning message string if the identifiers differ only by case, or null.
 */
export const warnOnCaseDifference = (
  id1: string,
  id2: string,
): string | null => {
  if (id1 === id2) {
    return null;
  }
  if (id1.toLowerCase() === id2.toLowerCase()) {
    return `Case mismatch: "${id1}" vs "${id2}" may cause issues on case-insensitive filesystems`;
  }
  return null;
};
