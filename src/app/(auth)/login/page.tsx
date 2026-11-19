import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { safeRedirectPath } from "@/utils/safe-redirect";

import { signIn } from "../actions";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Sign in" };

type LoginSearchParams = Promise<{ next?: string | string[]; error?: string | string[] }>;

async function LoginForm({ searchParams }: { searchParams: LoginSearchParams }) {
  const { next, error } = await searchParams;

  return (
    <>
      {error === "link" && (
        <div className="notice error" role="alert">
          That link is invalid or has expired. Sign in, or request a new link.
        </div>
      )}
      <AuthForm
      action={signIn}
      submitLabel="Sign in"
      hidden={{ next: safeRedirectPath(next) }}
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <p className="auth-sub">Sign in to your library.</p>
      <Suspense>
        <LoginForm searchParams={searchParams} />
      </Suspense>
      <p className="auth-foot">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </>
  );
}
