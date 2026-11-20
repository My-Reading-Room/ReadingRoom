"use client";

import { useActionForm } from "@/hooks/useActionForm";
import { useLocalToday } from "@/hooks/useLocalToday";

import { saveAnnualGoal, saveDailyGoal, type GoalState } from "./actions";

function Result({ state }: { state: GoalState }) {
  if (!state.error && !state.message) return null;
  return (
    <div className={`notice ${state.error ? "error" : ""}`} role={state.error ? "alert" : "status"}>
      {state.error ?? state.message}
    </div>
  );
}

export function AnnualGoalForm({ year, target }: { year: number; target: number }) {
  const { state, pending, onSubmit } = useActionForm<GoalState>(saveAnnualGoal, {});
  return (
    <form onSubmit={onSubmit} className="goal-form">
      <input type="hidden" name="year" value={year} />
      <div className="formfield goal-field">
        <label htmlFor="annual-goal">Books target</label>
        <input
          className="input"
          id="annual-goal"
          name="books_target"
          type="number"
          min={1}
          max={10000}
          step={1}
          defaultValue={target}
          key={`${year}-${target}`}
          required
        />
      </div>
      <button className="btn sm" type="submit" disabled={pending}>
        Save annual target
      </button>
      <Result state={state} />
    </form>
  );
}

export function DailyGoalForm({ target }: { target: number }) {
  const today = useLocalToday();
  const { state, pending, onSubmit } = useActionForm<GoalState>(saveDailyGoal, {});
  return (
    <form onSubmit={onSubmit} className="goal-form">
      <input type="hidden" name="today" value={today} />
      <div className="formfield daily-target-field">
        <label htmlFor="daily-goal-minutes">Minutes / day</label>
        <input
          className="input"
          id="daily-goal-minutes"
          name="target_minutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          step={1}
          defaultValue={target}
          key={target}
          required
        />
      </div>
      <button className="btn sm" type="submit" disabled={pending}>
        Save daily goal
      </button>
      <Result state={state} />
    </form>
  );
}
