import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { WorkerRequest, WorkerResponse } from "../lib/worker/protocol.ts";

/**
 * Node has no browser `Worker` global, so `SearchWorkerClient`'s request/response correlation is
 * tested against a fake `Worker` that just records `postMessage` calls and lets the test drive
 * `onmessage` manually — exactly the "independent of an actual Worker" scope the plan calls for.
 */
class MockWorker {
    static instances: MockWorker[] = [];
    onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
    postedMessages: WorkerRequest[] = [];
    terminated = false;

    constructor(_url: URL, _opts?: WorkerOptions) {
        MockWorker.instances.push(this);
    }

    postMessage(msg: WorkerRequest): void {
        this.postedMessages.push(msg);
    }

    terminate(): void {
        this.terminated = true;
    }

    respond(response: WorkerResponse): void {
        this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
    }
}

beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

async function freshClient() {
    const { SearchWorkerClient } = await import("../lib/worker/worker-client.ts");
    const client = new SearchWorkerClient();
    const mock = MockWorker.instances.at(-1)!;
    return { client, mock };
}

describe("SearchWorkerClient", () => {
    it("posts a search request and resolves with the matching response's result", async () => {
        const { client, mock } = await freshClient();
        const promise = client.search("123 Main St");

        expect(mock.postedMessages).toHaveLength(1);
        expect(mock.postedMessages[0]!.method).toBe("search");
        expect(mock.postedMessages[0]!.args).toEqual(["123 Main St", undefined]);

        mock.respond({ id: mock.postedMessages[0]!.id, ok: true, result: [{ displayAddress: "123 Main St" }] });
        expect(await promise).toEqual([{ displayAddress: "123 Main St" }]);
    });

    it("rejects the caller's promise when the worker reports an error", async () => {
        const { client, mock } = await freshClient();
        const promise = client.search("x");
        mock.respond({ id: mock.postedMessages[0]!.id, ok: false, error: "boom" });
        await expect(promise).rejects.toThrow("boom");
    });

    it("correlates concurrent requests by id, not arrival order", async () => {
        const { client, mock } = await freshClient();
        const first = client.search("first");
        const second = client.search("second");

        const [firstId, secondId] = mock.postedMessages.map((m) => m.id);
        // Respond out of order.
        mock.respond({ id: secondId!, ok: true, result: "second-result" });
        mock.respond({ id: firstId!, ok: true, result: "first-result" });

        expect(await first).toBe("first-result");
        expect(await second).toBe("second-result");
    });

    it("ignores a response with an unknown id instead of throwing", async () => {
        const { mock } = await freshClient();
        expect(() => mock.respond({ id: 9999, ok: true, result: null })).not.toThrow();
    });

    it("rejects all pending requests when terminated", async () => {
        const { client, mock } = await freshClient();
        const promise = client.search("x");
        client.terminate();
        expect(mock.terminated).toBe(true);
        await expect(promise).rejects.toThrow();
    });
});
