import {
  codexOptionsResponse,
  handleCodexResponsesRequest,
} from "@/server/codex/proxy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleCodexResponsesRequest;
export const OPTIONS = codexOptionsResponse;
