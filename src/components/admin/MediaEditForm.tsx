"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { updateMedia, type UploadState } from "@/app/admin/actions";
import { MEDIA_CATEGORIES, type MediaCategory } from "@/lib/media-constants";

const initialState: UploadState = {};

const CATEGORY_LABELS: Record<MediaCategory, string> = {
  logo: "Logo",
  factory: "Factory / production photos",
  team: "Team / leadership photo",
  certificate: "Certificate",
  gallery: "Gallery"
};

export function MediaEditForm({ id, category, title }: { id: string; category: MediaCategory; title: string }) {
  const [state, formAction] = useActionState(updateMedia, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="mt-3 flex flex-col gap-3 border-t border-[var(--border)] pt-3">
      <input type="hidden" name="id" value={id} />
      <label className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
        Category
        <select name="category" defaultValue={category} className="mt-1 w-full rounded-s border border-[var(--border-strong)] bg-transparent px-2 py-2 text-[0.8rem]">
          {MEDIA_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}
        </select>
      </label>
      <label className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
        Label
        <input name="title" defaultValue={title} className="mt-1 w-full rounded-s border border-[var(--border-strong)] bg-transparent px-2 py-2 text-[0.8rem]" />
      </label>
      <label className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
        Replace file (optional)
        <input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf" className="mt-1 w-full text-[0.75rem]" />
      </label>
      {state.error && <p className="text-[0.76rem] text-red-600">{state.error}</p>}
      {state.success && <p className="text-[0.76rem] text-forest">Updated.</p>}
      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn btn-primary self-start !px-3 !py-2 !text-[0.7rem] disabled:opacity-60">{pending ? "Saving..." : "Save changes"}</button>;
}