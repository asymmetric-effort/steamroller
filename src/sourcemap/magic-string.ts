/**
 * MagicString - String manipulation with source position tracking.
 *
 * Uses a linked list of chunks to track how edits map back to original
 * positions, enabling accurate source map generation.
 *
 * @module sourcemap/magic-string
 */

/**
 * A chunk in the linked list representing a segment of the source string.
 * Mutable state: content, intro, outro, edited, next are updated during edits.
 */
export interface Chunk {
  start: number;
  end: number;
  original: string;
  content: string;
  intro: string;
  outro: string;
  next: Chunk | null;
  edited: boolean;
}

/**
 * Encoded source map data with VLQ mappings string.
 */
export interface SourceMapData {
  readonly version: 3;
  readonly file?: string;
  readonly sources: ReadonlyArray<string>;
  readonly sourcesContent: ReadonlyArray<string | null>;
  readonly names: ReadonlyArray<string>;
  readonly mappings: string;
}

/**
 * Decoded source map data with numeric segment arrays.
 */
export interface DecodedSourceMap {
  readonly version: 3;
  readonly file?: string;
  readonly sources: ReadonlyArray<string>;
  readonly sourcesContent: ReadonlyArray<string | null>;
  readonly names: ReadonlyArray<string>;
  readonly mappings: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>;
}

interface MapOptions {
  source?: string;
  file?: string;
  includeContent?: boolean;
}

/**
 * Creates a new Chunk node.
 */
function createChunk(start: number, end: number, content: string): Chunk {
  return {
    start,
    end,
    original: content,
    content,
    intro: "",
    outro: "",
    next: null,
    edited: false,
  };
}

/**
 * Splits a chunk at the given index, returning the left portion.
 * The right portion becomes chunk.next (inserted before old next).
 */
function splitChunk(chunk: Chunk, index: number): Chunk {
  const sliceIndex = index - chunk.start;
  const originalBefore = chunk.original.slice(0, sliceIndex);
  const originalAfter = chunk.original.slice(sliceIndex);

  const newChunk = createChunk(index, chunk.end, originalAfter);
  newChunk.next = chunk.next;

  if (!chunk.edited) {
    newChunk.content = originalAfter;
    chunk.content = originalBefore;
  } else {
    newChunk.content = "";
    // Keep existing content on the left chunk
  }
  newChunk.outro = chunk.outro;
  chunk.outro = "";

  chunk.end = index;
  chunk.original = originalBefore;
  chunk.next = newChunk;

  return chunk;
}

/**
 * Encode a single VLQ value.
 */
function encodeVlq(value: number): string {
  const VLQ_BASE_SHIFT = 5;
  const VLQ_BASE = 1 << VLQ_BASE_SHIFT;
  const VLQ_BASE_MASK = VLQ_BASE - 1;
  const VLQ_CONTINUATION_BIT = VLQ_BASE;
  const BASE64_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
  let encoded = "";

  /* eslint-disable no-constant-condition */
  for (;;) {
    let digit = vlq & VLQ_BASE_MASK;
    vlq >>>= VLQ_BASE_SHIFT;
    if (vlq > 0) {
      digit |= VLQ_CONTINUATION_BIT;
    }
    encoded += BASE64_CHARS[digit];
    if (vlq === 0) {
      break;
    }
  }

  return encoded;
}

/**
 * MagicString provides string manipulation that tracks original source
 * positions for source map generation. Edits are represented as
 * transformations on a linked list of chunks.
 *
 * Mutable state: the linked list of chunks, intro, and outro are
 * modified by edit operations. This is inherent to the class design.
 */
export class MagicString {
  private original: string;
  private firstChunk: Chunk;
  private lastChunk: Chunk;
  private intro: string;
  private outro: string;

  constructor(source: string) {
    this.original = source;
    this.intro = "";
    this.outro = "";

    const chunk = createChunk(0, source.length, source);
    this.firstChunk = chunk;
    this.lastChunk = chunk;
  }

  /**
   * Overwrite a range [start, end) with new content.
   */
  overwrite(start: number, end: number, content: string): MagicString {
    this.validateRange(start, end);

    // Split chunks so we have exact boundaries
    this.splitAtIndex(start);
    this.splitAtIndex(end);

    // Iteratively find and update chunks in the range
    let current: Chunk | null = this.firstChunk;
    let first = true;
    while (current !== null) {
      if (
        current.start === start ||
        (current.start >= start && current.end <= end)
      ) {
        if (current.start >= start && current.end <= end) {
          if (first) {
            current.content = content;
            current.edited = true;
            first = false;
          } else {
            current.content = "";
            current.edited = true;
          }
        }
      }
      if (current.end >= end) {
        break;
      }
      current = current.next;
    }

    return this;
  }

  /**
   * Alias for overwrite.
   */
  update(start: number, end: number, content: string): MagicString {
    return this.overwrite(start, end, content);
  }

  /**
   * Remove a range [start, end) from the output.
   */
  remove(start: number, end: number): MagicString {
    this.validateRange(start, end);

    if (start === end) {
      return this;
    }

    this.splitAtIndex(start);
    this.splitAtIndex(end);

    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      if (current.start >= start && current.end <= end) {
        current.content = "";
        current.intro = "";
        current.outro = "";
        current.edited = true;
      }
      if (current.end >= end) {
        break;
      }
      current = current.next;
    }

    return this;
  }

  /**
   * Prepend content to the beginning of the string.
   */
  prepend(content: string): MagicString {
    this.intro = content + this.intro;
    return this;
  }

  /**
   * Append content to the end of the string.
   */
  append(content: string): MagicString {
    this.outro = this.outro + content;
    return this;
  }

  /**
   * Insert content before the chunk that starts at (or contains) `index`.
   * Content goes before the chunk's own content.
   */
  prependLeft(index: number, content: string): MagicString {
    this.validateIndex(index);
    this.splitAtIndex(index);

    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      if (current.start === index) {
        current.intro = content + current.intro;
        return this;
      }
      current = current.next;
    }

    // index === this.original.length: append to last chunk's outro
    this.lastChunk.outro = this.lastChunk.outro + content;
    return this;
  }

  /**
   * Insert content before the chunk that starts at `index`,
   * but after its intro.
   */
  prependRight(index: number, content: string): MagicString {
    this.validateIndex(index);
    this.splitAtIndex(index);

    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      if (current.start === index) {
        current.intro = current.intro + content;
        return this;
      }
      current = current.next;
    }

    this.lastChunk.outro = this.lastChunk.outro + content;
    return this;
  }

  /**
   * Insert content at the end of the chunk that ends at `index`,
   * before its outro.
   */
  appendLeft(index: number, content: string): MagicString {
    this.validateIndex(index);
    this.splitAtIndex(index);

    // Find the chunk that ends at index
    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      if (current.end === index) {
        current.outro = content + current.outro;
        return this;
      }
      current = current.next;
    }

    // index === 0: prepend to first chunk's intro
    this.firstChunk.intro = content + this.firstChunk.intro;
    return this;
  }

  /**
   * Insert content after the chunk that ends at `index`,
   * after its outro.
   */
  appendRight(index: number, content: string): MagicString {
    this.validateIndex(index);
    this.splitAtIndex(index);

    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      if (current.start === index) {
        current.intro = current.intro + content;
        return this;
      }
      current = current.next;
    }

    this.lastChunk.outro = this.lastChunk.outro + content;
    return this;
  }

  /**
   * Move the content in [start, end) to before `index`.
   */
  move(start: number, end: number, index: number): MagicString {
    this.validateRange(start, end);
    this.validateIndex(index);

    if (index >= start && index <= end) {
      throw new RangeError("Cannot move a selection inside itself");
    }

    this.splitAtIndex(start);
    this.splitAtIndex(end);
    this.splitAtIndex(index);

    // Collect chunks in [start, end)
    const movedChunks: Chunk[] = [];
    let current: Chunk | null = this.firstChunk;
    let prev: Chunk | null = null;
    let rangeStart: Chunk | null = null;
    let rangeEnd: Chunk | null = null;
    let beforeRange: Chunk | null = null;

    while (current !== null) {
      if (current.start === start) {
        rangeStart = current;
        beforeRange = prev;
      }
      if (rangeStart !== null && current.start < end) {
        movedChunks.push(current);
        rangeEnd = current;
      }
      if (current.start >= end && rangeStart !== null) {
        break;
      }
      prev = current;
      current = current.next;
    }

    const afterRange = rangeEnd!.next;

    // Remove from current position
    if (beforeRange !== null) {
      beforeRange.next = afterRange;
    } else {
      this.firstChunk = afterRange!;
    }

    // Update lastChunk if needed
    if (rangeEnd === this.lastChunk) {
      this.lastChunk = beforeRange!;
    }

    // Insert before the chunk at `index`
    let insertAfter: Chunk | null = null;
    let c: Chunk | null = this.firstChunk;
    let p: Chunk | null = null;
    while (c !== null) {
      if (c.start === index) {
        insertAfter = p;
        break;
      }
      p = c;
      c = c.next;
    }

    if (insertAfter === null && index === 0) {
      rangeEnd!.next = this.firstChunk;
      this.firstChunk = rangeStart!;
    } else if (insertAfter !== null) {
      rangeEnd!.next = insertAfter.next;
      insertAfter.next = rangeStart!;
      if (insertAfter === this.lastChunk) {
        this.lastChunk = rangeEnd!;
      }
    } else {
      // Insert at end
      this.lastChunk.next = rangeStart!;
      rangeEnd!.next = null;
      this.lastChunk = rangeEnd!;
    }

    return this;
  }

  /**
   * Add a prefix to the start of each line.
   */
  indent(prefix: string): MagicString {
    // Prepend to first line
    this.intro = prefix + this.intro;

    // Add prefix after each newline in all chunks
    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      current.content = current.content.replace(/\n/g, "\n" + prefix);
      current.intro = current.intro.replace(/\n/g, "\n" + prefix);
      current.outro = current.outro.replace(/\n/g, "\n" + prefix);
      current = current.next;
    }

    this.outro = this.outro.replace(/\n/g, "\n" + prefix);

    return this;
  }

  /**
   * Trim whitespace from start and end.
   */
  trim(): MagicString {
    return this.trimStart().trimEnd();
  }

  /**
   * Trim whitespace from the start.
   */
  trimStart(): MagicString {
    // Trim intro first
    const trimmedIntro = this.intro.replace(/^\s+/, "");
    if (trimmedIntro.length < this.intro.length) {
      this.intro = trimmedIntro;
      if (this.intro.length > 0) {
        return this;
      }
    }

    // Then trim chunks from the start
    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      const fullContent = current.intro + current.content + current.outro;
      const trimmed = fullContent.replace(/^\s+/, "");
      if (trimmed.length === 0) {
        current.intro = "";
        current.content = "";
        current.outro = "";
        current.edited = true;
        current = current.next;
      } else {
        // Partial trim: figure out where the trim ends
        const trimmedAmount = fullContent.length - trimmed.length;
        if (trimmedAmount <= current.intro.length) {
          current.intro = current.intro.slice(trimmedAmount);
        } else if (
          trimmedAmount <=
          current.intro.length + current.content.length
        ) {
          const contentTrim = trimmedAmount - current.intro.length;
          current.intro = "";
          current.content = current.content.slice(contentTrim);
          current.edited = true;
        } else {
          const outroTrim =
            trimmedAmount - current.intro.length - current.content.length;
          current.intro = "";
          current.content = "";
          current.edited = true;
          current.outro = current.outro.slice(outroTrim);
        }
        break;
      }
    }

    return this;
  }

  /**
   * Trim whitespace from the end.
   */
  trimEnd(): MagicString {
    // Trim outro first
    const trimmedOutro = this.outro.replace(/\s+$/, "");
    if (trimmedOutro.length < this.outro.length) {
      this.outro = trimmedOutro;
      if (this.outro.length > 0) {
        return this;
      }
    }

    // Then trim chunks from the end (iterate to find last non-empty)
    // Build array for reverse iteration (no recursion)
    const chunks: Chunk[] = [];
    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      chunks.push(current);
      current = current.next;
    }

    for (let i = chunks.length - 1; i >= 0; i--) {
      const chunk = chunks[i];
      const fullContent = chunk.intro + chunk.content + chunk.outro;
      const trimmed = fullContent.replace(/\s+$/, "");
      if (trimmed.length === 0) {
        chunk.intro = "";
        chunk.content = "";
        chunk.outro = "";
        chunk.edited = true;
      } else {
        const trimmedAmount = fullContent.length - trimmed.length;
        if (trimmedAmount <= chunk.outro.length) {
          chunk.outro = chunk.outro.slice(
            0,
            chunk.outro.length - trimmedAmount,
          );
        } else if (trimmedAmount <= chunk.outro.length + chunk.content.length) {
          const contentTrim = trimmedAmount - chunk.outro.length;
          chunk.outro = "";
          chunk.content = chunk.content.slice(
            0,
            chunk.content.length - contentTrim,
          );
          chunk.edited = true;
        } else {
          const introTrim =
            trimmedAmount - chunk.outro.length - chunk.content.length;
          chunk.outro = "";
          chunk.content = "";
          chunk.edited = true;
          chunk.intro = chunk.intro.slice(0, chunk.intro.length - introTrim);
        }
        break;
      }
    }

    return this;
  }

  /**
   * Build the output string from all chunks.
   */
  toString(): string {
    let result = this.intro;
    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      result += current.intro + current.content + current.outro;
      current = current.next;
    }
    result += this.outro;
    return result;
  }

  /**
   * Generate a decoded source map (numeric arrays).
   */
  generateDecodedMap(options?: MapOptions): DecodedSourceMap {
    const opts = options ?? {};
    const sourceName = opts.source ?? "";
    const mappings: number[][][] = [];
    let generatedLine = 0;
    let generatedColumn = 0;
    let currentLineMappings: number[][] = [];

    // Account for intro newlines
    const introLines = this.intro.split("\n");
    for (let i = 0; i < introLines.length - 1; i++) {
      mappings.push([]);
      generatedLine++;
    }
    generatedColumn = introLines[introLines.length - 1].length;

    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      const fullContent = current.intro + current.content + current.outro;

      if (fullContent.length > 0 && !current.edited) {
        // Unedited chunk: map each character back to original
        currentLineMappings.push([
          generatedColumn,
          0,
          this.getOriginalLine(current.start),
          this.getOriginalColumn(current.start),
        ]);
      } else if (
        fullContent.length > 0 &&
        current.edited &&
        current.content.length > 0
      ) {
        // Edited chunk: map start to original start
        currentLineMappings.push([
          generatedColumn,
          0,
          this.getOriginalLine(current.start),
          this.getOriginalColumn(current.start),
        ]);
      }

      // Advance generated position through the content
      const lines = fullContent.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          mappings.push(currentLineMappings);
          currentLineMappings = [];
          generatedLine++;
          generatedColumn = 0;

          // Add mapping for continuation of chunk on new line
          if (!current.edited && i < lines.length) {
            const originalOffset =
              current.start + fullContent.indexOf("\n") + 1;
            // Calculate how far into the original we are
            let newlineCount = 0;
            let pos = 0;
            for (let j = 0; j < fullContent.length && newlineCount < i; j++) {
              if (fullContent[j] === "\n") {
                newlineCount++;
              }
              pos = j + 1;
            }
            if (pos <= current.original.length) {
              currentLineMappings.push([
                0,
                0,
                this.getOriginalLine(current.start + pos),
                this.getOriginalColumn(current.start + pos),
              ]);
            }
          }
        }
        generatedColumn += lines[i].length;
      }

      current = current.next;
    }

    // Handle outro newlines
    const outroLines = this.outro.split("\n");
    for (let i = 0; i < outroLines.length - 1; i++) {
      mappings.push(currentLineMappings);
      currentLineMappings = [];
    }

    mappings.push(currentLineMappings);

    const result: DecodedSourceMap = {
      version: 3,
      sources: [sourceName],
      sourcesContent: opts.includeContent ? [this.original] : [null],
      names: [],
      mappings,
    };

    if (opts.file !== undefined) {
      return { ...result, file: opts.file };
    }

    return result;
  }

  /**
   * Generate an encoded source map with VLQ mappings.
   */
  generateMap(options?: MapOptions): SourceMapData {
    const decoded = this.generateDecodedMap(options);
    const encodedMappings = this.encodeMappings(decoded.mappings);

    const result: SourceMapData = {
      version: 3,
      sources: decoded.sources,
      sourcesContent: decoded.sourcesContent,
      names: decoded.names,
      mappings: encodedMappings,
    };

    if (decoded.file !== undefined) {
      return { ...result, file: decoded.file };
    }

    return result;
  }

  /**
   * Create an independent clone of this MagicString.
   */
  clone(): MagicString {
    const cloned = new MagicString(this.original);
    cloned.intro = this.intro;
    cloned.outro = this.outro;

    // Rebuild the chunk list
    let srcChunk: Chunk | null = this.firstChunk;
    const firstClonedChunk = createChunk(
      srcChunk.start,
      srcChunk.end,
      srcChunk.original,
    );
    firstClonedChunk.content = srcChunk.content;
    firstClonedChunk.intro = srcChunk.intro;
    firstClonedChunk.outro = srcChunk.outro;
    firstClonedChunk.edited = srcChunk.edited;

    cloned.firstChunk = firstClonedChunk;
    let lastCloned = firstClonedChunk;

    srcChunk = srcChunk.next;
    while (srcChunk !== null) {
      const newChunk = createChunk(
        srcChunk.start,
        srcChunk.end,
        srcChunk.original,
      );
      newChunk.content = srcChunk.content;
      newChunk.intro = srcChunk.intro;
      newChunk.outro = srcChunk.outro;
      newChunk.edited = srcChunk.edited;
      lastCloned.next = newChunk;
      lastCloned = newChunk;
      srcChunk = srcChunk.next;
    }

    cloned.lastChunk = lastCloned;
    return cloned;
  }

  /**
   * Extract a sub-range as a new MagicString.
   */
  snip(start: number, end: number): MagicString {
    const snipped = this.original.slice(start, end);
    return new MagicString(snipped);
  }

  /**
   * Returns true if any edit has been made.
   */
  hasChanged(): boolean {
    if (this.intro.length > 0 || this.outro.length > 0) {
      return true;
    }

    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      if (
        current.edited ||
        current.intro.length > 0 ||
        current.outro.length > 0
      ) {
        return true;
      }
      current = current.next;
    }

    return false;
  }

  /**
   * Get a slice of the original source string.
   */
  slice(start: number, end?: number): string {
    const resolvedEnd = end ?? this.original.length;
    this.validateRange(start, resolvedEnd);
    return this.original.slice(start, resolvedEnd);
  }

  /**
   * Validate that a range [start, end) is within bounds.
   */
  private validateRange(start: number, end: number): void {
    if (start < 0 || end > this.original.length) {
      throw new RangeError(
        `Character is out of bounds (start=${start}, end=${end}, length=${this.original.length})`,
      );
    }
    if (start > end) {
      throw new RangeError(
        `start must be less than or equal to end (start=${start}, end=${end})`,
      );
    }
  }

  /**
   * Validate that an index is within [0, length].
   */
  private validateIndex(index: number): void {
    if (index < 0 || index > this.original.length) {
      throw new RangeError(
        `Index out of bounds (index=${index}, length=${this.original.length})`,
      );
    }
  }

  /**
   * Split the chunk list so that a chunk boundary exists at `index`.
   */
  private splitAtIndex(index: number): void {
    if (index === 0 || index === this.original.length) {
      return;
    }

    let current: Chunk | null = this.firstChunk;
    while (current !== null) {
      if (current.start < index && current.end > index) {
        if (current.edited) {
          throw new RangeError(
            `Cannot split a chunk that has already been edited (${current.start}-${current.end}, splitting at ${index})`,
          );
        }
        splitChunk(current, index);
        if (current.next !== null && current.next.next === null) {
          this.lastChunk = current.next;
        } else {
          // Walk to find the real last chunk
          let last = current;
          while (last.next !== null) {
            last = last.next;
          }
          this.lastChunk = last;
        }
        return;
      }
      current = current.next;
    }
  }

  /**
   * Get the 0-based line number of a position in the original string.
   */
  private getOriginalLine(index: number): number {
    let line = 0;
    for (let i = 0; i < index && i < this.original.length; i++) {
      if (this.original[i] === "\n") {
        line++;
      }
    }
    return line;
  }

  /**
   * Get the 0-based column number of a position in the original string.
   */
  private getOriginalColumn(index: number): number {
    let column = 0;
    for (let i = index - 1; i >= 0; i--) {
      if (this.original[i] === "\n") {
        break;
      }
      column++;
    }
    return column;
  }

  /**
   * Encode decoded mappings to VLQ string.
   */
  private encodeMappings(
    mappings: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>,
  ): string {
    let previousGeneratedColumn = 0;
    let previousOriginalLine = 0;
    let previousOriginalColumn = 0;
    let previousSource = 0;

    const lines: string[] = [];

    for (let i = 0; i < mappings.length; i++) {
      const line = mappings[i];
      const segments: string[] = [];
      previousGeneratedColumn = 0;

      for (let j = 0; j < line.length; j++) {
        const segment = line[j];
        let encoded = "";

        // Generated column (relative to previous in same line)
        encoded += encodeVlq(segment[0] - previousGeneratedColumn);
        previousGeneratedColumn = segment[0];

        if (segment.length >= 4) {
          // Source index
          encoded += encodeVlq(segment[1] - previousSource);
          previousSource = segment[1];

          // Original line
          encoded += encodeVlq(segment[2] - previousOriginalLine);
          previousOriginalLine = segment[2];

          // Original column
          encoded += encodeVlq(segment[3] - previousOriginalColumn);
          previousOriginalColumn = segment[3];
        }

        segments.push(encoded);
      }

      lines.push(segments.join(","));
    }

    return lines.join(";");
  }
}
