import { execSync } from 'node:child_process';

export interface ComparisonResult {
  readonly input: string;
  readonly rollupOutput: string;
  readonly steamrollerOutput: string;
  readonly match: boolean;
  readonly diagnostics: ReadonlyArray<string>;
}

export interface HarnessOptions {
  readonly inputDir: string;
  readonly outputDir: string;
  readonly rollupConfig?: string;
  readonly steamrollerConfig?: string;
}

export const runRollup = (inputFile: string, outputFile: string, configFile?: string): string => {
  const configArg = configFile ? `--config ${configFile}` : '';
  const result = execSync(
    `npx rollup ${inputFile} --file ${outputFile} ${configArg}`,
    { encoding: 'utf-8' }
  );
  return result;
};

export const runSteamroller = (inputFile: string, outputFile: string, configFile?: string): string => {
  // TODO: Replace with steamroller CLI once implemented
  throw new Error('steamroller CLI not yet implemented');
};

export const diffOutputs = (rollupOutput: string, steamrollerOutput: string): ComparisonResult => {
  const diagnostics: Array<string> = [];
  const match = rollupOutput === steamrollerOutput;

  if (!match) {
    const rollupLines = rollupOutput.split('\n');
    const steamrollerLines = steamrollerOutput.split('\n');

    if (rollupLines.length !== steamrollerLines.length) {
      diagnostics.push(
        `Line count mismatch: rollup=${rollupLines.length}, steamroller=${steamrollerLines.length}`
      );
    }

    const maxLines = Math.max(rollupLines.length, steamrollerLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (rollupLines[i] !== steamrollerLines[i]) {
        diagnostics.push(`Line ${i + 1} differs:`);
        diagnostics.push(`  rollup:       ${rollupLines[i] ?? '<missing>'}`);
        diagnostics.push(`  steamroller:  ${steamrollerLines[i] ?? '<missing>'}`);
        if (diagnostics.length > 30) {
          diagnostics.push('... (truncated)');
          break;
        }
      }
    }
  }

  return {
    input: '',
    rollupOutput,
    steamrollerOutput,
    match,
    diagnostics,
  };
};

export const runComparison = (options: HarnessOptions): ReadonlyArray<ComparisonResult> => {
  const results: Array<ComparisonResult> = [];
  // TODO: Implement full comparison workflow once steamroller CLI exists
  return results;
};
