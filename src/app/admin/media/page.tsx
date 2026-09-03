import { redirect } from "next/navigation";
import Image from "next/image";
import { isAuthenticated } from "@/lib/auth";
import { listMedia, MEDIA_CATEGORIES, type MediaItem } from "@/lib/media";
import { deleteMedia } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { MediaUploadForm } from "@/components/admin/MediaUploadForm";
import { MediaEditForm } from "@/components/admin/MediaEditForm";
import { SiteMediaForm } from "@/components/admin/SiteMediaForm";
import { getSiteMediaSettings } from "@/lib/site-media";

export default async function AdminMediaPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  const [items, settings] = await Promise.all([listMedia(), getSiteMediaSettings()]);

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-[1.5rem] uppercase tracking-wide">Media library</h1>
        <p className="mt-2 max-w-[60ch] text-[0.9rem] text-[var(--text-soft)]">
          Upload the logo, factory photos, team photo, certificates and gallery images here. Files marked
          &ldquo;certificate&rdquo; appear automatically on the public Quality page.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="flex flex-col gap-6">
            <MediaUploadForm />
            <SiteMediaForm items={items} settings={settings} />
          </div>

          <div className="flex flex-col gap-8">
            {MEDIA_CATEGORIES.map((category) => {
              const categoryItems = items.filter((item) => item.category === category);
              if (categoryItems.length === 0) return null;
              return (
                <div key={category}>
                  <h2 className="mb-3 font-mono text-[0.7rem] uppercase tracking-wide text-[var(--text-soft)]">
                    {category} ({categoryItems.length})
                  </h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {categoryItems.map((item) => (
                      <MediaCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && (
              <p className="text-[0.9rem] text-[var(--text-soft)]">No files uploaded yet.</p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  const isImage = item.mimeType.startsWith("image/") && item.mimeType !== "image/svg+xml";
  const deleteWithId = deleteMedia.bind(null, item.id);

  return (
    <div className="card overflow-hidden">
      <div className="flex aspect-square items-center justify-center bg-[var(--bg-sunken)]">
        {isImage ? (
          <Image src={item.url} alt={item.title} width={200} height={200} className="h-full w-full object-cover" />
        ) : (
          <span className="font-mono text-[0.7rem] text-[var(--text-soft)]">
            {item.mimeType === "application/pdf" ? "PDF" : "FILE"}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-[0.78rem] font-medium" title={item.title}>
          {item.title}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <a href={item.url} target="_blank" rel="noreferrer" className="font-mono text-[0.66rem] text-forest">
            View
          </a>
          <form action={deleteWithId}>
            <button type="submit" className="font-mono text-[0.66rem] text-red-600">
              Delete
            </button>
          </form>
        </div>
        <details className="mt-3 text-[0.78rem]">
          <summary className="cursor-pointer font-mono text-[0.66rem] uppercase tracking-wide text-forest">Edit</summary>
          <MediaEditForm id={item.id} category={item.category} title={item.title} />
        </details>
      </div>
    </div>
  );
}
