import Link from "next/link";
import { logout } from "@/app/admin/actions";
import { Mark } from "@/components/icons/Mark";

export function AdminNav() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-raised)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Mark className="h-8 w-8 text-forest" />
            <span className="font-display text-[0.95rem] font-bold tracking-wide">
              HAZORASP<span className="ml-1 font-body text-[0.6rem] font-normal tracking-[0.2em] text-[var(--text-soft)]">ADMIN</span>
            </span>
          </div>
          <nav className="flex items-center gap-4 font-mono text-[0.72rem] uppercase tracking-wide text-[var(--text-soft)]">
            <Link href="/admin/media" className="hover:text-forest">
              Media
            </Link>
            <Link href="/admin/ptz" className="hover:text-forest">
              PTZ Analytics
            </Link>
          </nav>
        </div>
        <form action={logout}>
          <button type="submit" className="btn-ghost !text-[0.72rem]">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
