"use client";

import { useState, useTransition } from "react";

import { useActionForm } from "@/hooks/useActionForm";
import { useLocalToday } from "@/hooks/useLocalToday";

import {
  createInvite,
  redeemInvite,
  saveProfile,
  saveTrackingStart,
  setShareLevel,
  type SettingsState,
} from "./actions";

function Result({ state }: { state: SettingsState }) {
  if (!state.error && !state.message) return null;
  return (
    <div className={`notice ${state.error ? "error" : ""}`} role={state.error ? "alert" : "status"}>
      {state.error ?? state.message}
    </div>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const { state, pending, onSubmit } = useActionForm<SettingsState>(saveProfile, {});
  return (
    <form onSubmit={onSubmit}>
      <div className="formfield">
        <label htmlFor="setting-name">Display name</label>
        <input
          id="setting-name"
          name="display_name"
          className="input"
          defaultValue={name}
          maxLength={80}
          required
        />
      </div>
      <button className="btn primary form-footer" type="submit" disabled={pending}>
        Save profile
      </button>
      <Result state={state} />
    </form>
  );
}

export function TrackingForm({ start, goal }: { start: string; goal: number }) {
  const today = useLocalToday();
  const { state, pending, onSubmit } = useActionForm<SettingsState>(saveTrackingStart, {});
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="today" value={today} />
      <div className="formfield">
        <label htmlFor="setting-tracking-start">Tracking start date</label>
        <input
          id="setting-tracking-start"
          name="tracking_start_date"
          className="input narrow"
          type="date"
          max={today || undefined}
          defaultValue={start}
          required
        />
        <p className="tiny">
          Weekly, monthly and year-to-date metrics, plus daily goal progress, begin on this date.
          Earlier sessions and book history stay saved.
        </p>
      </div>
      <div className="formfield">
        <label htmlFor="setting-tracking-goal">Starting daily goal (minutes)</label>
        <input
          id="setting-tracking-goal"
          name="tracking_start_goal_minutes"
          className="input narrow"
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          step={1}
          defaultValue={goal}
          required
        />
        <p className="tiny">
          The daily goal in effect when tracking begins. Later dated goal changes remain unchanged.
        </p>
      </div>
      <button className="btn form-footer" type="submit" disabled={pending}>
        Save tracking start date
      </button>
      <Result state={state} />
    </form>
  );
}

export function InviteForms() {
  const invite = useActionForm<SettingsState>(createInvite, {});
  const redeem = useActionForm<SettingsState>(redeemInvite, {});
  const [copied, setCopied] = useState(false);
  return (
    <>
      <form onSubmit={invite.onSubmit}>
        <div className="formfield">
          <label htmlFor="share-invite-level">What may this person see?</label>
          <select id="share-invite-level" name="level" className="select" defaultValue="summary">
            <option value="summary">Summary only · totals, goals and modes, no book titles</option>
            <option value="full">Full · library, reading logs, bookshelves and Insights</option>
          </select>
        </div>
        <button className="btn primary form-footer" type="submit" disabled={invite.pending}>
          Generate one-use invitation
        </button>
      </form>
      {invite.state.code ? (
        <div className="notice">
          <label htmlFor="share-invite-display">Copy this one-use code (valid for 7 days)</label>
          <div className="inline">
            <input id="share-invite-display" className="input" readOnly value={invite.state.code} />
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite.state.code!);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <Result state={invite.state} />
      )}
      <div className="cardline" />
      <form onSubmit={redeem.onSubmit}>
        <div className="formfield">
          <label htmlFor="accept-share-code">Have someone&apos;s invite code?</label>
          <div className="inline">
            <input
              id="accept-share-code"
              name="code"
              className="input"
              placeholder="Paste a one-use code"
              maxLength={64}
              required
            />
            <button className="btn" type="submit" disabled={redeem.pending}>
              Join
            </button>
          </div>
        </div>
        <Result state={redeem.state} />
      </form>
      <p className="tiny">
        Sharing is directional: accepting a code lets you view the sender at their chosen level. To
        let them view your profile, generate a code for them in return.
      </p>
    </>
  );
}

/** Change or revoke one person's access. Revoking asks first. */
export function ShareLevel({
  viewerId,
  name,
  level,
}: {
  viewerId: string;
  name: string;
  level: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SettingsState>({});
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const apply = (value: string) =>
    startTransition(async () => {
      setResult(await setShareLevel(viewerId, value));
      setConfirmRevoke(false);
    });
  return (
    <div className="session-breakdown">
      <div className="inline share-row">
        <strong>{name}</strong>
        <select
          className="select share-level"
          aria-label={`Access level for ${name}`}
          value={level}
          disabled={pending}
          onChange={(e) =>
            e.target.value === "none" ? setConfirmRevoke(true) : apply(e.target.value)
          }
        >
          <option value="full">Full access</option>
          <option value="summary">Summary only</option>
          <option value="none">Revoke access</option>
        </select>
      </div>
      {confirmRevoke && (
        <div className="notice warn confirm-box">
          <p>
            Revoke {name}&apos;s access to your profile? They lose access immediately; it can&apos;t
            erase anything they already saved.
          </p>
          <button
            className="btn sm danger"
            type="button"
            disabled={pending}
            onClick={() => apply("none")}
          >
            Revoke access
          </button>{" "}
          <button className="btn sm" type="button" onClick={() => setConfirmRevoke(false)}>
            Cancel
          </button>
        </div>
      )}
      <Result state={result} />
    </div>
  );
}
