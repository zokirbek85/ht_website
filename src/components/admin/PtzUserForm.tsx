"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addPtzUser, type PtzUserFormState } from "@/app/admin/ptz/actions";

const initialState: PtzUserFormState = {};

export function PtzUserForm() {
  const [state, formAction] = useActionState(addPtzUser, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-m border border-[var(--border)] bg-[var(--bg-raised)] p-4">
      <div>
        <label htmlFor="telegramId" className="mb-1 block font-mono text-[0.65rem] uppercase tracking-wide text-[var(--text-soft)]">
          Telegram ID
        </label>
        <input
          id="telegramId"
          name="telegramId"
          required
          pattern="\d+"
          placeholder="123456789"
          className="w-44 rounded-s border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm focus:border-forest focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="role" className="mb-1 block font-mono text-[0.65rem] uppercase tracking-wide text-[var(--text-soft)]">
          Role
        </label>
        <select
          id="role"
          name="role"
          className="rounded-s border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm focus:border-forest focus:outline-none"
        >
          <option value="uploader">Uploader</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-[0.8rem] text-red-600">{state.error}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary !text-[0.75rem] disabled:opacity-60">
      {pending ? "Adding…" : "Add user"}
    </button>
  );
}
