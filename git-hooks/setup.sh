#!/usr/bin/env bash
set -euo pipefail

# Set up git hooks by configuring git to use the git-hooks/ directory.
# Works on Linux, macOS, and Windows (Git Bash / WSL).

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

git -C "$REPO_ROOT" config core.hooksPath git-hooks
echo "Git hooks configured: core.hooksPath = git-hooks"
