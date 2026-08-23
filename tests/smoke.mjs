import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "herdr-project-tabs-"));
const statePath = join(tempRoot, "state.json");
const fakeHerdrPath = join(tempRoot, "herdr-fake.mjs");

writeFileSync(
  statePath,
  JSON.stringify({
    tabs: [{ label: "main" }, { label: "second" }],
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
  reply({ tabs: state.tabs.map((tab, index) => ({ ...tab, tab_id: "w1:t" + (index + 1) })) });
} else if (command === "pane list") {
  reply({ panes: [{ cwd: "/tmp/project", foreground_cwd: "/tmp/project" }] });
} else if (command === "tab create") {
  const label = args[args.indexOf("--label") + 1];
  state.tabs.push({ label });
  writeFileSync(statePath, JSON.stringify(state));
  reply({ type: "tab_created" });
} else {
  process.stderr.write("unexpected command: " + args.join(" ") + "\\n");
  process.exit(1);
}
`,
);
chmodSync(fakeHerdrPath, 0o755);

function runPlugin() {
  return spawnSync(process.execPath, [join(repoRoot, "index.mjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      HERDR_BIN_PATH: fakeHerdrPath,
      FAKE_HERDR_STATE: statePath,
    },
  });
}

const firstRun = runPlugin();
assert.equal(firstRun.status, 0, firstRun.stderr);
assert.match(firstRun.stdout, /created 6 tab\(s\)/);

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
]);

const secondRun = runPlugin();
assert.equal(secondRun.status, 0, secondRun.stderr);
assert.match(secondRun.stdout, /created 0 tab\(s\)/);

console.log("smoke test passed");
