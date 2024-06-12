import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const allowedOrigins = ["http://localhost:3001", "http://b2c.soulstealer.io"];

const corsOptions = {
	"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type", // allows 'application/json'
};
// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
	// Check the origin from the request
	const origin = request.headers.get("origin") ?? "";
	const isAllowedOrigin = allowedOrigins.includes(origin);

	// Handle preflighted requests
	const isPreflight = request.method === "OPTIONS";

	if (isPreflight) {
		const preflightHeaders = {
			...(isAllowedOrigin && { "Access-Control-Allow-Origin": origin }),
			...corsOptions,
		};
		return NextResponse.json({}, { headers: preflightHeaders });
	}

	// Handle simple requests
	const response = NextResponse.next();

	if (isAllowedOrigin) {
		response.headers.set("Access-Control-Allow-Origin", origin);
	}

	// biome-ignore lint/complexity/noForEach: <explanation>
	Object.entries(corsOptions).forEach(([key, value]) => {
		response.headers.set(key, value);
	});

	return response;
}

export const config = {
	matcher: "/api/:path*",
};
