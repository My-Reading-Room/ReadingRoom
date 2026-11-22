"use client";

import { startTransition, useActionState, useCallback, type FormEvent } from "react";

/**
 * Submit a form to a Server Action without React's automatic form reset.
 *
 * React 19 resets a <form action={…}> after every submission, including ones
 * the server rejected, so a validation error would wipe what the reader typed.
 * Dispatching from onSubmit inside a transition keeps the fields; on success
 * the page revalidates and keyed forms remount with the saved values.
 */
export function useActionForm<S>(action: (prev: S, formData: FormData) => Promise<S>, initial: S) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial as Awaited<S>);
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(() => dispatch(formData));
    },
    [dispatch],
  );
  return { state, pending, onSubmit };
}
