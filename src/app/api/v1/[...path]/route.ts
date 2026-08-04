import { handleProxyRequest, proxyOptionsResponse } from "@/server/proxy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleProxyRequest;
export const POST = handleProxyRequest;
export const PUT = handleProxyRequest;
export const PATCH = handleProxyRequest;
export const DELETE = handleProxyRequest;
export const HEAD = handleProxyRequest;
export const OPTIONS = proxyOptionsResponse;
