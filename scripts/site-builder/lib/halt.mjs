/**
 * Editor freeze ("MCP is working" backdrop).
 *
 * While an agent works on a site the editor shows a backdrop, so a human does
 * not edit underneath it and incoming SSE events do not trigger a mid-task
 * reload.
 *
 * In the MCP server this was per-process state, fired from dispatch on *every*
 * targeted call — deliberately moved out of tool descriptions because agents
 * skipped the instruction, or fired it after the mutation had already emitted
 * block:created and the editor had begun reloading. A one-shot CLI has no
 * resident process, so the map is persisted instead of dropped: same keys, same
 * 60-second idle reset, same "mark before the await" ordering.
 *
 * halt:end stays agent-driven — only the agent knows the task is over. The
 * editor's backdrop has a manual Dismiss for when it forgets.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const IDLE_RESET_MS = 60_000;

function stateDir() {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'xsolla-ai-kit');
}

function statePath() {
  return join(stateDir(), 'site-builder-halt.json');
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(statePath(), JSON.stringify(state), 'utf8');
  } catch (error) {
    // A read-only cache dir must not break a write tool.
    process.stderr.write(`warning: could not persist halt state (${error.message})\n`);
  }
}

const keyOf = (t) => `${t.merchantId}:${t.projectId}:${t.domain}`;

export function createHalt(notify, { now = () => Date.now() } = {}) {
  /**
   * Called before every targeted tool, read or write — so the backdrop covers
   * the whole thinking phase, not just the final mutation.
   */
  async function freezeOnCall(target, { clock = now } = {}) {
    if (!target?.merchantId || !target?.projectId || !target?.domain) return { fired: false };
    const key = keyOf(target);
    const state = readState();
    const last = state[key];
    const t = clock();

    if (typeof last === 'number' && t - last < IDLE_RESET_MS) {
      state[key] = t; // still the same task — refresh, do not re-fire
      writeState(state);
      return { fired: false, refreshed: true };
    }

    // Marked before the await so concurrent invocations cannot double-fire.
    state[key] = t;
    writeState(state);
    await notify(target, { type: 'halt:start' });
    return { fired: true };
  }

  /** An explicit halt is authoritative: end clears the key, start sets it. */
  async function setHalt(target, mode) {
    const state = readState();
    const key = keyOf(target);
    if (mode === 'end') delete state[key];
    else state[key] = now();
    writeState(state);
    await notify(target, { type: mode === 'end' ? 'halt:end' : 'halt:start' });
  }

  return { freezeOnCall, setHalt, statePath };
}
