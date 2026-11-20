import type { Metadata } from "next";
import Link from "next/link";

import { signUp } from "../actions";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <p className="auth-sub">Create your reading room.</p>
      <AuthForm
        action={signUp}
        submitLabel="Create account"
        fields={[
          { name: "displayName", label: "Display name", type: "text", autoComplete: "nickname" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
        ]}
      />
      <p className="auth-foot">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
