import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "herdr-project-tabs-"));
const statePath = join(tempRoot, "state.json");
const fakeHerdrPath = join(tempRoot, "herdr-fake.mjs");

writeFileSync(
  statePath,
  JSON.stringify({
    tabs: [
      { label: "main", tab_id: "w1:t1" },
      { label: "second", tab_id: "w1:t2" },
    ],
    panes: [
      {
        pane_id: "w1:p1",
        tab_id: "w1:t1",
        cwd: "/tmp/project",
        foreground_cwd: "/tmp/project",
      },
    ],
    active_tab_id: "w1:t2",
    runs: [],
  }),
);

writeFileSync(
  fakeHerdrPath,
  `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const statePath = process.env.FAKE_HERDR_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const args = process.argv.slice(2);
const command = args.slice(0, 2).join(" ");

function reply(result) {
  process.stdout.write(JSON.stringify({ result }) + "\\n");
}

if (command === "workspace list") {
  reply({ workspaces: [{ workspace_id: "w1" }] });
} else if (command === "tab list") {
  reply({ tabs: state.tabs });
} else if (command === "pane list") {
  reply({ panes: state.panes });
} else if (command === "tab create") {
  const label = args[args.indexOf("--label") + 1];
  const tabId = "w1:t" + (state.tabs.length + 1);
  state.tabs.push({ label, tab_id: tabId });
  state.panes.push({
    pane_id: "w1:p" + (state.panes.length + 1),
    tab_id: tabId,
    cwd: "/tmp/project",
    foreground_cwd: "/tmp/project",
  });
  writeFileSync(statePath, JSON.stringify(state));
  reply({ type: "tab_created" });
} else if (command === "tab rename") {
  const tabId = args[2];
  const label = args.slice(3).join(" ");
  const tab = state.tabs.find((candidate) => candidate.tab_id === tabId);
  if (!tab) {
    process.stderr.write("unknown tab: " + tabId + "\\n");
    process.exit(1);
  }
  tab.label = label;
  writeFileSync(statePath, JSON.stringify(state));
  reply({ type: "tab_renamed" });
} else if (command === "tab focus") {
  const tabId = args[2];
  if (!state.tabs.some((tab) => tab.tab_id === tabId)) {
    process.stderr.write("unknown tab: " + tabId + "\\n");
    process.exit(1);
  }
  state.active_tab_id = tabId;
  writeFileSync(statePath, JSON.stringify(state));
  reply({ type: "tab_focused" });
} else if (command === "pane run") {
  state.runs.push({ pane_id: args[2], command: args[3] });
  writeFileSync(statePath, JSON.stringify(state));
  reply({ type: "command_started" });
} else {
  process.stderr.write("unexpected command: " + args.join(" ") + "\\n");
  process.exit(1);
}
`,
);
chmodSync(fakeHerdrPath, 0o755);

function runPlugin(testStatePath = statePath, extraEnv = {}) {
  return spawnSync(process.execPath, [join(repoRoot, "index.mjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      HERDR_BIN_PATH: fakeHerdrPath,
      FAKE_HERDR_STATE: testStatePath,
      ...extraEnv,
    },
  });
}

const firstRun = runPlugin();
assert.equal(firstRun.status, 0, firstRun.stderr);
assert.match(firstRun.stdout, /created 7 tab\(s\)/);

const stateAfterFirstRun = JSON.parse(readFileSync(statePath, "utf8"));
assert.deepEqual(stateAfterFirstRun.tabs.map((tab) => tab.label), [
  "main",
  "second",
  "debug",
  "run",
  "build",
  "explore",
  "git",
  "terminal",
  "remote",
]);
assert.equal(stateAfterFirstRun.active_tab_id, "w1:t1");

const secondRun = runPlugin();
assert.equal(secondRun.status, 0, secondRun.stderr);
assert.match(secondRun.stdout, /created 0 tab\(s\)/);

const placeholderStatePath = join(tempRoot, "placeholder-state.json");
writeFileSync(
  placeholderStatePath,
  JSON.stringify({
    tabs: [
      { label: "tab 1", tab_id: "w1:t1" },
      { label: "custom", tab_id: "w1:t2" },
    ],
    panes: [
      {
        pane_id: "w1:p1",
        tab_id: "w1:t1",
        cwd: "/tmp/project",
        foreground_cwd: "/tmp/project",
      },
    ],
    active_tab_id: "w1:t2",
    runs: [],
  }),
);

const placeholderRun = runPlugin(placeholderStatePath);
assert.equal(placeholderRun.status, 0, placeholderRun.stderr);
const placeholderState = JSON.parse(readFileSync(placeholderStatePath, "utf8"));
assert.deepEqual(placeholderState.tabs.map((tab) => tab.label), [
  "main",
  "custom",
  "second",
  "debug",
  "run",
  "build",
  "explore",
  "git",
  "terminal",
  "remote",
]);
assert.equal(placeholderState.active_tab_id, "w1:t1");

const placeholderSecondRun = runPlugin(placeholderStatePath);
assert.equal(placeholderSecondRun.status, 0, placeholderSecondRun.stderr);
assert.match(placeholderSecondRun.stdout, /created 0 tab\(s\)/);
const placeholderStateAfterSecondRun = JSON.parse(
  readFileSync(placeholderStatePath, "utf8"),
);
assert.equal(
  placeholderStateAfterSecondRun.tabs.filter((tab) => tab.label === "main").length,
  1,
);
assert.equal(placeholderStateAfterSecondRun.active_tab_id, "w1:t1");

const eventStatePath = join(tempRoot, "event-state.json");
const configDir = join(tempRoot, "config");
const binDir = join(tempRoot, "bin");
const testPath = [binDir, dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter);
mkdirSync(configDir);
mkdirSync(binDir);
writeFileSync(
  eventStatePath,
  JSON.stringify({
    tabs: [{ label: "main", tab_id: "w1:t1" }],
    panes: [
      {
        pane_id: "w1:p1",
        tab_id: "w1:t1",
        cwd: "/tmp/project",
        foreground_cwd: "/tmp/project",
      },
    ],
    runs: [],
  }),
);
writeFileSync(
  join(configDir, "settings.conf"),
  "AUTO_LAUNCH_YAZI=true\nAUTO_LAUNCH_LAZYGIT=true\n",
);
for (const tool of ["yazi", "lazygit"]) {
  writeFileSync(join(binDir, tool), "#!/bin/sh\nexit 0\n");
  chmodSync(join(binDir, tool), 0o755);
}

const eventRun = spawnSync(process.execPath, [join(repoRoot, "index.mjs")], {
  encoding: "utf8",
  env: {
    ...process.env,
    HERDR_BIN_PATH: fakeHerdrPath,
    FAKE_HERDR_STATE: eventStatePath,
    HERDR_PLUGIN_CONFIG_DIR: configDir,
    HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: "workspace.created", workspace_id: "w1" }),
    PATH: testPath,
  },
});
assert.equal(eventRun.status, 0, eventRun.stderr);
assert.match(eventRun.stdout, /created 8 tab\(s\)/);

const eventState = JSON.parse(readFileSync(eventStatePath, "utf8"));
assert.deepEqual(eventState.runs, [
  { pane_id: "w1:p6", command: "yazi" },
  { pane_id: "w1:p7", command: "lazygit" },
]);

const noAutoStatePath = join(tempRoot, "no-auto-state.json");
writeFileSync(
  noAutoStatePath,
  JSON.stringify({
    tabs: [{ label: "main", tab_id: "w1:t1" }],
    panes: [
      {
        pane_id: "w1:p1",
        tab_id: "w1:t1",
        cwd: "/tmp/project",
        foreground_cwd: "/tmp/project",
      },
    ],
    runs: [],
  }),
);
const noAutoRun = spawnSync(process.execPath, [join(repoRoot, "index.mjs")], {
  encoding: "utf8",
  env: {
    ...process.env,
    HERDR_BIN_PATH: fakeHerdrPath,
    FAKE_HERDR_STATE: noAutoStatePath,
    HERDR_PLUGIN_CONFIG_DIR: join(tempRoot, "missing-config"),
    HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: "workspace.created", workspace_id: "w1" }),
    PATH: testPath,
  },
});
assert.equal(noAutoRun.status, 0, noAutoRun.stderr);
assert.deepEqual(JSON.parse(readFileSync(noAutoStatePath, "utf8")).runs, []);

console.log("smoke test passed");
