/**
 * Zero-dependency human-readable formatting utilities for bytes,
 * milliseconds, date/time, and timezone.
 */

const BYTE_UNITS: ReadonlyArray<string> = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
const BYTES_PER_UNIT = 1000;

/**
 * Format a byte count into a human-readable string (SI / decimal).
 * Examples: 0 -> '0 B', 1500 -> '1.5 kB', 2300000 -> '2.3 MB'
 */
export const prettyBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes)) {
    return `${bytes} B`;
  }

  const negative = bytes < 0;
  const absolute = Math.abs(bytes);

  if (absolute === 0) {
    return '0 B';
  }

  const exponent = Math.min(
    Math.floor(Math.log10(absolute) / 3),
    BYTE_UNITS.length - 1,
  );

  const value = absolute / BYTES_PER_UNIT ** exponent;
  const formatted = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  const unit = BYTE_UNITS[exponent] as string;

  return `${negative ? '-' : ''}${formatted} ${unit}`;
};

interface ParsedMs {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly milliseconds: number;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * Decompose a millisecond duration into days, hours, minutes, seconds,
 * and remaining milliseconds.
 */
export const parseMs = (ms: number): ParsedMs => {
  if (!Number.isFinite(ms) || ms < 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };
  }

  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  const milliseconds = Math.floor(ms % MS_PER_SECOND);

  return { days, hours, minutes, seconds, milliseconds };
};

/**
 * Format a millisecond duration into a compact human-readable string.
 * Examples: 50 -> '50ms', 1200 -> '1.2s', 65000 -> '1m 5s',
 *           3661000 -> '1h 1m 1s'
 */
export const prettyMs = (ms: number): string => {
  if (!Number.isFinite(ms)) {
    return `${ms}ms`;
  }

  const negative = ms < 0;
  const absolute = Math.abs(ms);

  if (absolute < MS_PER_SECOND) {
    return `${negative ? '-' : ''}${Math.round(absolute)}ms`;
  }

  const parsed = parseMs(absolute);
  const parts: Array<string> = [];

  if (parsed.days > 0) parts.push(`${parsed.days}d`);
  if (parsed.hours > 0) parts.push(`${parsed.hours}h`);
  if (parsed.minutes > 0) parts.push(`${parsed.minutes}m`);

  if (parsed.seconds > 0) {
    parts.push(`${parsed.seconds}s`);
  }

  return `${negative ? '-' : ''}${parts.join(' ')}`;
};

/**
 * Return the current date/time as an ISO-8601 string.
 */
export const dateTime = (): string => new Date().toISOString();

/**
 * Return the current IANA timezone identifier (e.g. "America/New_York").
 */
export const timeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;
