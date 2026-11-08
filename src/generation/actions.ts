"use server";

import { cookies } from "next/headers";

import { getModel, parseSettings, providerOf } from "./catalog";
import type { GenerationPlane, Provider } from "./catalog/types";
import {
  KEY_COOKIES,
  MissingCredentialsError,
  PLATFORM_KEY_COOKIE_OPTIONS,
  PROVIDERS,
  decodeCredentials,
  encodeCredentials,
  isProvider,
  parseCredentialInput,
  type KeyStatus,
} from "./credentials";
import { createFalClient, isFalRequestId } from "./fal";
import { createPlatformClient } from "./platform";
import type { GenerationStatus, QueuedGeneration, StatusResult } from "./platform";
import { toPlatform } from "./to-platform";

type Client = {
  submit(model: string, input: Record<string, unknown>): Promise<QueuedGeneration>;
  status(requestId: string): Promise<GenerationStatus>;
};

export async function savePlatformCredentials(data: unknown) {
  const { apiKey, provider } = parseCredentialInput(data);
  const jar = await cookies();
  jar.set(KEY_COOKIES[provider], encodeCredentials(apiKey), PLATFORM_KEY_COOKIE_OPTIONS);
}

export async function clearPlatformCredentials(data?: unknown) {
  const raw =
    data !== null && typeof data === "object" ? (data as { provider?: unknown }).provider : undefined;
  const provider = raw === undefined ? "higgsfield" : raw;
  if (!isProvider(provider)) throw new Error("Unknown provider");
  const jar = await cookies();
  jar.set(KEY_COOKIES[provider], "", { ...PLATFORM_KEY_COOKIE_OPTIONS, maxAge: 0 });
}

/** Which providers have a key saved in this browser. */
export async function hasPlatformCredentials(): Promise<KeyStatus> {
  const jar = await cookies();
  const status = {} as KeyStatus;
  for (const provider of PROVIDERS) {
    status[provider] = decodeCredentials(jar.get(KEY_COOKIES[provider])?.value) !== null;
  }
  return status;
}

export async function submitGeneration(plane: GenerationPlane) {
  const model = getModel(plane.model);
  const parsed: GenerationPlane = {
    ...plane,
    settings: parseSettings(model, plane.settings),
  };
  const { path, body } = toPlatform(parsed);
  return (await clientFor(providerOf(model))).submit(path, body);
}

/** Every request in flight, answered in one round trip. Next dispatches server
    actions one at a time per client, so a poll per run would queue ahead of the
    next submit — the fan-out belongs on this side of the call, where it is
    genuinely parallel. Each request id says which provider owns it. */
export async function getGenerationStatuses(data: unknown): Promise<StatusResult[]> {
  const requestIds = parseRequestIds(data);
  const clients = new Map<Provider, Promise<Client>>();
  const client = (provider: Provider) => {
    let found = clients.get(provider);
    if (!found) {
      found = clientFor(provider);
      clients.set(provider, found);
    }
    return found;
  };
  return Promise.all(
    requestIds.map(async (requestId): Promise<StatusResult> => {
      try {
        const provider: Provider = isFalRequestId(requestId) ? "fal" : "higgsfield";
        return { requestId, status: await (await client(provider)).status(requestId) };
      } catch (caught) {
        return { requestId, error: caught instanceof Error ? caught.message : String(caught) };
      }
    }),
  );
}

async function clientFor(provider: Provider): Promise<Client> {
  const jar = await cookies();
  const stored = decodeCredentials(jar.get(KEY_COOKIES[provider])?.value);
  if (!stored) throw new MissingCredentialsError(provider);
  if (provider === "fal") return createFalClient(stored);
  const baseUrl = process.env.HF_API_BASE_URL;
  if (!baseUrl) throw new Error("Missing HF_API_BASE_URL");
  return createPlatformClient({ ...stored, baseUrl });
}

function parseRequestIds(data: unknown): string[] {
  const payload = asObject(data, "Invalid status payload");
  const requestIds = payload.requestIds;
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new Error("Invalid request ids");
  }
  return requestIds.map((requestId) => {
    if (typeof requestId !== "string" || !requestId) throw new Error("Invalid request id");
    return requestId;
  });
}

function asObject(data: unknown, message: string): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(message);
  return data as Record<string, unknown>;
}
