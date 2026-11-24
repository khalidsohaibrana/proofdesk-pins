#!/usr/bin/env node
// PreToolUse hook: never more than N subagents running at once (default 7).
// Gates new dispatches (Agent/Task) and resuming a finished agent (SendMessage).
// Counts running agents from the agent dashboard, which tracks every dispatch live.
// Limit: "maxConcurrentAgents" in .claude/agent-system.json. Dashboard: AGENT_DASHBOARD_URL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_LIMIT = 7;
const DASHBOARD = process.env.AGENT_DASHBOARD_URL || 'http://127.0.0.1:4173';
const SETTLE_MS = 400;       // let the dashboard ingest the dispatch event first
const TIMEOUT_MS = 2500;
const GATED = new Set(['Agent', 'Task', 'SendMessage']);

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function limitFor(projectDir) {
  try {
    const config = JSON.parse(readFileSync(join(projectDir, '.claude', 'agent-system.json'), 'utf8'));
    return Number.isInteger(config.maxConcurrentAgents) && config.maxConcurrentAgents > 0 ? config.maxConcurrentAgents : DEFAULT_LIMIT;
  } catch {
    return DEFAULT_LIMIT;
  }
}

async function runningAgents() {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const response = await fetch(`${DASHBOARD}/api/state`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`dashboard answered ${response.status}`);
  const state = await response.json();
  return Object.values(state.agents ?? {}).filter((agent) => agent.status === 'running');
}

const input = readInput();
if (!GATED.has(input.tool_name)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const limit = limitFor(projectDir);

let running;
try {
  running = await runningAgents();
} catch (error) {
  // No dashboard (e.g. a plain terminal session): the supervisor's written rule still applies.
  process.stderr.write(`[cap] could not reach the agent dashboard (${error.message}); cap not enforced for this call\n`);
  process.exit(0);
}

// Messaging an agent that is still running doesn't add a new one.
if (input.tool_name === 'SendMessage') {
  const target = input.tool_input?.to;
  if (running.some((agent) => agent.taskId === target)) process.exit(0);
}

// The dispatch being checked may already be counted by the dashboard; don't count it against itself.
const others = running.filter((agent) => agent.id !== input.tool_use_id);
if (others.length < limit) process.exit(0);

const names = others.map((agent) => `${agent.type}: ${agent.description}`).slice(0, limit).join('; ');
process.stderr.write(
  `[cap] Blocked: ${others.length} subagents are already running (limit ${limit}). `
  + 'Wait for one to finish (check with TaskOutput or Monitor), then dispatch. '
  + `Running now: ${names}\n`,
);
process.exit(2);
