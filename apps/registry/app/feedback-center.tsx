"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Locale = "zh" | "en";

const AUTO_CLOSE_MS = 4200;

function resolveFeedback(locale: Locale, type: "error" | "success", code: string) {
  const dictionary = {
    signin_required: {
      title: { zh: "需要先登录", en: "Sign-in required" },
      body: { zh: "请先登录后再继续访问当前页面。", en: "Please sign in before continuing to this page." },
    },
    admin_required: {
      title: { zh: "需要治理权限", en: "Governance access required" },
      body: { zh: "当前页面需要 NovaPay 主站管理员 SSO 会话。", en: "This page requires a NovaPay main-site admin SSO session." },
    },
    missing_credentials: {
      title: { zh: "信息不完整", en: "Missing credentials" },
      body: { zh: "请输入邮箱和密码。", en: "Please enter both email and password." },
    },
    invalid_credentials: {
      title: { zh: "登录失败", en: "Sign-in failed" },
      body: { zh: "开发者账号或密码不正确。", en: "The developer account or password is incorrect." },
    },
    account_suspended: {
      title: { zh: "账号已停用", en: "Account suspended" },
      body: { zh: "当前开发者账号已被停用，请联系平台管理员。", en: "This developer account has been suspended. Contact the platform administrator." },
    },
    email_exists: {
      title: { zh: "邮箱已存在", en: "Email already exists" },
      body: { zh: "该邮箱已经注册，请直接登录或更换邮箱。", en: "This email is already registered. Sign in directly or use another email." },
    },
    password_too_short: {
      title: { zh: "密码过短", en: "Password too short" },
      body: { zh: "密码至少需要 8 位。", en: "Password must be at least 8 characters long." },
    },
    invalid_email: {
      title: { zh: "邮箱格式错误", en: "Invalid email" },
      body: { zh: "请输入合法的邮箱地址。", en: "Please enter a valid email address." },
    },
    missing_display_name: {
      title: { zh: "缺少显示名称", en: "Missing display name" },
      body: { zh: "请填写显示名称后再提交。", en: "Please provide a display name before submitting." },
    },
    registration_incomplete: {
      title: { zh: "注册信息不完整", en: "Registration incomplete" },
      body: { zh: "请完整填写注册表单。", en: "Please complete the registration form." },
    },
    sso_token_missing: {
      title: { zh: "SSO 凭证缺失", en: "Missing SSO token" },
      body: { zh: "NovaPay SSO 凭证缺失，请重新发起登录。", en: "The NovaPay SSO token is missing. Please try signing in again." },
    },
    sso_token_invalid: {
      title: { zh: "SSO 凭证失效", en: "SSO token expired" },
      body: { zh: "NovaPay SSO 凭证已失效，请重新发起登录。", en: "The NovaPay SSO token is invalid or expired. Please try again." },
    },
    signed_in: {
      title: { zh: "登录成功", en: "Signed in" },
      body: { zh: "开发者工作台已准备就绪。", en: "Your developer workspace is ready." },
    },
    developer_created: {
      title: { zh: "账号创建成功", en: "Developer account created" },
      body: { zh: "开发者账号已创建，可以继续上传和运营插件。", en: "The developer account has been created. You can now continue with plugin publishing." },
    },
    signed_out: {
      title: { zh: "已退出登录", en: "Signed out" },
      body: { zh: "当前浏览器已清除 Registry 会话。", en: "The current browser session has been cleared from the Registry." },
    },
    sso_connected: {
      title: { zh: "SSO 已连接", en: "SSO connected" },
      body: { zh: "已通过 NovaPay 主站管理员会话进入治理工作区。", en: "You have entered the governance workspace through NovaPay main-site admin SSO." },
    },
  } satisfies Record<string, { title: Record<Locale, string>; body: Record<Locale, string> }>;

  const match =
    code in dictionary
      ? dictionary[code as keyof typeof dictionary]
      : null;
  if (match) {
    return {
      title: match.title[locale],
      body: match.body[locale],
      tone: type,
    };
  }

  return {
    title: type === "error" ? (locale === "en" ? "Operation failed" : "操作失败") : locale === "en" ? "Operation completed" : "操作完成",
    body: code,
    tone: type,
  };
}

export function FeedbackCenter({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(100);
  const [isPending, startTransition] = useTransition();

  const payload = useMemo(() => {
    const error = searchParams.get("error");
    const success = searchParams.get("success");
    if (error) return resolveFeedback(locale, "error", error);
    if (success) return resolveFeedback(locale, "success", success);
    return null;
  }, [locale, searchParams]);

  useEffect(() => {
    if (!payload) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setProgress(100);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.max(0, 100 - (elapsed / AUTO_CLOSE_MS) * 100);
      setProgress(nextProgress);

      if (elapsed >= AUTO_CLOSE_MS) {
        window.clearInterval(interval);
        setOpen(false);
      }
    }, 80);

    return () => window.clearInterval(interval);
  }, [payload]);

  useEffect(() => {
    if (!payload || open) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        url.searchParams.delete("success");
        router.replace(`${pathname}${url.search}`, { scroll: false });
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [open, payload, pathname, router, startTransition]);

  if (!payload || !open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 1100,
        width: "min(100%, 380px)",
      }}
    >
      <div
        className="card"
        style={{
          gap: 12,
          borderRadius: 18,
          borderColor:
            payload.tone === "error"
              ? "rgba(240, 68, 56, 0.18)"
              : "rgba(18, 183, 106, 0.18)",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.14)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              display: "inline-flex",
              width: 38,
              height: 38,
              borderRadius: 9999,
              alignItems: "center",
              justifyContent: "center",
              background:
                payload.tone === "error"
                  ? "rgba(240, 68, 56, 0.10)"
                  : "rgba(18, 183, 106, 0.10)",
              color:
                payload.tone === "error"
                  ? "var(--color-negative-deep)"
                  : "var(--color-positive-deep)",
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {payload.tone === "error" ? "!" : "✓"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="text-body-md-strong">{payload.title}</p>
            <p className="text-body-sm text-body-color" style={{ marginTop: 4 }}>
              {payload.body}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-tertiary btn-sm"
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            {locale === "en" ? "Close" : "关闭"}
          </button>
        </div>
        <div
          style={{
            height: 3,
            width: "100%",
            borderRadius: 9999,
            background: "rgba(15, 23, 42, 0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background:
                payload.tone === "error"
                  ? "var(--color-negative)"
                  : "var(--color-positive)",
              transition: "width 80ms linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}
