"use client";

import { useState } from "react";
import { inputClass } from "@/app/admin/ui";

interface AdminLoginFormProps {
  action: (formData: FormData) => void | Promise<void>;
  configured: boolean;
  emailPrefill: string;
  passwordPrefill: string;
  accountLabel: string;
  passwordLabel: string;
  accountPlaceholder: string;
  passwordPlaceholder: string;
  submitLabel: string;
}

export function AdminLoginForm(props: AdminLoginFormProps) {
  const [email, setEmail] = useState(props.emailPrefill);
  const [password, setPassword] = useState(props.passwordPrefill);

  return (
    <form action={props.action} className="mt-6 space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">{props.accountLabel}</span>
        <input
          name="email"
          type="text"
          placeholder={props.accountPlaceholder}
          className={inputClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          disabled={!props.configured}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">{props.passwordLabel}</span>
        <input
          name="password"
          type="password"
          placeholder={props.passwordPlaceholder}
          className={inputClass}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          disabled={!props.configured}
        />
      </label>
      <button
        type="submit"
        disabled={!props.configured}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {props.submitLabel}
      </button>
    </form>
  );
}
