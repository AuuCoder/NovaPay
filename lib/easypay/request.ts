import { AppError } from "@/lib/errors";
import {
  getCredentialTypeMapping,
  loadEasyPayCredentialByPid,
  revealEasyPayKey,
} from "@/lib/easypay/credentials";
import { resolveChannelCode } from "@/lib/easypay/mapping";
import { verifyEasyPaySign, type EasyPayParams } from "@/lib/easypay/sign";
import { assertMerchantRequestIpAllowed } from "@/lib/merchants/security";
import { getRequestClientIp } from "@/lib/request-ip";
import { isDevLikeEnv } from "@/lib/env";

/**
 * 解析一个易支付请求的参数。同时支持:
 *  - GET:全部来自 query string
 *  - POST:application/x-www-form-urlencoded 或 multipart/form-data 表单体
 *
 * query 与 body 同名时以 body 优先(POST 语义)。返回扁平字符串字典。
 */
export async function parseEasyPayRequest(request: Request): Promise<Record<string, string>> {
  const params: Record<string, string> = {};

  const url = new URL(request.url);
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    try {
      if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ) {
        const formData = await request.formData();
        for (const [key, value] of formData.entries()) {
          if (typeof value === "string") {
            params[key] = value;
          }
        }
      } else if (contentType.includes("application/json")) {
        const body = (await request.json()) as Record<string, unknown>;
        for (const [key, value] of Object.entries(body)) {
          if (value !== null && value !== undefined) {
            params[key] = String(value);
          }
        }
      } else {
        // 兜底:按 urlencoded 文本解析
        const text = await request.text();
        if (text) {
          for (const [key, value] of new URLSearchParams(text).entries()) {
            params[key] = value;
          }
        }
      }
    } catch {
      // 解析失败时保留 query 参数,交由后续验签拒绝
    }
  }

  return params;
}

export interface EasyPayVerifiedRequest {
  params: Record<string, string>;
  pid: string;
  key: string;
  credential: { id: string; pid: string; enabled: boolean };
  merchant: { id: string; code: string; status: string; callbackEnabled: boolean };
}

type LoadedEasyPayCredential = NonNullable<
  Awaited<ReturnType<typeof loadEasyPayCredentialByPid>>
>;

/**
 * 请求时效校验(缓解重放)。非开发/测试环境默认强制 timestamp;
 * 只有显式设置 EASYPAY_REQUIRE_TIMESTAMP=0 才会兼容无时间戳的旧客户端。
 * 任何已提供的 timestamp 都必须合法且在时间窗口内。
 */
export function assertEasyPayRequestFreshness(params: Record<string, string>) {
  const configuredRequirement = process.env.EASYPAY_REQUIRE_TIMESTAMP?.trim() ?? "";
  let requireTimestamp = !isDevLikeEnv();

  if (/^(1|true|yes)$/i.test(configuredRequirement)) {
    requireTimestamp = true;
  } else if (/^(0|false|no)$/i.test(configuredRequirement)) {
    requireTimestamp = false;
  } else if (configuredRequirement) {
    throw new AppError(
      "EASYPAY_TIMESTAMP_CONFIG_INVALID",
      "EASYPAY_REQUIRE_TIMESTAMP 必须为 1/0、true/false 或 yes/no。",
      500,
    );
  }

  const rawTs = (params.timestamp ?? params.time ?? "").trim();

  if (!rawTs) {
    if (requireTimestamp) {
      throw new AppError("EASYPAY_TIMESTAMP_REQUIRED", "缺少 timestamp 参数。", 401);
    }
    return;
  }

  const maxAgeSeconds = Number(process.env.EASYPAY_TIMESTAMP_MAX_AGE_SECONDS?.trim() || "300");
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new AppError(
      "EASYPAY_TIMESTAMP_CONFIG_INVALID",
      "EASYPAY_TIMESTAMP_MAX_AGE_SECONDS 必须为有限正数。",
      500,
    );
  }
  const numeric = Number(rawTs);
  const tsMs = Number.isFinite(numeric)
    ? numeric > 10_000_000_000
      ? numeric
      : numeric * 1000
    : Date.parse(rawTs);

  if (!Number.isFinite(tsMs)) {
    throw new AppError("EASYPAY_TIMESTAMP_INVALID", "timestamp 参数无效。", 401);
  }

  if (Math.abs(Date.now() - tsMs) > maxAgeSeconds * 1000) {
    throw new AppError("EASYPAY_TIMESTAMP_EXPIRED", "请求时间戳超出允许范围。", 401);
  }
}

/**
 * 内部:取 pid → 查凭证 → enabled → IP 白名单 → 验签。返回原始凭证(含 typeMapping)与 KEY。
 */
async function loadAndVerify(input: {
  request: Request;
  params: Record<string, string>;
}): Promise<{ credential: LoadedEasyPayCredential; key: string }> {
  const { params } = input;
  const pid = (params.pid ?? "").trim();

  if (!pid) {
    throw new AppError("EASYPAY_PID_REQUIRED", "缺少 pid 参数。", 400);
  }

  const credential = await loadEasyPayCredentialByPid(pid);

  if (!credential) {
    throw new AppError("EASYPAY_CREDENTIAL_NOT_FOUND", `未知的商户 pid: ${pid}。`, 404);
  }

  if (!credential.enabled) {
    throw new AppError("EASYPAY_CREDENTIAL_DISABLED", `商户 pid ${pid} 已停用。`, 403);
  }

  assertMerchantRequestIpAllowed({
    merchantCode: credential.merchant.code,
    clientIp: getRequestClientIp(input.request),
    apiIpWhitelist: credential.merchant.apiIpWhitelist,
  });

  assertEasyPayRequestFreshness(params);

  const key = revealEasyPayKey(credential);

  if (!key) {
    throw new AppError("EASYPAY_KEY_UNAVAILABLE", "商户密钥不可用。", 500);
  }

  if (!verifyEasyPaySign(params as EasyPayParams, key)) {
    throw new AppError("EASYPAY_INVALID_SIGN", "签名校验失败。", 401);
  }

  return { credential, key };
}

function toVerifiedRequest(
  params: Record<string, string>,
  credential: LoadedEasyPayCredential,
  key: string,
): EasyPayVerifiedRequest {
  return {
    params,
    pid: credential.pid,
    key,
    credential: {
      id: credential.id,
      pid: credential.pid,
      enabled: credential.enabled,
    },
    merchant: {
      id: credential.merchant.id,
      code: credential.merchant.code,
      status: credential.merchant.status,
      callbackEnabled: credential.merchant.callbackEnabled,
    },
  };
}

/**
 * 仅校验 pid + 签名(不解析 type → channelCode)。
 * 用于 api.php 的查询/退款,这些请求不一定带 type。
 */
export async function verifyEasyPayRequest(input: {
  request: Request;
  params: Record<string, string>;
}): Promise<EasyPayVerifiedRequest> {
  const { credential, key } = await loadAndVerify(input);
  return toVerifiedRequest(input.params, credential, key);
}

export interface EasyPayAuthResult {
  params: Record<string, string>;
  pid: string;
  type: string;
  channelCode: string;
  key: string;
  credential: {
    id: string;
    pid: string;
    enabled: boolean;
  };
  merchant: {
    id: string;
    code: string;
    status: string;
    callbackEnabled: boolean;
  };
}

/**
 * 鉴权一个易支付下单/查询请求:
 *  1. 取 pid → 查凭证(未知 pid 拒绝)
 *  2. 凭证停用 → 拒绝(仅入站;出站 notify 不走这里)
 *  3. IP 白名单(复用商户配置)
 *  4. 验签(MD5 + KEY)
 *  5. type → channelCode(未映射拒绝)
 */
export async function authenticateEasyPayRequest(input: {
  request: Request;
  params: Record<string, string>;
}): Promise<EasyPayAuthResult> {
  const { params } = input;
  const { credential, key } = await loadAndVerify(input);

  const type = (params.type ?? "").trim();
  const channelCode = resolveChannelCode(getCredentialTypeMapping(credential), type);

  if (!channelCode) {
    throw new AppError(
      "EASYPAY_UNSUPPORTED_TYPE",
      `不支持的支付类型: ${type || "(空)"}。`,
      400,
    );
  }

  return {
    ...toVerifiedRequest(params, credential, key),
    type,
    channelCode,
  };
}
