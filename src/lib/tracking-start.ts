import type { GoalHistoryRow, IsoDate, ProfileInput, SessionInput } from "./types";

/** A per-reader reporting boundary, expressed as an ISO local calendar date.
 * Older reading records are preserved; only dated Insights and goals are scoped.
 */
export function isTrackingDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Before the v2.3.2 migration, account creation was the old daily-goal
 * boundary. Preserve that behavior until this profile has a saved start date.
 */
export function profileTrackingStart(profile: ProfileInput | null | undefined): IsoDate | null {
  if (isTrackingDate(profile?.tracking_start_date)) return profile.tracking_start_date;
  const creationDate =
    typeof profile?.created_at === "string" ? profile.created_at.slice(0, 10) : null;
  return isTrackingDate(creationDate) ? creationDate : null;
}

export function reportingStartDate(
  periodStart: IsoDate,
  trackingStart: IsoDate | null = null,
): IsoDate {
  if (!isTrackingDate(periodStart)) throw new RangeError("Valid reporting start date required");
  return isTrackingDate(trackingStart) && trackingStart > periodStart ? trackingStart : periodStart;
}

type ReportingPeriod = {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  today: IsoDate;
  trackingStart?: IsoDate | null;
};

export function sessionsInReportingPeriod<S extends SessionInput>(
  sessions: S[] | null | undefined,
  { periodStart, periodEnd, today, trackingStart = null }: ReportingPeriod,
): S[] {
  if (!isTrackingDate(periodEnd) || !isTrackingDate(today)) {
    throw new RangeError("Valid reporting end and current dates required");
  }
  const first = reportingStartDate(periodStart, trackingStart);
  return (Array.isArray(sessions) ? sessions : []).filter(
    (s) =>
      isTrackingDate(s.session_date) &&
      s.session_date >= first &&
      s.session_date <= periodEnd &&
      s.session_date <= today,
  );
}

/** A reader's tracking baseline applies on the first tracked date, without
 * altering real history rows. Dated goal changes on/after that date still win.
 * Existing same-day goal rows are authoritative and are not overridden.
 */
export function anchoredGoalHistory(
  history: GoalHistoryRow[] | null | undefined,
  trackingStart: IsoDate | null,
  initialTarget: unknown,
): GoalHistoryRow[] {
  const rows = Array.isArray(history) ? history : [];
  const minutes = Number(initialTarget);
  if (
    !isTrackingDate(trackingStart) ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 1440 ||
    rows.some((row) => row.effective_date === trackingStart)
  ) {
    return rows;
  }
  return [
    ...rows,
    { effective_date: trackingStart, target_minutes: minutes, tracking_baseline: true },
  ];
}
