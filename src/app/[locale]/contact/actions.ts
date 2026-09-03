"use server";

import { contactSchema } from "@/lib/contact-schema";

export type ContactActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function submitInquiry(
  _prevState: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = contactSchema.safeParse(raw);

  if (!parsed.success) {
    return { status: "error", message: "invalid" };
  }

  // TODO: wire to email provider (e.g. Resend) and/or CRM webhook.
  // Kept as a no-op in this scaffold — no inquiry data leaves the server.
  console.log("New inquiry:", parsed.data);

  return { status: "success" };
}
