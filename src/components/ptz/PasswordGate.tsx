"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { unlockReport, type UnlockState } from "@/app/ptz/report/[token]/actions";

type UnlockAction = (token: string, prev: UnlockState, formData: FormData) => Promise<UnlockState>;

const initialState: UnlockState = {};

export function PasswordGate({ token, unlock = unlockReport, title = "PTZ Analytics" }: { token: string; unlock?: UnlockAction; title?: string }) {
  const boundAction = unlock.bind(null, token);
  const [state, formAction] = useActionState(boundAction, initialState);

  return (
    <div
      className="on-dark flex min-h-screen items-center justify-center px-6 text-[var(--surface-dark-text)]"
      style={{ background: "var(--surface-dark)" }}
    >
      <form action={formAction} className="w-full max-w-sm rounded-m border border-[var(--surface-dark-border)] bg-white/[0.04] p-8 backdrop-blur-md">
        <div className="eyebrow">{title}</div>
        <h1 className="heading-natural mt-2 font-display text-lg font-semibold text-white">Ҳисоботга кириш</h1>
        <p className="mt-2 text-sm text-[var(--surface-dark-text-soft)]">Давом этиш учун паролни киритинг.</p>

        <label htmlFor="password" className="mb-2 mt-6 block font-mono text-[0.68rem] uppercase tracking-wide text-[var(--surface-dark-text-soft)]">
          Парол
        </label>
        <input
          id="password"
          name="password"
          type="text"
          autoComplete="off"
          autoFocus
          required
          className="w-full rounded-s border border-[var(--surface-dark-border)] bg-transparent px-4 py-3 text-base tracking-widest text-white focus:border-[var(--accent-2)] focus:outline-none"
        />

        {state.error && <p className="mt-3 text-[0.82rem] text-[#f4a6a6]">{state.error}</p>}

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-brass mt-6 w-full disabled:opacity-60">
      {pending ? "Текширилмоқда…" : "Киришни очиш"}
    </button>
  );
}
