/**
 * @module tests/compat/real-world
 * @description Framework to test steamroller against real npm packages.
 * Defines target projects and infrastructure for running real-world tests.
 */

/** Configuration for testing a real-world project. */
export interface RealWorldProjectConfig {
  readonly name: string;
  readonly repo: string;
  readonly buildCommand: string;
  readonly entryPoint?: string;
  readonly expectedOutputSize?: number;
  readonly timeout?: number;
}

/** Result of testing a real-world project. */
export interface TestResult {
  readonly projectName: string;
  readonly success: boolean;
  readonly duration: number;
  readonly outputSize?: number;
  readonly error?: string;
  readonly warnings: ReadonlyArray<string>;
}

/** Summary of all real-world project tests. */
export interface RealWorldSuiteResult {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: ReadonlyArray<TestResult>;
  readonly duration: number;
}

/** Target projects for real-world compatibility testing. */
export const TARGET_PROJECTS: ReadonlyArray<RealWorldProjectConfig> = [
  {
    name: "lodash-es",
    repo: "https://github.com/lodash/lodash.git",
    buildCommand: "npx steamroller src/lodash.js --file dist/lodash.bundle.js",
    entryPoint: "src/lodash.js",
  },
  {
    name: "d3",
    repo: "https://github.com/d3/d3.git",
    buildCommand: "npx steamroller src/index.js --file dist/d3.bundle.js",
    entryPoint: "src/index.js",
  },
  {
    name: "three",
    repo: "https://github.com/mrdoob/three.js.git",
    buildCommand: "npx steamroller src/Three.js --file dist/three.bundle.js",
    entryPoint: "src/Three.js",
  },
  {
    name: "vue",
    repo: "https://github.com/vuejs/core.git",
    buildCommand:
      "npx steamroller packages/vue/src/index.ts --file dist/vue.bundle.js",
    entryPoint: "packages/vue/src/index.ts",
  },
  {
    name: "react",
    repo: "https://github.com/facebook/react.git",
    buildCommand:
      "npx steamroller packages/react/index.js --file dist/react.bundle.js",
    entryPoint: "packages/react/index.js",
  },
  {
    name: "preact",
    repo: "https://github.com/preactjs/preact.git",
    buildCommand: "npx steamroller src/index.js --file dist/preact.bundle.js",
    entryPoint: "src/index.js",
  },
];

/**
 * Tests a real-world project by simulating a build.
 * Currently a placeholder that verifies config validity.
 * Actual git clone + build will be enabled once E2E is functional.
 */
export const testRealWorldProject = async (
  config: RealWorldProjectConfig,
): Promise<TestResult> => {
  const start = performance.now();
  const warnings: Array<string> = [];

  // Validate configuration
  if (!config.name) {
    return {
      projectName: config.name || "unknown",
      success: false,
      duration: performance.now() - start,
      error: "Project name is required",
      warnings,
    };
  }

  if (!config.repo) {
    return {
      projectName: config.name,
      success: false,
      duration: performance.now() - start,
      error: "Repository URL is required",
      warnings,
    };
  }

  if (!config.buildCommand) {
    return {
      projectName: config.name,
      success: false,
      duration: performance.now() - start,
      error: "Build command is required",
      warnings,
    };
  }

  // Placeholder: actual build will occur once steamroller is E2E functional
  warnings.push("Build not executed: steamroller E2E not yet functional");

  return {
    projectName: config.name,
    success: true,
    duration: performance.now() - start,
    warnings,
  };
};

/**
 * Runs tests against all target projects.
 */
export const runRealWorldSuite = async (): Promise<RealWorldSuiteResult> => {
  const start = performance.now();
  const results: Array<TestResult> = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < TARGET_PROJECTS.length; i++) {
    const result = await testRealWorldProject(TARGET_PROJECTS[i]);
    results.push(result);

    if (result.success) {
      passed++;
    } else {
      failed++;
    }
  }

  return {
    total: TARGET_PROJECTS.length,
    passed,
    failed,
    results,
    duration: performance.now() - start,
  };
};

/**
 * Returns the list of target project names.
 */
export const getTargetProjectNames = (): ReadonlyArray<string> => {
  return TARGET_PROJECTS.map((p) => p.name);
};
