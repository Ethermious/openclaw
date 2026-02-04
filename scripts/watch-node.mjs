#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
const env = { ...process.env };
const cwd = process.cwd();
const compiler = "tsdown";
const entryPath = new URL("./dist/entry.js", import.meta.url).pathname;

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

async function startNode() {
  await waitForEntry();
  if (exiting) {
    return;
  }
  nodeProcess = spawn(process.execPath, ["--watch", "openclaw.mjs", ...args], {
    cwd,
    env,
    stdio: "inherit",
  });

  nodeProcess.on("exit", (code, signal) => {
    if (signal || exiting) {
      return;
    }
    startNode().catch(() => process.exit(code ?? 1));
  });
}

function cleanup(code = 0) {
  if (exiting) {
    return;
  }
  exiting = true;
  nodeProcess?.kill("SIGTERM");
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

startNode().catch(() => cleanup(1));
