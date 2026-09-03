"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "@/app/admin/actions";
import { Mark } from "@/components/icons/Mark";

const initialState: LoginState = {};

export default function AdminLoginPage() {
  const [state, formAction] = useActionState(login, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form action={formAction} className="w-full max-w-sm rounded-m border border-[var(--border)] bg-[var(--bg-raised)] p-8 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <Mark className="h-9 w-9 text-forest" />
          <span className="font-display text-[1rem] font-bold tracking-wide">
            HAZORASP<span className="ml-1 font-body text-[0.6rem] font-normal tracking-[0.2em] text-[var(--text-soft)]">ADMIN</span>
          </span>
        </div>

        <label htmlFor="password" className="mb-2 block font-mono text-[0.68rem] uppercase tracking-wide text-[var(--text-soft)]">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-s border border-[var(--border-strong)] bg-transparent px-4 py-3 text-[0.95rem] focus:border-forest focus:outline-none"
        />

        {state.error && <p className="mt-3 text-[0.82rem] text-red-600">{state.error}</p>}

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary mt-6 w-full disabled:opacity-60">
      {pending ? "Checking…" : "Sign in"}
    </button>
  );
}
