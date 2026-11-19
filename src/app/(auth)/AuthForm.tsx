"use client";

import { useActionState } from "react";

import type { AuthFormState } from "./actions";

type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
};

type AuthFormProps = {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  hidden?: Record<string, string>;
};

export function AuthForm({ action, fields, submitLabel, hidden = {} }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="auth-form">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((field) => (
        <div className="formfield" key={field.name}>
          <label htmlFor={field.name}>{field.label}</label>
          <input
            id={field.name}
            className="input"
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            required
          />
        </div>
      ))}
      {state.error && (
        <div className="notice error" role="alert">
          {state.error}
        </div>
      )}
      {state.message && (
        <div className="notice" role="status">
          {state.message}
        </div>
      )}
      <button className="btn primary block" type="submit" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
