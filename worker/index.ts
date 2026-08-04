// Export the Workflow and Durable Object classes
export { MyWorkflow } from "./workflow";
export { WorkflowStatusDO } from "./durable-object";

const CONTROL_ORIGIN = "https://chat-utua.pages.dev";
const TREATMENT_ORIGIN = "https://front-utua-chat-v2.be-growth-workers.workers.dev";
const AB_COOKIE_NAME = "utua_ab_variant";
const CONTROL_TRAFFIC_RATIO = 0.8;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const BRAZIL_COUNTRY_CODE = "BR";

type Variant = "control" | "treatment";

function getRandomSample(): number {
	const randomValue = new Uint32Array(1);
	crypto.getRandomValues(randomValue);
	return randomValue[0] / 0x1_0000_0000;
}

export function selectVariant(sample = getRandomSample()): Variant {
	return sample < CONTROL_TRAFFIC_RATIO ? "control" : "treatment";
}

function getAssignedVariant(request: Request): Variant | undefined {
	const cookieHeader = request.headers.get("Cookie");
	if (!cookieHeader) {
		return undefined;
	}

	for (const cookie of cookieHeader.split(";")) {
		const [name, ...valueParts] = cookie.trim().split("=");
		const value = valueParts.join("=");

		if (name === AB_COOKIE_NAME && (value === "control" || value === "treatment")) {
			return value;
		}
	}

	return undefined;
}

function getOrigin(variant: Variant): string {
	return variant === "control" ? CONTROL_ORIGIN : TREATMENT_ORIGIN;
}

export function buildUpstreamUrl(requestUrl: string, upstreamOrigin: string): URL {
	const incomingUrl = new URL(requestUrl);
	const upstreamUrl = new URL(upstreamOrigin);

	// Replace only the origin, preserving the complete path and query string.
	upstreamUrl.pathname = incomingUrl.pathname;
	upstreamUrl.search = incomingUrl.search;

	return upstreamUrl;
}

function buildUpstreamRequest(request: Request, upstreamOrigin: string): Request {
	return new Request(buildUpstreamUrl(request.url, upstreamOrigin), request);
}

function addAssignmentCookie(response: Response, variant: Variant): Response {
	const headers = new Headers(response.headers);
	headers.append(
		"Set-Cookie",
		`${AB_COOKIE_NAME}=${variant}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Secure; HttpOnly; SameSite=Lax`,
	);

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export default {
	async fetch(request: Request): Promise<Response> {
		const isBrazil = request.cf?.country === BRAZIL_COUNTRY_CODE;
		const assignedVariant = isBrazil ? getAssignedVariant(request) : undefined;
		const variant = isBrazil ? (assignedVariant ?? selectVariant()) : "control";
		const upstreamOrigin = getOrigin(variant);

		try {
			const response = await fetch(buildUpstreamRequest(request, upstreamOrigin));

			// A WebSocket upgrade response must be returned as-is so its connection
			// remains attached to the response.
			if (!isBrazil || assignedVariant || response.status === 101) {
				return response;
			}

			return addAssignmentCookie(response, variant);
		} catch (error) {
			console.error("A/B proxy upstream request failed", {
				variant,
				upstreamOrigin,
				error,
			});

			return Response.json({ error: "Upstream unavailable" }, { status: 502 });
		}
	},
} satisfies ExportedHandler<Env>;
