import Link from "next/link";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getOpenApiSpec } from "@/lib/openapi";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveSchemaReferences(
  schema: unknown,
  components: Record<string, unknown>,
  seen = new Set<string>(),
): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => resolveSchemaReferences(item, components, seen));
  }

  if (!isRecord(schema)) {
    return schema;
  }

  if (typeof schema.$ref === "string") {
    const ref = schema.$ref;

    if (!ref.startsWith("#/components/schemas/")) {
      return schema;
    }

    if (seen.has(ref)) {
      return { $ref: ref };
    }

    const schemaName = ref.replace("#/components/schemas/", "");
    const resolvedSchema = components[schemaName];

    if (!resolvedSchema) {
      return schema;
    }

    const nextSeen = new Set(seen);
    nextSeen.add(ref);

    return resolveSchemaReferences(resolvedSchema, components, nextSeen);
  }

  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      resolveSchemaReferences(value, components, seen),
    ]),
  );
}

function renderSchema(schema: unknown, components: Record<string, unknown>) {
  return JSON.stringify(resolveSchemaReferences(schema, components), null, 2);
}

export default async function DocsPage() {
  const locale = await getCurrentLocale();
  const spec = getOpenApiSpec(locale);
  const paths = Object.entries(spec.paths);
  const componentSchemas = spec.components?.schemas ?? {};

  const content =
    locale === "en"
      ? {
          eyebrow: "API Docs",
          title: "NovaPay API Documentation",
          intro:
            "This page renders the current OpenAPI specification for NovaPay, covering payment creation, callbacks, and merchant administration interfaces. The raw JSON specification is also available for Swagger, Postman, or SDK generation.",
          compatibilityNote:
            "REST-style resource paths are now the primary integration form in this document. Existing `/api/payments/...` action-style endpoints remain available for backward compatibility.",
          viewJson: "Open OpenAPI JSON",
          openAdmin: "Open Admin Console",
          merchantLogin: "Merchant Login",
          overview: "Specification Overview",
          version: "Version",
          server: "Server",
          security: "Security",
          securityDesc:
            "Admin interfaces use authenticated session cookies, while merchant interfaces use `x-novapay-key`, `x-novapay-timestamp`, `x-novapay-nonce`, and `x-novapay-signature`, optionally combined with `Idempotency-Key` and IP allowlists.",
          signing: "Merchant Signing",
          signingDesc:
            "Merchant requests must be signed with dedicated API credentials and a unique `x-novapay-nonce`. Merchant write operations should also provide `Idempotency-Key` for safe retries. Merchant callbacks are verified with `notifySecret`.",
          callbackDesc:
            "Upstream payment callback URLs are generated per merchant channel instance. Do not submit `notifyUrl`. Use `callbackUrl` for merchant business notifications when needed, and use `returnUrl` only for browser redirects. If `returnUrl` is omitted, NovaPay uses a hosted result page.",
          endpoint: "Endpoint",
          untitled: "Untitled operation",
          parameters: "Parameters",
          requestSchema: "Request Schema",
          responseSchema: "Response Schema",
          expandSchema: "Expand schema",
          responses: "Responses",
          noDescription: "No description",
        }
      : {
          title: "NovaPay 站内 API 文档",
          intro:
            "这里直接展示项目当前的 OpenAPI 规范，覆盖支付下单、回调、商户后台配置接口。原始 JSON 规范也可直接读取，方便后续接入 Swagger、Postman 或 SDK 生成工具。",
          compatibilityNote:
            "本文档现在优先展示 REST 风格资源路径；历史 `/api/payments/...` 动作型接口仍继续兼容，但不再作为主接入路径展示。",
          viewJson: "查看 OpenAPI JSON",
          openAdmin: "打开后台",
          merchantLogin: "商户登录",
          eyebrow: "接口文档",
          overview: "规范总览",
          version: "版本",
          server: "服务地址",
          security: "鉴权说明",
          securityDesc:
            "后台接口使用管理员会话 Cookie，商户接口使用 `x-novapay-key`、`x-novapay-timestamp`、`x-novapay-nonce`、`x-novapay-signature`，写接口建议再叠加 `Idempotency-Key`，并可结合 IP 白名单。",
          signing: "商户签名",
          signingDesc:
            "商户接口必须使用独立 API 凭证签名，并保证 `x-novapay-nonce` 单次请求唯一。商户写接口建议同时传入 `Idempotency-Key` 以保障安全重试。回调通知则使用 `notifySecret` 验签。",
          callbackDesc:
            "上游支付回调地址会按商户通道实例自动生成，下单不要传 `notifyUrl`。如需接收商户业务通知，请使用默认业务回调地址或单笔 `callbackUrl`；`returnUrl` 仅用于浏览器跳转，不传时系统会回到 NovaPay 托管结果页。",
          endpoint: "接口地址",
          untitled: "未命名操作",
          parameters: "请求参数",
          requestSchema: "请求结构",
          responseSchema: "响应结构",
          expandSchema: "展开查看",
          responses: "响应说明",
          noDescription: "暂无说明",
        };
  const eyebrow = content.eyebrow;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)] sm:p-12">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-secondary via-accent to-secondary" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-secondary">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {content.title}
            </h1>
            <p className="mt-4 text-base leading-8 text-muted sm:text-lg">{content.intro}</p>
            <p className="mt-3 text-sm leading-7 text-secondary">{content.compatibilityNote}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/api/openapi"
              className="rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white"
            >
              {content.viewJson}
            </Link>
            <Link
              href="/admin/login"
              className="rounded-2xl border border-line bg-white/85 px-4 py-3 text-sm font-medium text-foreground"
            >
              {content.openAdmin}
            </Link>
            <Link
              href="/merchant/login"
              className="rounded-2xl border border-line bg-white/85 px-4 py-3 text-sm font-medium text-foreground"
            >
              {content.merchantLogin}
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.75rem] border border-line bg-panel p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.overview}</p>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-medium text-foreground">OpenAPI</dt>
              <dd className="mt-1 text-muted">{spec.openapi}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">{content.version}</dt>
              <dd className="mt-1 text-muted">{spec.info.version}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">{content.server}</dt>
              <dd className="mt-1 break-all font-mono text-muted">{spec.servers[0]?.url}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">{content.security}</dt>
              <dd className="mt-1 text-muted">{content.securityDesc}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-[1.75rem] border border-line bg-[#1e1812] p-6 text-[#f7efe5] shadow-[0_18px_60px_rgba(20,15,10,0.24)]">
          <p className="text-xs uppercase tracking-[0.22em] text-[#d6c0a6]">{content.signing}</p>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/20 p-4 text-xs leading-7 text-[#f7efe5]">
{`x-novapay-signature = hex(
  hmac_sha256(apiSecret, "{timestamp}.{nonce}.{rawBody}")
)`}
          </pre>
          <p className="mt-4 text-sm leading-7 text-[#eadbc9]">{content.signingDesc}</p>
          <p className="mt-3 text-sm leading-7 text-[#eadbc9]">{content.callbackDesc}</p>
        </div>
      </section>

      <section className="mt-8 space-y-6">
        {paths.map(([path, methods]) => (
          <article
            key={path}
            className="rounded-[1.75rem] border border-line bg-panel-strong p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.endpoint}</p>
                <h2 className="mt-2 break-all font-mono text-lg font-semibold text-foreground sm:text-xl">
                  {path}
                </h2>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {Object.entries(methods ?? {}).map(([method, operation]) => {
                const details = operation as Record<string, unknown>;
                const requestBody = details.requestBody as
                  | { content?: Record<string, { schema?: unknown }> }
                  | undefined;
                const responses = (details.responses ?? {}) as Record<string, unknown>;
                const parameters = Array.isArray(details.parameters)
                  ? (details.parameters as Array<Record<string, unknown>>)
                  : [];

                return (
                  <div key={method} className="rounded-[1.5rem] border border-line bg-white/75 p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-accent-soft px-3 py-1 font-mono text-xs font-semibold uppercase text-accent">
                        {method}
                      </span>
                      <h3 className="text-lg font-semibold text-foreground">
                        {String(details.summary ?? content.untitled)}
                      </h3>
                    </div>

                    {details.description ? (
                      <p className="mt-3 text-sm leading-7 text-muted">
                        {String(details.description)}
                      </p>
                    ) : null}

                    {parameters.length > 0 ? (
                      <div className="mt-5">
                        <p className="text-sm font-medium text-foreground">{content.parameters}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {parameters.map((parameter) => (
                            <span
                              key={`${String(parameter.in)}-${String(parameter.name)}`}
                              className="rounded-full border border-line bg-white px-3 py-1 font-mono text-xs text-muted"
                            >
                              {String(parameter.in)}: {String(parameter.name)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {requestBody ? (
                      <div className="mt-5">
                        <details className="rounded-2xl border border-line bg-white">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
                            <span>{content.requestSchema}</span>
                            <span className="text-xs font-normal text-muted">{content.expandSchema}</span>
                          </summary>
                          <pre className="overflow-x-auto border-t border-line bg-[#221b15] p-4 text-xs leading-6 text-[#f4eadc]">
                            {renderSchema(
                              requestBody.content?.["application/json"]?.schema ?? {},
                              componentSchemas,
                            )}
                          </pre>
                        </details>
                      </div>
                    ) : null}

                    <div className="mt-5">
                      <p className="text-sm font-medium text-foreground">{content.responses}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {Object.entries(responses).map(([statusCode, response]) => (
                          <div key={statusCode} className="rounded-2xl border border-line bg-white p-4">
                            <p className="font-mono text-sm font-semibold text-foreground">
                              {statusCode}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted">
                              {String(
                                (response as { description?: string }).description ??
                                  content.noDescription,
                              )}
                            </p>
                            {(response as {
                              content?: Record<string, { schema?: unknown }>;
                            }).content?.["application/json"]?.schema ? (
                              <div className="mt-4">
                                <details className="rounded-2xl border border-line bg-[#fbf7f1]">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
                                    <span>{content.responseSchema}</span>
                                    <span className="text-xs font-normal text-muted">
                                      {content.expandSchema}
                                    </span>
                                  </summary>
                                  <pre className="overflow-x-auto border-t border-line bg-[#221b15] p-4 text-xs leading-6 text-[#f4eadc]">
                                    {renderSchema(
                                      (response as {
                                        content?: Record<string, { schema?: unknown }>;
                                      }).content?.["application/json"]?.schema ?? {},
                                      componentSchemas,
                                    )}
                                  </pre>
                                </details>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
