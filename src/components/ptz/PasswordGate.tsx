"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { unlockReport, type UnlockState } from "@/app/ptz/report/[token]/actions";

const initialState: UnlockState = {};

export function PasswordGate({ token }: { token: string }) {
  const boundAction = unlockReport.bind(null, token);
  const [state, formAction] = useActionState(boundAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1220] px-6">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-lg border border-white/10 bg-[#111a2b] p-8 text-white shadow-xl"
      >
        <h1 className="mb-1 text-lg font-semibold">PTZ Analytics</h1>
        <p className="mb-6 text-sm text-white/60">Ушбу ҳисоботни кўриш учун паролни киритинг.</p>

        <label htmlFor="password" className="mb-2 block text-xs uppercase tracking-wide text-white/50">
          Парол
        </label>
        <input
          id="password"
          name="password"
          type="text"
          autoComplete="off"
          autoFocus
          required
          className="w-full rounded border border-white/20 bg-transparent px-4 py-3 text-base tracking-widest focus:border-blue-400 focus:outline-none"
        />

        {state.error && <p className="mt-3 text-sm text-red-400">{state.error}</p>}

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full rounded bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
    >
      {pending ? "Текширилмоқда…" : "Киришни очиш"}
    </button>
  );
}
