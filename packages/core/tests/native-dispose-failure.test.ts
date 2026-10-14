import { describe, expect, it } from "vitest";
import { NativeSidecarKernelProxy } from "../src/sidecar/rpc-client.js";

describe("native VM disposal failure", () => {
	for (const ownsClient of [false, true]) {
		it(`reports native failure and cleans up (ownsClient=${ownsClient})`, async () => {
			const nativeError = Object.assign(new Error("native VM teardown did not reconcile"), {
				code: "ERR_AGENTOS_VM_TEARDOWN_DEADLINE",
			});
			let sidecarDisposed = 0;
			let hookCalled = 0;
			let pumpAborted = false;
			const client = {
				async disposeVm() { throw nativeError; },
				async dispose() { sidecarDisposed++; },
				waitForEvent(_filter: unknown, _timeout: unknown, { signal }: { signal: AbortSignal }) {
					return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
						pumpAborted = true;
						reject(new Error("event pump aborted"));
					}, { once: true }));
				},
			};
			const options = { client,
				session: { connectionId: "conn", sessionId: "session" }, vm: { vmId: "victim" },
				env: {}, cwd: "/workspace", localMounts: [], sidecarMounts: [],
				commandGuestPaths: new Map<string, string>(), ownsClient,
				async onDispose() { hookCalled++; },
			};
			const proxy = new NativeSidecarKernelProxy(
				options as ConstructorParameters<typeof NativeSidecarKernelProxy>[0],
			);
			await expect(proxy.dispose()).rejects.toBe(nativeError);
			expect(pumpAborted).toBe(true);
			expect(hookCalled).toBe(1);
			expect(sidecarDisposed).toBe(Number(ownsClient));
			expect(Object.values(proxy.__trackingSizesForTest()).every(size => size === 0)).toBe(true);
		});
	}
});
