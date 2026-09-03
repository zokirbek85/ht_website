"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { uploadMedia, type UploadState } from "@/app/admin/actions";
import { MEDIA_CATEGORIES } from "@/lib/media-constants";

const initialState: UploadState = {};

const CATEGORY_LABELS: Record<(typeof MEDIA_CATEGORIES)[number], string> = {
  logo: "Logo",
  factory: "Factory / production photos",
  team: "Team / leadership photo",
  certificate: "Certificate (shown on Quality page)",
  gallery: "Gallery"
};

export function MediaUploadForm() {
  const [state, formAction] = useActionState(uploadMedia, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="category" className="font-mono text-[0.68rem] uppercase tracking-wide text-[var(--text-soft)]">
          Category
        </label>
        <select
          id="category"
          name="category"
          required
          className="rounded-s border border-[var(--border-strong)] bg-transparent px-4 py-3 text-[0.9rem] focus:border-forest focus:outline-none"
        >
          {MEDIA_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="title" className="font-mono text-[0.68rem] uppercase tracking-wide text-[var(--text-soft)]">
          Label (optional)
        </label>
        <input
          id="title"
          name="title"
          type="text"
          placeholder="e.g. ISO 9001 certificate 2026"
          className="rounded-s border border-[var(--border-strong)] bg-transparent px-4 py-3 text-[0.9rem] focus:border-forest focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="file" className="font-mono text-[0.68rem] uppercase tracking-wide text-[var(--text-soft)]">
          File — JPG, PNG, WEBP, SVG, DNG or PDF, up to 10MB
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,image/svg+xml,image/x-adobe-dng,image/dng,application/dng,.dng,application/pdf"
          className="rounded-s border border-dashed border-[var(--border-strong)] bg-transparent px-4 py-3 text-[0.85rem] file:mr-4 file:rounded-s file:border-0 file:bg-forest file:px-3 file:py-1.5 file:text-[0.75rem] file:text-white"
        />
      </div>

      {state.error && <p className="text-[0.82rem] text-red-600">{state.error}</p>}
      {state.success && <p className="text-[0.82rem] text-forest">Uploaded.</p>}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary self-start disabled:opacity-60">
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}
