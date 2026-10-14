// Standalone script (as a user would write): create a VM on the default
// (shared) sidecar, do one op, dispose, and DO NOT call process.exit().
//
// A correct dispose() must let node exit on its own — the shared sidecar's
// child process + stdio handles must not keep the event loop alive after the
// last VM lease is released. Imports the built package entry, like a consumer.
import assert from "node:assert/strict";
import { SidecarProcess } from "@rivet-dev/agentos-runtime-core/sidecar-client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = pathToFileURL(
	resolve(import.meta.dirname, "../../dist/index.js"),
).href;
const { AgentOs } = await import(entry);

const vm = await AgentOs.create();
await vm.writeFile("/clean-exit.txt", "ok");
if (process.env.AGENTOS_TEST_NATIVE_DISPOSE_FAILURE === "1") {
  const sibling = await AgentOs.create();
  const nativeError = new Error("injected native VM teardown failure");
  const disposeVm = SidecarProcess.prototype.disposeVm;
  SidecarProcess.prototype.disposeVm = async function (...args) {
    await disposeVm.apply(this, args);
    throw nativeError;
  };
  try {
    await assert.rejects(vm.dispose(), /injected native VM teardown failure/);
  } finally {
    SidecarProcess.prototype.disposeVm = disposeVm;
  }
  const result = await sibling.javascript.execute("console.log('sibling-ok')", { output: { capture: "all" }, timeoutMs: 10000 });
  assert.equal(result.outcome, "succeeded");
  assert.equal(result.stdout.trim(), "sibling-ok");
  await sibling.dispose();
} else {
  await vm.dispose();
}

console.log("SCRIPT_DONE");
// Intentionally NO process.exit(): the process must terminate on its own.
