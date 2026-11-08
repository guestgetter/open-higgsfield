"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { clearPlatformCredentials, savePlatformCredentials } from "@/generation/actions";
import type { Provider } from "@/generation/catalog";
import { PROVIDERS, PROVIDER_LABELS, type KeyStatus } from "@/generation/credentials";

import { CloseIcon } from "./icons";

const HINTS: Record<Provider, string> = {
  higgsfield: "Soul, Seedance, Kling, Marketing Studio and the rest of the catalog.",
  fal: "Models marked “via fal”: Nano Banana Pro, GPT Image 2, Veo 3.1.",
};

/* One row per provider. Each model bills one account, so a studio with only
   one key still works for that provider's models. */
export function KeyModal({
  configured,
  onClose,
  onSaved,
  onCleared,
}: {
  configured: KeyStatus;
  onClose: () => void;
  onSaved: (provider: Provider) => void;
  onCleared: (provider: Provider) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    panelRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="ohf-keys-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div ref={panelRef} tabIndex={-1} className="ohf-dialog-panel ohf-keys-panel">
        <div className="ohf-keys-head">
          <div>
            <div id="ohf-keys-title" className="ohf-keys-title">
              API keys
            </div>
            <p className="ohf-keys-copy">
              Paste each key as id:secret. Keys stay in httpOnly cookies in this browser, and each
              model bills the account it runs on.
            </p>
          </div>
          <button type="button" className="ohf-icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={13} />
          </button>
        </div>

        {PROVIDERS.map((provider) => (
          <KeyRow
            key={provider}
            provider={provider}
            configured={configured[provider]}
            onSaved={() => onSaved(provider)}
            onCleared={() => onCleared(provider)}
          />
        ))}
      </div>
    </dialog>
  );
}

function KeyRow({
  provider,
  configured,
  onSaved,
  onCleared,
}: {
  provider: Provider;
  configured: boolean;
  onSaved: () => void;
  onCleared: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = PROVIDER_LABELS[provider];
  const inputId = `ohf-key-${provider}`;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await savePlatformCredentials({ api_key: apiKey, provider });
      setApiKey("");
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the key");
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    setError(null);
    try {
      await clearPlatformCredentials({ provider });
      setApiKey("");
      onCleared();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ohf-keys-form ohf-keys-row" onSubmit={(event) => void onSubmit(event)}>
      <div className="ohf-field">
        <div className="ohf-field-row">
          <label className="ohf-field-label" htmlFor={inputId}>
            {label} key
          </label>
          <span className="ohf-keys-state" data-ready={configured}>
            {configured ? "Saved" : "Not set"}
          </span>
        </div>
        <input
          id={inputId}
          className="ohf-input ohf-input--mono"
          name={`${provider}_key`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={configured ? "Paste a new key to replace it" : "id:secret"}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <p className="ohf-keys-hint">{HINTS[provider]}</p>
      </div>

      {error && (
        <div className="ohf-alert" role="alert">
          <span className="ohf-alert-text">{error}</span>
        </div>
      )}

      <div className="ohf-keys-actions">
        {configured && (
          <button type="button" className="ohf-btn-quiet" disabled={busy} onClick={() => void onClear()}>
            Remove
          </button>
        )}
        <button
          type="submit"
          className="ohf-keys-save"
          aria-label={`${configured ? "Replace" : "Save"} ${label} key`}
          disabled={busy || !apiKey.trim()}
        >
          {busy ? "Saving…" : configured ? "Replace" : "Save"}
        </button>
      </div>
    </form>
  );
}
