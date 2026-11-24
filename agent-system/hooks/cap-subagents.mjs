#!/usr/bin/env node
// PreToolUse hook: caps how many subagents run at once, in total and per role.
// Gates new dispatches (Agent/Task) and resuming a finished agent (SendMessage).
// Counts running agents from the agent dashboard, which tracks every dispatch live.
// Limits: "agentLimits" in .claude/agent-system.json, e.g.
//   { "total": 7, "builder": 5, "reviewer": 1, "security-reviewer": 1, "qa": 1 }
// Only the human product owner changes these. Dashboard URL: AGENT_DASHBOARD_URL.
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

/** Limits from config: { total, <role>: n }. Falls back to a total of 7. */
export function limitsFor(projectDir) {
  try {
    const config = JSON.parse(readFileSync(join(projectDir, '.claude', 'agent-system.json'), 'utf8'));
    const limits = { ...(config.agentLimits ?? {}) };
    if (!Number.isInteger(limits.total)) limits.total = Number.isInteger(config.maxConcurrentAgents) ? config.maxConcurrentAgents : DEFAULT_LIMIT;
    return limits;
  } catch {
    return { total: DEFAULT_LIMIT };
  }
}

async function runningAgents() {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const response = await fetch(`${DASHBOARD}/api/state`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`dashboard answered ${response.status}`);
  const state = await response.json();
  return Object.values(state.agents ?? {});
}

const input = readInput();
if (!GATED.has(input.tool_name)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const limits = limitsFor(projectDir);

let all;
try {
  all = await runningAgents();
} catch (error) {
  // No dashboard (e.g. a plain terminal session): the supervisor's written rule still applies.
  process.stderr.write(`[cap] could not reach the agent dashboard (${error.message}); cap not enforced for this call\n`);
  process.exit(0);
}

const running = all.filter((agent) => agent.status === 'running');

// Which role is about to start: the dispatched subagent_type, or the type of the agent being resumed.
let role = input.tool_input?.subagent_type ?? null;
if (input.tool_name === 'SendMessage') {
  const target = input.tool_input?.to;
  // Messaging an agent that is still running doesn't add a new one.
  if (running.some((agent) => agent.taskId === target)) process.exit(0);
  role = all.find((agent) => agent.taskId === target)?.type ?? null;
}

// The dispatch being checked may already be counted by the dashboard; don't count it against itself.
const others = running.filter((agent) => agent.id !== input.tool_use_id);
const sameRole = role ? others.filter((agent) => agent.type === role) : [];
const roleLimit = role && Number.isInteger(limits[role]) ? limits[role] : null;

const block = (why) => {
  process.stderr.write(`[cap] Blocked: ${why} Wait for one to finish (check with TaskOutput or Monitor), then dispatch. `
    + 'Exceeding these limits needs the product owner\'s explicit approval; never change .claude/agent-system.json yourself. '
    + `Running now: ${others.map((agent) => `${agent.type}: ${agent.description}`).join('; ')}\n`);
  process.exit(2);
};
if (others.length >= limits.total) block(`${others.length} subagents are already running (team limit ${limits.total}).`);
if (roleLimit !== null && sameRole.length >= roleLimit) block(`${sameRole.length} ${role} already running (limit ${roleLimit} for this role).`);
process.exit(0);
