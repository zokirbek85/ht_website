"use server";

import { redirect } from "next/navigation";
import { checkPassword, createSession, destroySession } from "@/lib/auth";
import { deleteMediaItem, uploadMediaFile, type MediaCategory } from "@/lib/media";

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
  await deleteMediaItem(id);
}
