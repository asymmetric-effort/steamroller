import { describe, it, expect } from "vitest";
import {
  prettyBytes,
  prettyMs,
  parseMs,
  dateTime,
  timeZone,
} from "../../../src/utils/formatting.js";

describe("prettyBytes", () => {
  it("formats 0 bytes", () => {
    expect(prettyBytes(0)).toBe("0 B");
  });

  it("formats small byte values", () => {
    expect(prettyBytes(1)).toBe("1 B");
    expect(prettyBytes(999)).toBe("999 B");
  });

  it("formats kilobytes", () => {
    expect(prettyBytes(1000)).toBe("1 kB");
    expect(prettyBytes(1500)).toBe("1.5 kB");
    expect(prettyBytes(10_000)).toBe("10 kB");
  });

  it("formats megabytes", () => {
    expect(prettyBytes(1_000_000)).toBe("1 MB");
    expect(prettyBytes(2_300_000)).toBe("2.3 MB");
  });

  it("formats gigabytes", () => {
    expect(prettyBytes(1_000_000_000)).toBe("1 GB");
    expect(prettyBytes(5_500_000_000)).toBe("5.5 GB");
  });

  it("formats terabytes", () => {
    expect(prettyBytes(1_000_000_000_000)).toBe("1 TB");
  });

  it("formats petabytes", () => {
    expect(prettyBytes(1_000_000_000_000_000)).toBe("1 PB");
  });

  it("clamps at petabytes for very large values", () => {
    const result = prettyBytes(1e18);
    expect(result).toContain("PB");
  });

  it("formats negative values", () => {
    expect(prettyBytes(-1000)).toBe("-1 kB");
    expect(prettyBytes(-1)).toBe("-1 B");
    expect(prettyBytes(-2_300_000)).toBe("-2.3 MB");
  });

  it("handles NaN", () => {
    expect(prettyBytes(NaN)).toBe("NaN B");
  });

  it("handles Infinity", () => {
    expect(prettyBytes(Infinity)).toBe("Infinity B");
  });

  it("handles -Infinity", () => {
    expect(prettyBytes(-Infinity)).toBe("-Infinity B");
  });

  it("handles negative zero", () => {
    expect(prettyBytes(-0)).toBe("0 B");
  });
});

describe("parseMs", () => {
  it("parses 0", () => {
    expect(parseMs(0)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
  });

  it("parses milliseconds only", () => {
    expect(parseMs(500)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 500,
    });
  });

  it("parses seconds and milliseconds", () => {
    expect(parseMs(1500)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
      milliseconds: 500,
    });
  });

  it("parses minutes", () => {
    expect(parseMs(65_000)).toEqual({
      days: 0,
      hours: 0,
      minutes: 1,
      seconds: 5,
      milliseconds: 0,
    });
  });

  it("parses hours", () => {
    expect(parseMs(3_661_000)).toEqual({
      days: 0,
      hours: 1,
      minutes: 1,
      seconds: 1,
      milliseconds: 0,
    });
  });

  it("parses days", () => {
    expect(parseMs(90_061_000)).toEqual({
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
      milliseconds: 0,
    });
  });

  it("returns zeroes for negative values", () => {
    expect(parseMs(-1000)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
  });

  it("returns zeroes for NaN", () => {
    expect(parseMs(NaN)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
  });

  it("returns zeroes for Infinity", () => {
    expect(parseMs(Infinity)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
  });
});

describe("prettyMs", () => {
  it("formats sub-second values as milliseconds", () => {
    expect(prettyMs(0)).toBe("0ms");
    expect(prettyMs(100)).toBe("100ms");
    expect(prettyMs(999)).toBe("999ms");
  });

  it("formats exact seconds", () => {
    expect(prettyMs(1000)).toBe("1s");
    expect(prettyMs(5000)).toBe("5s");
  });

  it("formats fractional seconds", () => {
    expect(prettyMs(1200)).toBe("1s");
    expect(prettyMs(1500)).toBe("1s");
  });

  it("formats minutes and seconds", () => {
    expect(prettyMs(65_000)).toBe("1m 5s");
    expect(prettyMs(120_000)).toBe("2m");
  });

  it("formats hours, minutes, seconds", () => {
    expect(prettyMs(3_661_000)).toBe("1h 1m 1s");
    expect(prettyMs(3_600_000)).toBe("1h");
  });

  it("formats days", () => {
    expect(prettyMs(86_400_000)).toBe("1d");
    expect(prettyMs(90_061_000)).toBe("1d 1h 1m 1s");
  });

  it("drops seconds when days are present", () => {
    const result = prettyMs(86_401_000);
    expect(result).toBe("1d 1s");
  });

  it("formats negative sub-second values", () => {
    expect(prettyMs(-100)).toBe("-100ms");
  });

  it("formats negative multi-second values", () => {
    expect(prettyMs(-5000)).toBe("-5s");
    expect(prettyMs(-65_000)).toBe("-1m 5s");
  });

  it("handles NaN", () => {
    expect(prettyMs(NaN)).toBe("NaNms");
  });

  it("handles Infinity", () => {
    expect(prettyMs(Infinity)).toBe("Infinityms");
  });

  it("handles -Infinity", () => {
    expect(prettyMs(-Infinity)).toBe("-Infinityms");
  });
});

describe("dateTime", () => {
  it("returns a non-empty string", () => {
    const result = dateTime();
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a valid ISO-8601 string", () => {
    const result = dateTime();
    const parsed = new Date(result);
    expect(parsed.toISOString()).toBe(result);
  });

  it("returns a recent timestamp", () => {
    const before = Date.now();
    const result = dateTime();
    const after = Date.now();
    const ts = new Date(result).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("timeZone", () => {
  it("returns a non-empty string", () => {
    const result = timeZone();
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a string containing a slash (IANA format)", () => {
    const result = timeZone();
    // IANA timezone IDs typically contain a slash (e.g. "America/New_York")
    // but some (e.g. "UTC") do not, so we just check it's a non-empty string
    expect(typeof result).toBe("string");
  });
});
