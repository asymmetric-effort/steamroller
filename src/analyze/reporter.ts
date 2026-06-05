/**
 * @module analyze/reporter
 * @description Output formatters for bundle analysis results.
 * Supports text (terminal table), JSON, and self-contained HTML treemap.
 */

import { bold, cyan, yellow, green, gray, dim, red } from "../utils/colors.js";
import type { AnalysisResult, ChunkAnalysis, ModuleAnalysis } from "./types.js";

/**
 * Format a byte count into a human-readable string.
 *
 * @param bytes - The number of bytes
 * @returns A formatted string like "1.23 kB" or "456 B"
 */
const formatSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} kB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * Pad a string to the right to a given width.
 */
const padRight = (str: string, width: number): string => {
  if (str.length >= width) {
    return str;
  }
  return str + " ".repeat(width - str.length);
};

/**
 * Pad a string to the left to a given width.
 */
const padLeft = (str: string, width: number): string => {
  if (str.length >= width) {
    return str;
  }
  return " ".repeat(width - str.length) + str;
};

/**
 * Shorten a module ID for display by taking only the last N path segments.
 */
const shortenId = (id: string, maxLen: number = 50): string => {
  if (id.length <= maxLen) {
    return id;
  }
  return "..." + id.slice(id.length - maxLen + 3);
};

/**
 * Generate a text report with ANSI colors for terminal output.
 *
 * @param result - The analysis result to format
 * @returns A string suitable for printing to the terminal
 */
export const formatText = (result: AnalysisResult): string => {
  const lines: Array<string> = [];

  lines.push("");
  lines.push(bold("Bundle Analysis"));
  lines.push(dim("─".repeat(60)));
  lines.push("");

  // Summary
  lines.push(`${bold("Total size:")}  ${cyan(formatSize(result.totalSize))}`);
  lines.push(`${bold("Chunks:")}      ${result.chunks.length}`);
  lines.push(`${bold("Modules:")}     ${result.totalModules}`);
  lines.push("");

  // Tree-shaking stats
  const ts = result.treeShakeStats;
  lines.push(bold("Tree-shaking"));
  lines.push(dim("─".repeat(60)));
  lines.push(`  Original:  ${formatSize(ts.totalOriginalSize)}`);
  lines.push(`  Rendered:  ${formatSize(ts.totalRenderedSize)}`);
  lines.push(
    `  Removed:   ${green(formatSize(ts.removedBytes))} (${green(ts.removedPercent.toFixed(1) + "%")})`,
  );
  if (ts.totalExports > 0) {
    lines.push(
      `  Exports:   ${ts.removedExports} of ${ts.totalExports} removed`,
    );
  }
  lines.push("");

  // Per-chunk breakdown
  for (let i = 0; i < result.chunks.length; i++) {
    const chunk = result.chunks[i];
    const entryLabel = chunk.isEntry ? yellow(" [entry]") : "";
    lines.push(bold(`Chunk: ${cyan(chunk.fileName)}${entryLabel}`));
    lines.push(
      `  Size: ${formatSize(chunk.totalSize)}  Modules: ${chunk.moduleCount}`,
    );

    if (chunk.modules.length > 0) {
      lines.push("");
      lines.push(
        `  ${padRight("Module", 52)} ${padLeft("Size", 10)} ${padLeft("%", 7)}`,
      );
      lines.push(`  ${dim("─".repeat(69))}`);

      const displayModules = chunk.modules.slice(0, 15);
      for (let j = 0; j < displayModules.length; j++) {
        const mod = displayModules[j];
        const name = shortenId(mod.id);
        const size = formatSize(mod.renderedSize);
        const pct = mod.percentOfChunk.toFixed(1) + "%";
        lines.push(
          `  ${padRight(name, 52)} ${padLeft(size, 10)} ${padLeft(pct, 7)}`,
        );
      }

      if (chunk.modules.length > 15) {
        lines.push(gray(`  ... and ${chunk.modules.length - 15} more modules`));
      }
    }

    lines.push("");
  }

  // Duplicates
  if (result.duplicates.length > 0) {
    lines.push(bold(red("Duplicate Modules")));
    lines.push(dim("─".repeat(60)));
    for (let i = 0; i < result.duplicates.length; i++) {
      const dup = result.duplicates[i];
      lines.push(
        `  ${shortenId(dup.id)} (${dup.chunks.length}x, wasted: ${yellow(formatSize(dup.wastedBytes))})`,
      );
      for (let j = 0; j < dup.chunks.length; j++) {
        lines.push(gray(`    -> ${dup.chunks[j]}`));
      }
    }
    lines.push("");
  }

  // Largest modules
  if (result.largestModules.length > 0) {
    lines.push(bold("Largest Modules"));
    lines.push(dim("─".repeat(60)));
    const topN = Math.min(10, result.largestModules.length);
    for (let i = 0; i < topN; i++) {
      const mod = result.largestModules[i];
      lines.push(
        `  ${padRight(shortenId(mod.id, 45), 47)} ${padLeft(formatSize(mod.renderedSize), 10)}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
};

/**
 * Generate a JSON report as a string.
 *
 * @param result - The analysis result to format
 * @returns A JSON string with the full analysis data
 */
export const formatJson = (result: AnalysisResult): string => {
  return JSON.stringify(result, null, 2);
};

/**
 * Build a treemap data structure for the HTML visualization.
 */
const buildTreemapData = (chunks: ReadonlyArray<ChunkAnalysis>): string => {
  const data: Array<{
    name: string;
    isEntry: boolean;
    size: number;
    modules: Array<{ name: string; size: number; percent: number }>;
  }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const modules: Array<{ name: string; size: number; percent: number }> = [];
    for (let j = 0; j < chunk.modules.length; j++) {
      const mod = chunk.modules[j];
      modules.push({
        name: mod.id,
        size: mod.renderedSize,
        percent: mod.percentOfChunk,
      });
    }
    data.push({
      name: chunk.fileName,
      isEntry: chunk.isEntry,
      size: chunk.totalSize,
      modules,
    });
  }

  return JSON.stringify(data);
};

/**
 * Escape a string for safe embedding in HTML.
 */
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

/**
 * Generate a self-contained HTML report with an interactive treemap.
 * The output is a single HTML file with inline CSS and JS, no external deps.
 *
 * @param result - The analysis result to visualize
 * @returns A complete HTML string
 */
export const formatHtml = (result: AnalysisResult): string => {
  const treemapData = buildTreemapData(result.chunks);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Steamroller Bundle Analysis</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; }
.header { padding: 20px; background: #16213e; border-bottom: 2px solid #0f3460; }
.header h1 { font-size: 1.4rem; color: #e94560; }
.summary { display: flex; gap: 20px; padding: 16px 20px; background: #16213e; border-bottom: 1px solid #0f3460; flex-wrap: wrap; }
.stat { padding: 8px 16px; background: #1a1a2e; border-radius: 6px; }
.stat .label { font-size: 0.75rem; color: #888; text-transform: uppercase; }
.stat .value { font-size: 1.2rem; font-weight: bold; color: #e94560; }
.treemap-container { padding: 20px; }
.treemap { display: flex; flex-wrap: wrap; gap: 4px; }
.chunk-group { margin-bottom: 16px; }
.chunk-title { font-size: 0.9rem; font-weight: bold; padding: 6px 0; color: #50b8e7; }
.modules-grid { display: flex; flex-wrap: wrap; gap: 2px; }
.module-box { padding: 6px 8px; border-radius: 3px; font-size: 0.7rem; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 40px; transition: opacity 0.2s; }
.module-box:hover { opacity: 0.8; }
.tooltip { position: fixed; background: #16213e; border: 1px solid #0f3460; padding: 10px; border-radius: 6px; font-size: 0.8rem; pointer-events: none; z-index: 100; display: none; max-width: 400px; }
.tooltip .tt-name { color: #50b8e7; font-weight: bold; word-break: break-all; }
.tooltip .tt-size { color: #e94560; }
.table-section { padding: 20px; }
.table-section h2 { font-size: 1.1rem; margin-bottom: 10px; color: #50b8e7; }
table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #0f3460; }
th { color: #888; font-size: 0.75rem; text-transform: uppercase; }
td { font-size: 0.85rem; }
.size-col { text-align: right; color: #e94560; }
.pct-col { text-align: right; color: #50b8e7; }
.dup-warn { color: #e9c46a; }
</style>
</head>
<body>
<div class="header"><h1>Steamroller Bundle Analysis</h1></div>
<div class="summary">
  <div class="stat"><div class="label">Total Size</div><div class="value" id="total-size"></div></div>
  <div class="stat"><div class="label">Chunks</div><div class="value">${result.chunks.length}</div></div>
  <div class="stat"><div class="label">Modules</div><div class="value">${result.totalModules}</div></div>
  <div class="stat"><div class="label">Tree-shaken</div><div class="value">${result.treeShakeStats.removedPercent.toFixed(1)}%</div></div>
  <div class="stat"><div class="label">Duplicates</div><div class="value${result.duplicates.length > 0 ? " dup-warn" : ""}">${result.duplicates.length}</div></div>
</div>
<div class="treemap-container" id="treemap"></div>
<div class="table-section">
  <h2>Largest Modules</h2>
  <table><thead><tr><th>Module</th><th class="size-col">Size</th></tr></thead><tbody id="largest-table"></tbody></table>
</div>
<div class="tooltip" id="tooltip"><div class="tt-name" id="tt-name"></div><div class="tt-size" id="tt-size"></div></div>
<script>
(function() {
  var data = ${treemapData};
  var totalSize = ${result.totalSize};
  var largestModules = ${JSON.stringify(result.largestModules.map((m: ModuleAnalysis) => ({ id: m.id, renderedSize: m.renderedSize })))};

  function formatSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(2) + " kB";
    return (b / 1048576).toFixed(2) + " MB";
  }

  document.getElementById("total-size").textContent = formatSize(totalSize);

  var colors = ["#e94560","#50b8e7","#e9c46a","#2a9d8f","#f4a261","#264653","#e76f51","#606c38","#bc6c25","#8338ec"];
  var treemapEl = document.getElementById("treemap");
  var tooltip = document.getElementById("tooltip");
  var ttName = document.getElementById("tt-name");
  var ttSize = document.getElementById("tt-size");

  for (var i = 0; i < data.length; i++) {
    var chunk = data[i];
    var group = document.createElement("div");
    group.className = "chunk-group";
    var title = document.createElement("div");
    title.className = "chunk-title";
    title.textContent = chunk.name + (chunk.isEntry ? " [entry]" : "") + " (" + formatSize(chunk.size) + ")";
    group.appendChild(title);
    var grid = document.createElement("div");
    grid.className = "modules-grid";
    var baseColor = colors[i % colors.length];
    for (var j = 0; j < chunk.modules.length; j++) {
      var mod = chunk.modules[j];
      var box = document.createElement("div");
      box.className = "module-box";
      var w = Math.max(40, Math.min(400, (mod.size / Math.max(1, chunk.size)) * 800));
      box.style.width = w + "px";
      box.style.background = baseColor;
      box.setAttribute("data-name", mod.name);
      box.setAttribute("data-size", String(mod.size));
      box.setAttribute("data-pct", mod.percent.toFixed(1));
      var parts = mod.name.split("/");
      box.textContent = parts[parts.length - 1] || mod.name;
      grid.appendChild(box);
    }
    group.appendChild(grid);
    treemapEl.appendChild(group);
  }

  document.addEventListener("mousemove", function(e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains("module-box")) {
      tooltip.style.display = "block";
      tooltip.style.left = (e.clientX + 12) + "px";
      tooltip.style.top = (e.clientY + 12) + "px";
      ttName.textContent = t.getAttribute("data-name");
      ttSize.textContent = formatSize(parseInt(t.getAttribute("data-size"), 10)) + " (" + t.getAttribute("data-pct") + "%)";
    } else {
      tooltip.style.display = "none";
    }
  });

  var tbody = document.getElementById("largest-table");
  for (var k = 0; k < largestModules.length; k++) {
    var m = largestModules[k];
    var tr = document.createElement("tr");
    var td1 = document.createElement("td");
    td1.textContent = m.id;
    var td2 = document.createElement("td");
    td2.className = "size-col";
    td2.textContent = formatSize(m.renderedSize);
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
})();
</script>
</body>
</html>`;
};
