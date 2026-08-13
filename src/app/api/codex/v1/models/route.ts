import {
  codexOptionsResponse,
  handleCodexModelsRequest,
} from "@/server/codex/proxy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleCodexModelsRequest;
export const OPTIONS = codexOptionsResponse;
