import { toAuthorizationHeader } from "./credentials";
import {
  PlatformError,
  asRecord,
  isModelId,
  messageFromBody,
  readJson,
  stringField,
  type GenerationStatus,
  type QueuedGeneration,
} from "./platform";

const FAL_QUEUE = "https://queue.fal.run";
const PREFIX = "fal:";
const REQUEST_ID = /^[a-z0-9-]+$/i;

/* fal answers a submit with its own request id, but status and result live
   under the app's base path (`fal-ai/nano-banana-pro`, not `.../edit`). The
   studio's request id carries both, so the server rebuilds every URL itself
   and never fetches one the browser handed it. */
export function isFalRequestId(requestId: string): boolean {
  return requestId.startsWith(PREFIX);
}

function encodeRequestId(app: string, id: string): string {
  return `${PREFIX}${app}:${id}`;
}

function decodeRequestId(requestId: string): { app: string; id: string } {
  const rest = requestId.slice(PREFIX.length);
  const split = rest.lastIndexOf(":");
  const app = rest.slice(0, split);
  const id = rest.slice(split + 1);
  if (split <= 0 || !isModelId(app) || !REQUEST_ID.test(id)) {
    throw new PlatformError(400, { detail: "Invalid fal request id" });
  }
  return { app, id };
}

/** The app path inside a fal queue URL: everything before `/requests/`. */
function appFromQueueUrl(url: string | undefined, fallback: string): string {
  if (url) {
    try {
      const parsed = new URL(url);
      const marker = parsed.pathname.indexOf("/requests/");
      if (parsed.origin === FAL_QUEUE && marker > 0) {
        const app = parsed.pathname.slice(1, marker);
        if (isModelId(app)) return app;
      }
    } catch {
      /* fall through to the derived app */
    }
  }
  return fallback.split("/").slice(0, 2).join("/");
}

const STATUS_MAP: Record<string, string> = {
  IN_QUEUE: "queued",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
};

export function createFalClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const fetchImpl = options.fetch ?? fetch;
  const auth = toAuthorizationHeader(options.apiKey);

  async function send(method: "GET" | "POST", url: string, body?: Record<string, unknown>) {
    console.info("[fal] request", { method, url, body: body ?? null });
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: auth,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await readJson(response);
    console.info("[fal] response", { method, url, status: response.status });
    return { ok: response.ok, status: response.status, payload };
  }

  return {
    async submit(model: string, input: Record<string, unknown>): Promise<QueuedGeneration> {
      if (!isModelId(model)) throw new PlatformError(400, { detail: "Invalid model" });
      const answer = await send("POST", `${FAL_QUEUE}/${model}`, input);
      if (!answer.ok) throw new PlatformError(answer.status, answer.payload);
      const data = asRecord(answer.payload);
      const id = stringField(data, "request_id");
      if (!id || !REQUEST_ID.test(id)) {
        throw new PlatformError(502, { detail: "fal response missing request_id" });
      }
      const app = appFromQueueUrl(stringField(data, "status_url"), model);
      return {
        status: "queued",
        requestId: encodeRequestId(app, id),
        statusUrl: "",
        cancelUrl: "",
      };
    },

    async status(requestId: string): Promise<GenerationStatus> {
      const { app, id } = decodeRequestId(requestId);
      const base = `${FAL_QUEUE}/${app}/requests/${id}`;
      const polled = await send("GET", `${base}/status`);
      if (!polled.ok) throw new PlatformError(polled.status, polled.payload);
      const state = stringField(asRecord(polled.payload), "status") ?? "";
      const status = STATUS_MAP[state] ?? "in_progress";
      if (status !== "completed") return { status, requestId };

      /* COMPLETED only means the run stopped. The result call says whether it
         produced media or failed, and carries the reason when it failed. */
      const result = await send("GET", base);
      if (!result.ok) {
        return {
          status: "failed",
          requestId,
          error: messageFromBody(result.status, result.payload),
        };
      }
      return mapResult(requestId, result.payload);
    },
  };
}

function mapResult(requestId: string, payload: unknown): GenerationStatus {
  const data = asRecord(payload);
  const images = Array.isArray(data.images)
    ? data.images.flatMap((item) => {
        const url = asRecord(item).url;
        return typeof url === "string" ? [{ url }] : [];
      })
    : [];
  const videoUrl = asRecord(data.video).url;
  if (!images.length && typeof videoUrl !== "string") {
    return { status: "failed", requestId, error: "fal returned no media" };
  }
  return {
    status: "completed",
    requestId,
    ...(images.length ? { images } : {}),
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
  };
}
