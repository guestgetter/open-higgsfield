import type { Provider } from "./catalog/types";

/* One httpOnly cookie per provider. The Higgsfield cookie keeps its original
   name so keys saved before fal existed still work. */
export const KEY_COOKIES: Record<Provider, string> = {
  higgsfield: "api_key",
  fal: "fal_key",
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  higgsfield: "Higgsfield",
  fal: "fal",
};

export const PROVIDERS: readonly Provider[] = ["higgsfield", "fal"];

export const PLATFORM_KEY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export type KeyStatus = Record<Provider, boolean>;

/** The message names the provider so the studio can say which key to add;
    server action errors cross to the client as plain messages, not classes. */
export class MissingCredentialsError extends Error {
  readonly provider: Provider;

  constructor(provider: Provider = "higgsfield") {
    super(missingKeyMessage(provider));
    this.name = "MissingCredentialsError";
    this.provider = provider;
  }
}

export function missingKeyMessage(provider: Provider): string {
  return provider === "fal" ? "Missing fal key" : "Missing platform key";
}

/** Which provider a missing-key message is about, or null for any other error. */
export function providerFromMissingKey(message: string): Provider | null {
  if (message.includes("Missing fal key")) return "fal";
  if (message.includes("Missing platform key")) return "higgsfield";
  return null;
}

export function isProvider(value: unknown): value is Provider {
  return value === "higgsfield" || value === "fal";
}

export function encodeCredentials(apiKey: string): string {
  return JSON.stringify({ apiKey });
}

export function decodeCredentials(raw: string | undefined): { apiKey: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const apiKey = (parsed as { apiKey?: unknown }).apiKey;
    if (typeof apiKey !== "string" || !apiKey.trim()) return null;
    return { apiKey: requireIdAndSecret(apiKey.trim()) };
  } catch {
    return null;
  }
}

export function parseCredentialInput(data: unknown): { apiKey: string; provider: Provider } {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Enter an API key");
  }
  const record = data as { apiKey?: unknown; api_key?: unknown; provider?: unknown };
  const apiKey = record.apiKey ?? record.api_key;
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Enter an API key");
  const provider = record.provider === undefined ? "higgsfield" : record.provider;
  if (!isProvider(provider)) throw new Error("Unknown provider");
  return { apiKey: requireIdAndSecret(apiKey.trim()), provider };
}

/* Higgsfield and fal both use "Key id:secret". */
export function toAuthorizationHeader(apiKey: string): string {
  return `Key ${requireIdAndSecret(apiKey)}`;
}

function requireIdAndSecret(apiKey: string): string {
  const colon = apiKey.indexOf(":");
  if (colon <= 0 || colon === apiKey.length - 1) {
    throw new Error("API key must be id:secret");
  }
  return apiKey;
}
