"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { submitInquiry, type ContactActionState } from "@/app/[locale]/contact/actions";

const initialState: ContactActionState = { status: "idle" };

export function ContactForm() {
  const t = useTranslations("contact.form");
  const [state, formAction] = useActionState(submitInquiry, initialState);
  const productOptions = t.raw("productOptions") as string[];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("company")} name="company" required />
        <Field label={t("country")} name="country" required autoComplete="country-name" />
        <Field label={t("person")} name="person" required autoComplete="name" />
        <Field label={t("email")} name="email" type="email" required autoComplete="email" />
        <Field label={t("phone")} name="phone" type="tel" autoComplete="tel" />
        <div className="flex flex-col gap-2">
          <label htmlFor="product" className="font-mono text-[0.68rem] uppercase tracking-wide text-[var(--surface-dark-text-soft)]">
            {t("product")}
          </label>
          <select
            id="product"
            name="product"
            className="rounded-s border border-[var(--surface-dark-border)] bg-white/5 px-4 py-3.5 text-[0.92rem] text-[var(--surface-dark-text)] focus:border-[var(--accent-2)] focus:outline-none"
          >
            {productOptions.map((opt) => (
              <option key={opt} value={opt} className="text-ink">
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("volume")} name="volume" placeholder={t("volumePlaceholder")} />
        </div>
        <div className="sm:col-span-2 flex flex-col gap-2">
          <label htmlFor="message" className="font-mono text-[0.68rem] uppercase tracking-wide text-[var(--surface-dark-text-soft)]">
            {t("message")}
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            placeholder={t("messagePlaceholder")}
            className="resize-y rounded-s border border-[var(--surface-dark-border)] bg-white/5 px-4 py-3.5 text-[0.92rem] text-[var(--surface-dark-text)] placeholder:text-[var(--surface-dark-text-soft)] focus:border-[var(--accent-2)] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 pt-2">
        <SubmitButton label={t("submit")} submittedLabel={t("submitted")} success={state.status === "success"} />
        <span className="text-[0.78rem] text-[var(--surface-dark-text-soft)]">{t("note")}</span>
      </div>
    </form>
  );
}

function SubmitButton({
  label,
  submittedLabel,
  success
}: {
  label: string;
  submittedLabel: string;
  success: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-brass disabled:opacity-60">
      {success ? `${submittedLabel} ✓` : label}
    </button>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  placeholder
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="font-mono text-[0.68rem] uppercase tracking-wide text-[var(--surface-dark-text-soft)]">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="rounded-s border border-[var(--surface-dark-border)] bg-white/5 px-4 py-3.5 text-[0.92rem] text-[var(--surface-dark-text)] placeholder:text-[var(--surface-dark-text-soft)] focus:border-[var(--accent-2)] focus:outline-none"
      />
    </div>
  );
}
