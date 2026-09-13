#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const DEFAULT_TABS = [
  "main",
  "second",
  "debug",
  "run",
  "build",
  "explore",
  "git",
  "terminal",
  "remote",
];

const TOOL_TARGETS = [
  { setting: "AUTO_LAUNCH_YAZI", label: "explore", command: "yazi" },
  { setting: "AUTO_LAUNCH_LAZYGIT", label: "git", command: "lazygit" },
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

function containsWorkspaceCreatedEvent(value) {
  if (value === "workspace.created") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsWorkspaceCreatedEvent);
}

function isWorkspaceCreatedEvent() {
  const raw = process.env.HERDR_PLUGIN_EVENT_JSON;
  if (!raw) return false;

  try {
    return containsWorkspaceCreatedEvent(JSON.parse(raw));
  } catch {
    return false;
  }
}

function configPath() {
  const defaultDir = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "herdr-project-tabs",
  );
  const directory = process.env.HERDR_PLUGIN_CONFIG_DIR || defaultDir;
  return join(directory, "settings.conf");
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function loadSettings() {
  const settings = new Map(TOOL_TARGETS.map(({ setting }) => [setting, false]));

  let contents;
  try {
    contents = readFileSync(configPath(), "utf8");
  } catch {
    return settings;
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(AUTO_LAUNCH_YAZI|AUTO_LAUNCH_LAZYGIT)\s*=\s*([^#\s]+)\s*(?:#.*)?$/i);
    if (!match) continue;
    settings.set(match[1].toUpperCase(), parseBoolean(match[2]));
  }

  return settings;
}

function commandAvailable(command) {
  const pathEntries = (process.env.PATH || "").split(delimiter).filter(Boolean);
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
    : [""];

  return pathEntries.some((directory) =>
    extensions.some((extension) => {
      const candidate = join(directory, `${command}${extension}`);
      try {
        accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }),
  );
}

function tabId(tab) {
  return tab.tab_id ?? tab.id;
}

function paneId(pane) {
  return pane.pane_id ?? pane.id;
}

function paneTabId(pane) {
  return pane.tab_id ?? pane.tabId;
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
  const createdLabels = new Set();
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
    createdLabels.add(label);
    created += 1;
  }

  if (createdLabels.size > 0 && isWorkspaceCreatedEvent()) {
    const settings = loadSettings();
    const updatedTabs = call(["tab", "list", "--workspace", workspaceId]).tabs ?? [];
    const updatedPanes = call(["pane", "list", "--workspace", workspaceId]).panes ?? [];

    for (const target of TOOL_TARGETS) {
      if (!createdLabels.has(target.label) || !settings.get(target.setting)) continue;
      if (!commandAvailable(target.command)) {
        process.stderr.write(`project-tabs: ${target.command} is not installed; skipped\n`);
        continue;
      }

      const tab = updatedTabs.find((candidate) => candidate.label === target.label);
      const pane = tab
        ? updatedPanes.find((candidate) => paneTabId(candidate) === tabId(tab))
        : null;
      if (!pane || !paneId(pane)) {
        process.stderr.write(`project-tabs: could not find the ${target.label} pane; skipped ${target.command}\n`);
        continue;
      }

      call(["pane", "run", paneId(pane), target.command]);
    }
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
