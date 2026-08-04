import { describe, expect, it, vi } from "vitest";
import worker, { buildUpstreamUrl, selectVariant } from "../worker/index";

async function getForwardedUrl(request: Request): Promise<string | undefined> {
	const upstreamFetch = vi.fn(async (_request: Request) => new Response("ok"));
	vi.stubGlobal("fetch", upstreamFetch);

	try {
		await worker.fetch(request);
		return upstreamFetch.mock.calls[0]?.[0]?.url;
	} finally {
		vi.unstubAllGlobals();
	}
}

describe("A/B proxy routing", () => {
	it("uses the 80/20 boundary for variant selection", () => {
		expect(selectVariant(0)).toBe("control");
		expect(selectVariant(0.799999)).toBe("control");
		expect(selectVariant(0.8)).toBe("treatment");
		expect(selectVariant(0.999999)).toBe("treatment");
	});

	it("preserves the incoming path and query string", () => {
		const upstreamUrl = buildUpstreamUrl(
			"https://proxy.example.com/chat/room%2F42?source=campaign&tab=2",
			"https://chat-utua.pages.dev",
		);

		expect(upstreamUrl.href).toBe(
			"https://chat-utua.pages.dev/chat/room%2F42?source=campaign&tab=2",
		);
	});

	it("runs the experiment only for requests from Brazil", async () => {
		const brazilUrl = await getForwardedUrl(
			new Request("https://proxy.example.com/chat?source=br", {
				cf: { country: "BR" },
				headers: { Cookie: "utua_ab_variant=treatment" },
			}),
		);
		const otherCountryUrl = await getForwardedUrl(
			new Request("https://proxy.example.com/chat?source=other", {
				cf: { country: "US" },
				headers: { Cookie: "utua_ab_variant=treatment" },
			}),
		);

		expect(brazilUrl).toBe(
			"https://front-utua-chat-v2.be-growth-workers.workers.dev/chat?source=br",
		);
		expect(otherCountryUrl).toBe(
			"https://chat-utua.pages.dev/chat?source=other",
		);
	});
});
