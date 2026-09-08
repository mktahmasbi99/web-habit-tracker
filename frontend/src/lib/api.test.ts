import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("bounds stalled reads without retrying", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
  vi.stubGlobal("fetch", fetch);
  const result = expect(api.config()).rejects.toThrow("too long");
  await vi.advanceTimersByTimeAsync(15_000); await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("never automatically retries a failed duration write", async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError("Disconnected")); vi.stubGlobal("fetch", fetch);
  await expect(api.addTimedEntry(1, "2026-09-08", 30)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
