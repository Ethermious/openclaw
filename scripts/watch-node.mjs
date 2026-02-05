#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const env = { ...process.env };
const cwd = process.cwd();
const compiler = "tsdown";
const entryPath = path.join(cwd, "dist", "entry.js");

const initialBuild = spawnSync("pnpm", ["exec", compiler], {
  cwd,
  env,
  stdio: "inherit",
});

if (initialBuild.status !== 0) {
  process.exit(initialBuild.status ?? 1);
}

const compilerProcess = spawn("pnpm", ["exec", compiler, "--watch"], {
  cwd,
  env,
  stdio: "inherit",
});

let nodeProcess = null;
let exiting = false;
let restartTimer = null;

function waitForEntry() {
  return new Promise((resolve) => {
    const check = () => {
      fs.access(entryPath, fs.constants.R_OK, (err) => {
        if (!err) {
          resolve();
          return;
        }
        setTimeout(check, 100);
      });
    };
    check();
  });
}

function stopNode() {
  if (!nodeProcess) {
    return;
  }
  nodeProcess.removeAllListeners();
  nodeProcess.kill("SIGTERM");
  nodeProcess = null;
}

async function startNode() {
  await waitForEntry();
  if (exiting || nodeProcess) {
    return;
  }
  nodeProcess = spawn(process.execPath, ["openclaw.mjs", ...args], {
    cwd,
    env,
    stdio: "inherit",
  });

  nodeProcess.on("exit", (code, signal) => {
    if (signal || exiting) {
      return;
    }
    nodeProcess = null;
    queueRestart();
  });
}

function queueRestart() {
  if (exiting) {
    return;
  }
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    stopNode();
    await startNode();
  }, 250);
}

function cleanup(code = 0) {
  if (exiting) {
    return;
  }
  exiting = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  stopNode();
  compilerProcess.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

compilerProcess.on("exit", (code) => {
  if (exiting) {
    return;
  }
  cleanup(code ?? 1);
});

fs.watchFile(entryPath, { interval: 200 }, () => {
  queueRestart();
});

startNode().catch(() => cleanup(1));
