#!/usr/bin/env node
// PreToolUse guard: in the MAIN checkout only planning docs may be edited.
// Application code must be changed by a builder inside its own git worktree.
// Edits inside linked worktrees or outside the project are always allowed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Docs-only paths come from <project>/.claude/agent-system.json ("docsOnlyPaths"); these are the defaults.
const DEFAULT_PREFIXES = ["docs/", ".claude/", ".github/pull_request_template.md", ".github/ISSUE_TEMPLATE/"];
const ALLOWED_ROOT_FILES = /^[^/]+\.md$/; // README.md, CLAUDE.md, etc.

function loadAllowedPrefixes(projectDir) {
  const configPath = path.join(projectDir, ".claude", "agent-system.json");
  if (!existsSync(configPath)) return DEFAULT_PREFIXES;
  try {
    const { docsOnlyPaths } = JSON.parse(readFileSync(configPath, "utf8"));
    return Array.isArray(docsOnlyPaths) ? docsOnlyPaths : DEFAULT_PREFIXES;
  } catch (err) {
    console.error(`[guard] invalid ${configPath}: ${err.message}; using defaults`);
    return DEFAULT_PREFIXES;
  }
}

function nearestExistingDir(p) {
  let dir = path.dirname(p);
  while (!existsSync(dir) && dir !== path.dirname(dir)) dir = path.dirname(dir);
  return dir;
}

function isLinkedWorktree(dir) {
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--absolute-git-dir", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().split("\n");
    const [gitDir, commonDir] = out.map((d) => path.resolve(dir, d));
    return gitDir !== commonDir;
  } catch {
    return false;
  }
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch (err) {
  console.error(`[guard] could not parse hook input: ${err.message}`);
  process.exit(0); // fail open on malformed input rather than blocking all edits
}

const target = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input?.cwd;
if (!target || !projectDir) process.exit(0);

const abs = path.resolve(projectDir, target);
const rel = path.relative(projectDir, abs);
const outsideProject = rel.startsWith("..") || path.isAbsolute(rel);
if (outsideProject || isLinkedWorktree(nearestExistingDir(abs))) process.exit(0);

const relPosix = rel.split(path.sep).join("/");
if (loadAllowedPrefixes(projectDir).some((p) => relPosix.startsWith(p)) || ALLOWED_ROOT_FILES.test(relPosix)) process.exit(0);

console.error(
  `[guard] Blocked edit to "${relPosix}" in the main checkout. ` +
    "Application code, tests, CI and dependency files are changed only by a builder in its own git worktree. " +
    "Create or route a ticket instead."
);
process.exit(2);
