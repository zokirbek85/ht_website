"use server";

import { redirect } from "next/navigation";
import { checkPassword, createSession, destroySession, isAuthenticated } from "@/lib/auth";
import { deleteMediaItem, updateMediaFile, uploadMediaFile, type MediaCategory } from "@/lib/media";
import { saveSiteMediaSettings, SITE_MEDIA_ROLES, type SiteMediaRole } from "@/lib/site-media";

export type LoginState = { error?: string };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  let valid: boolean;
  try {
    valid = checkPassword(password);
  } catch {
    return { error: "Server is missing ADMIN_PASSWORD / ADMIN_SESSION_SECRET configuration." };
  }

  if (!valid) {
    return { error: "Incorrect password." };
  }

  await createSession();
  redirect("/admin/media");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}

export type UploadState = { error?: string; success?: boolean };

export async function uploadMedia(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  if (!(await isAuthenticated())) return { error: "You must be signed in." };

  const file = formData.get("file");
  const category = String(formData.get("category") ?? "");
  const title = String(formData.get("title") ?? "");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first." };
  }

  const result = await uploadMediaFile(file, category as MediaCategory, title);
  if (!result.ok) {
    return { error: result.error };
  }

  return { success: true };
}

export async function deleteMedia(id: string): Promise<void> {
  if (!(await isAuthenticated())) return;
  await deleteMediaItem(id);
}

export async function updateMedia(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  if (!(await isAuthenticated())) return { error: "You must be signed in." };

  const id = String(formData.get("id") ?? "");
  const fileValue = formData.get("file");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : undefined;
  const category = String(formData.get("category") ?? "");
  const title = String(formData.get("title") ?? "");

  const result = await updateMediaFile(id, file, category as MediaCategory, title);
  return result.ok ? { success: true } : { error: result.error };
}

export async function updateSiteMedia(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  if (!(await isAuthenticated())) return { error: "You must be signed in." };

  const values = Object.fromEntries(
    SITE_MEDIA_ROLES.map((role) => [role, String(formData.get(role) ?? "") || null])
  ) as Record<SiteMediaRole, string | null>;
  await saveSiteMediaSettings(values);
  return { success: true };
}
