import { describe, it, expect } from "vitest";
import {
  testRealWorldProject,
  runRealWorldSuite,
  getTargetProjectNames,
  TARGET_PROJECTS,
} from "../../compat/real-world.js";
import type { RealWorldProjectConfig } from "../../compat/real-world.js";

describe("real-world project testing", () => {
  describe("testRealWorldProject", () => {
    it("succeeds with valid project configuration", async () => {
      const config: RealWorldProjectConfig = {
        name: "test-project",
        repo: "https://github.com/example/test.git",
        buildCommand: "npx steamroller src/index.js --file dist/bundle.js",
      };

      const result = await testRealWorldProject(config);
      expect(result.success).toBe(true);
      expect(result.projectName).toBe("test-project");
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("fails when name is empty", async () => {
      const config: RealWorldProjectConfig = {
        name: "",
        repo: "https://github.com/example/test.git",
        buildCommand: "build",
      };

      const result = await testRealWorldProject(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("name");
    });

    it("fails when repo is empty", async () => {
      const config: RealWorldProjectConfig = {
        name: "test",
        repo: "",
        buildCommand: "build",
      };

      const result = await testRealWorldProject(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Repository URL");
    });

    it("fails when buildCommand is empty", async () => {
      const config: RealWorldProjectConfig = {
        name: "test",
        repo: "https://github.com/example/test.git",
        buildCommand: "",
      };

      const result = await testRealWorldProject(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Build command");
    });

    it("includes warning about E2E not being functional", async () => {
      const config: RealWorldProjectConfig = {
        name: "test-project",
        repo: "https://github.com/example/test.git",
        buildCommand: "npx steamroller src/index.js --file dist/bundle.js",
      };

      const result = await testRealWorldProject(config);
      expect(
        result.warnings.some((w) => w.includes("not yet functional")),
      ).toBe(true);
    });
  });

  describe("runRealWorldSuite", () => {
    it("runs all target projects", async () => {
      const result = await runRealWorldSuite();
      expect(result.total).toBe(TARGET_PROJECTS.length);
      expect(result.passed).toBe(TARGET_PROJECTS.length);
      expect(result.failed).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.results).toHaveLength(TARGET_PROJECTS.length);
    });

    it("produces results for each target project", async () => {
      const result = await runRealWorldSuite();
      const names = result.results.map((r) => r.projectName);
      expect(names).toContain("lodash-es");
      expect(names).toContain("d3");
      expect(names).toContain("three");
      expect(names).toContain("vue");
      expect(names).toContain("react");
      expect(names).toContain("preact");
    });
  });

  describe("getTargetProjectNames", () => {
    it("returns list of all target project names", () => {
      const names = getTargetProjectNames();
      expect(names.length).toBeGreaterThanOrEqual(6);
      expect(names).toContain("lodash-es");
      expect(names).toContain("d3");
      expect(names).toContain("three");
      expect(names).toContain("vue");
      expect(names).toContain("react");
      expect(names).toContain("preact");
    });
  });

  describe("TARGET_PROJECTS", () => {
    it("all projects have required fields", () => {
      for (let i = 0; i < TARGET_PROJECTS.length; i++) {
        const project = TARGET_PROJECTS[i];
        expect(project.name.length).toBeGreaterThan(0);
        expect(project.repo.length).toBeGreaterThan(0);
        expect(project.buildCommand.length).toBeGreaterThan(0);
        expect(project.repo).toMatch(/^https:\/\//);
      }
    });

    it("all projects have unique names", () => {
      const names = TARGET_PROJECTS.map((p) => p.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});
