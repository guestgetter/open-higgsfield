import type { ModelEntry } from "./types";

/* Models that run on fal.ai and bill the fal account, not Higgsfield. Settings
   follow each endpoint's live OpenAPI schema (fal.ai/api/openapi/queue). */

export const nanoBananaPro: ModelEntry = {
  id: "nano-banana-pro",
  surface: "image",
  provider: "fal",
  label: "Nano Banana Pro",
  roles: { reference: 8 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["auto", "1:1", "4:5", "5:4", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"],
      default: "1:1",
    },
    resolution: { type: "enum", values: ["1K", "2K", "4K"], default: "1K" },
    numImages: { type: "range", min: 1, max: 4, default: 1 },
  },
};

export const gptImage2: ModelEntry = {
  id: "gpt-image-2",
  surface: "image",
  provider: "fal",
  label: "GPT Image 2",
  roles: { reference: 16 },
  settings: {
    aspectRatio: { type: "enum", values: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"], default: "1:1" },
    quality: { type: "enum", values: ["low", "medium", "high"], default: "medium" },
    numImages: { type: "range", min: 1, max: 4, default: 1 },
  },
};

const veoSettings = {
  aspectRatio: { type: "enum", values: ["16:9", "9:16"], default: "16:9" },
  duration: { type: "range", min: 4, max: 8, step: 2, default: 8 },
  resolution: { type: "enum", values: ["720p", "1080p", "4k"], default: "720p" },
  generateAudio: { type: "boolean", default: true },
} as const satisfies ModelEntry["settings"];

export const veo31Fast: ModelEntry = {
  id: "veo-3.1-fast",
  surface: "video",
  provider: "fal",
  label: "Veo 3.1 Fast",
  roles: { start: 1 },
  settings: veoSettings,
};

export const veo31: ModelEntry = {
  id: "veo-3.1",
  surface: "video",
  provider: "fal",
  label: "Veo 3.1",
  roles: { start: 1 },
  settings: veoSettings,
};
