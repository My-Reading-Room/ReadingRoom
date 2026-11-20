import type { Metadata } from "next";

import { LogoutButton } from "@/components/LogoutButton";
import { getSettingsData } from "@/data/settings";
import { profileTrackingStart } from "@/lib/tracking-start";
import { localToday } from "@/utils/local-today";

import { InviteForms, ProfileForm, ShareLevel, TrackingForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [{ email, profile, outgoing, incoming }, today] = await Promise.all([
    getSettingsData(),
    localToday(),
  ]);
  return (
    <>
      <div className="eyebrow">Personalization &amp; sharing</div>
      <h1 className="heading">Settings</h1>
      <p className="subtitle">
        Your personal library stays yours. Grant Full or Summary-only access to individual people.
      </p>

      <div className="grid2">
        <section className="card">
          <h2 className="section-title">Your account</h2>
          <p className="section-sub">
            Only you can modify your books, sessions, goals and bookshelf.
          </p>
          <ProfileForm name={profile.display_name} />
          <div className="cardline" />
          <TrackingForm
            start={profileTrackingStart(profile) ?? today}
            goal={profile.tracking_start_goal_minutes ?? 30}
          />
          <div className="cardline" />
          <div className="text-sm muted">Signed in as {email}</div>
          <div className="form-footer">
            <LogoutButton />
          </div>
        </section>
        <section className="card">
          <h2 className="section-title">Invite another reader</h2>
          <p className="section-sub">
            Each person signs up for their own account. Share your profile at the access level you
            choose.
          </p>
          <InviteForms />
        </section>
      </div>

      <div className="grid2 settings-row">
        <section className="card">
          <h2 className="section-title">People who can see you</h2>
          <p className="section-sub">Change or revoke each person&apos;s access at any time.</p>
          {outgoing.length === 0 ? (
            <p className="notice">You have not shared your profile yet.</p>
          ) : (
            outgoing.map((s) => (
              <ShareLevel
                key={s.viewer_id}
                viewerId={s.viewer_id}
                name={s.name}
                level={s.access_level}
              />
            ))
          )}
          <p className="tiny">
            Revoking removes their future access; it cannot erase screenshots or exports they saved.
          </p>
        </section>
        <section className="card">
          <h2 className="section-title">Profiles shared with you</h2>
          <p className="section-sub">
            Read-only access; you can never edit someone else&apos;s data.
          </p>
          {incoming.length === 0 ? (
            <p className="notice">No one has shared a profile with you yet.</p>
          ) : (
            incoming.map((s) => (
              <div key={s.owner_id} className="session-breakdown">
                <strong>{s.name}</strong>{" "}
                <span className="status-pill">
                  {s.access_level === "full" ? "Full library" : "Summary only"}
                </span>
              </div>
            ))
          )}
          <p className="tiny">
            Only Full access includes book titles, ratings, activity logs and bookshelf
            arrangements. Summary-only shows aggregate totals without raw records.
          </p>
        </section>
      </div>

      <div className="grid2 settings-row">
        <section className="card">
          <h2 className="section-title">Backup</h2>
          <p className="section-sub">Your own reading records are yours to export.</p>
          <div className="toolbar form-footer">
            <a className="btn" href="/api/export?format=json" download>
              ⇩ Export my data (JSON)
            </a>
            <a className="btn" href="/api/export?format=csv" download>
              ⇩ Export books (CSV)
            </a>
          </div>
          <p className="tiny">
            The backup contains your books (with reread history), sessions, exact chapters, goals,
            goal history and shelf settings. It never includes other people&apos;s records.
          </p>
        </section>
        <section className="card">
          <h2 className="section-title">Install on your phones</h2>
          <p className="section-sub">Use this single web address on any phone.</p>
          <p className="text-sm install-steps">
            <strong>iPhone:</strong> Safari → Share → Add to Home Screen.
            <br />
            <strong>Android:</strong> Chrome → Menu → Install app or Add to Home Screen.
            <br />
            <strong>Desktop:</strong> Open the site in a browser.
          </p>
        </section>
      </div>
    </>
  );
}
