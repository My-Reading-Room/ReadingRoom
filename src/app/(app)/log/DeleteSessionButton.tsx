"use client";

import { useState, useTransition } from "react";

import { deleteSession } from "./actions";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!confirming) {
    return (
      <button
        type="button"
        className="btn text"
        aria-label="Delete session"
        onClick={() => setConfirming(true)}
      >
        ✕
      </button>
    );
  }
  return (
    <span className="inline">
      <button
        type="button"
        className="btn sm danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await deleteSession(sessionId);
            if (r.error) setError(r.error);
          })
        }
      >
        Delete session
      </button>
      <button type="button" className="btn sm" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      {error && (
        <span className="tiny" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
