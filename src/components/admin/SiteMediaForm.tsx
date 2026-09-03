"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateSiteMedia, type UploadState } from "@/app/admin/actions";
import { SITE_MEDIA_ROLES, type SiteMediaRole, type SiteMediaSettings } from "@/lib/site-media-constants";
import type { MediaItem } from "@/lib/media";

const ROLE_LABELS: Record<SiteMediaRole, string> = {
  logo: "Header and footer logo",
  hero: "Homepage hero image",
  product: "Product card image",
  favicon: "Browser icon"
};

export function SiteMediaForm({ items, settings }: { items: MediaItem[]; settings: SiteMediaSettings }) {
  const [state, formAction] = useActionState(updateSiteMedia, {} as UploadState);

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="font-display text-[1rem] uppercase tracking-wide">Site media roles</h2>
        <p className="mt-1 text-[0.82rem] text-[var(--text-soft)]">Choose which uploaded media appears in each site location.</p>
      </div>
      {SITE_MEDIA_ROLES.map((role) => (
        <label key={role} className="flex flex-col gap-1 font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
          {ROLE_LABELS[role]}
          <select name={role} defaultValue={settings[role] ?? ""} className="rounded-s border border-[var(--border-strong)] bg-transparent px-3 py-2 text-[0.8rem]">
            <option value="">Use fallback / none</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.category})</option>)}
          </select>
        </label>
      ))}
      {state.error && <p className="text-[0.8rem] text-red-600">{state.error}</p>}
      {state.success && <p className="text-[0.8rem] text-forest">Site media settings updated.</p>}
      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn btn-primary self-start disabled:opacity-60">{pending ? "Saving..." : "Save site media"}</button>;
}