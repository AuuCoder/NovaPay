"use server";

import { redirect } from "next/navigation";
import {
  clearRegistrySession,
  createRegistrySession,
  loginRegistryDeveloper,
  registerRegistryDeveloper,
} from "../../../lib/auth/session";
import { buildNovaPayAdminSsoStartUrl } from "../../../lib/auth/novapay-admin-sso";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function withMessage(path: string, key: "error" | "success", message: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(key, message);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export async function developerSignInAction(formData: FormData) {
  const email = getString(formData, "email");
  const password = getString(formData, "password");

  if (!email || !password) {
    redirect(withMessage("/developer/auth", "error", "missing_credentials"));
  }

  const result = await loginRegistryDeveloper({ email, password });

  if (!result.success || !result.developer) {
    redirect(
      withMessage(
        "/developer/auth",
        "error",
        result.errorCode === "ACCOUNT_SUSPENDED"
          ? "account_suspended"
          : result.errorCode === "EMAIL_UNVERIFIED"
            ? "email_unverified"
          : "invalid_credentials",
      ),
    );
  }

  await createRegistrySession({
    actorKind: "DEVELOPER",
    actorId: result.developer.id,
    email: result.developer.email,
    displayName: result.developer.displayName,
  });

  redirect(withMessage("/developer/plugins", "success", "signed_in"));
}

export async function developerRegisterAction(formData: FormData) {
  const displayName = getString(formData, "displayName");
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const contactName = getString(formData, "contactName");
  const contactCompany = getString(formData, "contactCompany");

  const result = await registerRegistryDeveloper({
    displayName,
    email,
    password,
    contact: {
      contactName,
      company: contactCompany,
    },
  });

  if (!result.success || !result.developer) {
    const errorMessage =
      result.errorCode === "EMAIL_ALREADY_EXISTS"
        ? "email_exists"
        : result.errorCode === "PASSWORD_TOO_SHORT"
          ? "password_too_short"
          : result.errorCode === "INVALID_EMAIL"
            ? "invalid_email"
            : result.errorCode === "MISSING_DISPLAY_NAME"
              ? "missing_display_name"
              : "registration_incomplete";
    redirect(withMessage("/developer/auth", "error", errorMessage));
  }

  redirect(withMessage("/developer/auth", "success", "verification_required"));
}

export async function developerSsoSignInAction() {
  redirect(buildNovaPayAdminSsoStartUrl());
}

export async function developerSignOutAction() {
  await clearRegistrySession();
  redirect(withMessage("/developer/auth", "success", "signed_out"));
}
