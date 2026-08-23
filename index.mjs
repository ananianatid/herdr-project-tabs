#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const DEFAULT_TABS = [
  "main",
  "second",
  "debug",
  "run",
  "build",
  "explore",
  "git",
  "terminal",
];

const herdr = process.env.HERDR_BIN_PATH || "herdr";

function call(args) {
  const result = spawnSync(herdr, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`herdr ${args.join(" ")} exited ${result.status}: ${detail}`);
  }

  const parsed = JSON.parse(result.stdout);
  return parsed?.result ?? parsed;
}

function findWorkspaceId(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.workspace_id === "string") return value.workspace_id;
  for (const child of Object.values(value)) {
    const found = findWorkspaceId(child);
    if (found) return found;
  }
  return null;
}

function contextWorkspaceId() {
  const direct = process.env.HERDR_WORKSPACE_ID;
  if (direct) return direct;

  for (const variable of ["HERDR_PLUGIN_CONTEXT_JSON", "HERDR_PLUGIN_EVENT_JSON"]) {
    if (!process.env[variable]) continue;
    try {
      const found = findWorkspaceId(JSON.parse(process.env[variable]));
      if (found) return found;
    } catch {
      // Ignore malformed optional context and fall back to the full sync.
    }
  }

  return null;
}

function applyWorkspace(workspaceId) {
  const tabs = call(["tab", "list", "--workspace", workspaceId]).tabs ?? [];
  const panes = call(["pane", "list", "--workspace", workspaceId]).panes ?? [];
  const labels = new Set(tabs.map((tab) => tab.label));
  const projectCwd =
    panes.find((pane) => pane.foreground_cwd)?.foreground_cwd ??
    panes.find((pane) => pane.cwd)?.cwd;

  if (!projectCwd) return 0;

  let created = 0;
  for (const label of DEFAULT_TABS) {
    if (labels.has(label)) continue;
    call([
      "tab",
      "create",
      "--workspace",
      workspaceId,
      "--cwd",
      projectCwd,
      "--label",
      label,
      "--no-focus",
    ]);
    labels.add(label);
    created += 1;
  }
  return created;
}

function main() {
  const target = contextWorkspaceId();
  const workspaces = target
    ? [{ workspace_id: target }]
    : call(["workspace", "list"]).workspaces ?? [];

  const created = workspaces.reduce(
    (total, workspace) => total + applyWorkspace(workspace.workspace_id),
    0,
  );
  process.stdout.write(`project-tabs: created ${created} tab(s)\n`);
}

main();
