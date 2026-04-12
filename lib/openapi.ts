import { type Locale, pickByLocale } from "@/lib/i18n";

function makeErrorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string" },
            details: {},
          },
        },
      },
    },
  };
}

function translate(locale: Locale, zh: string, en: string) {
  return pickByLocale(locale, { zh, en });
}

function makeMerchantSignatureParameters(locale: Locale) {
  return [
    {
      in: "header",
      name: "x-novapay-key",
      required: true,
      schema: {
        type: "string",
      },
      description: translate(locale, "商户 API 凭证 keyId。", "Merchant API credential keyId."),
    },
    {
      in: "header",
      name: "x-novapay-timestamp",
      required: true,
      schema: {
        type: "string",
      },
      description: translate(
        locale,
        "参与 HMAC 签名的 ISO 时间戳或 Unix 时间戳。",
        "ISO timestamp or unix epoch used in HMAC signing.",
      ),
    },
    {
      in: "header",
      name: "x-novapay-nonce",
      required: true,
      schema: {
        type: "string",
      },
      description: translate(
        locale,
        "单次使用的随机串，用于防重放保护。",
        "Single-use nonce for anti-replay protection.",
      ),
    },
    {
      in: "header",
      name: "x-novapay-signature",
      required: true,
      schema: {
        type: "string",
      },
      description: 'hex(hmac_sha256(secret, "{timestamp}.{nonce}.{rawBody}"))',
    },
  ];
}

function makeIdempotencyParameter(locale: Locale) {
  return {
    in: "header",
    name: "Idempotency-Key",
    required: false,
    schema: {
      type: "string",
    },
    description: translate(
      locale,
      "商户写接口建议传入的幂等键。同一商户、同一业务操作作用域下，重复提交相同请求时将复用首次结果；同 key 对应不同请求体会返回冲突。",
      "Recommended idempotency key for merchant write operations. Repeated requests with the same key and the same business payload reuse the first result, while the same key with a different payload returns a conflict.",
    ),
  };
}

export function getOpenApiSpec(locale: Locale = "zh") {
  const t = (zh: string, en: string) => translate(locale, zh, en);

  return {
    openapi: "3.1.0",
    info: {
      title: "NovaPay API",
      version: "0.1.0",
      description:
        t(
          "NovaPay 支付网关 API，覆盖商户下单、商户自有通道实例、支付回调和后台配置接口。",
          "NovaPay payment gateway API, including merchant order creation, merchant-managed channel instances, payment callbacks, and admin configuration endpoints.",
        ),
    },
    servers: [
      {
        url: process.env.NOVAPAY_PUBLIC_BASE_URL ?? "http://localhost:3000",
        description: t("当前 NovaPay 环境", "Current NovaPay environment"),
      },
    ],
    tags: [
      { name: "Health", description: t("服务健康检查与通道发现", "Service health and channel discovery") },
      { name: "Payments", description: t("商户侧支付与退款接口", "Merchant-facing payment order APIs") },
      { name: "Callbacks", description: t("上游支付平台回调接口", "Provider callback endpoints") },
      { name: "Admin", description: t("仅后台管理员可用的配置接口", "Administrator-only configuration APIs") },
    ],
    components: {
      securitySchemes: {
        AdminSessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "novapay_admin_session",
          description: t(
            "NovaPay 后台签发的管理员会话 Cookie",
            "Administrator session cookie issued by the NovaPay admin console",
          ),
        },
      },
      schemas: {
        Merchant: {
          type: "object",
          properties: {
            id: { type: "string" },
            code: { type: "string" },
            name: { type: "string" },
            status: {
              type: "string",
              enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
            },
            legalName: { type: ["string", "null"] },
            contactName: { type: ["string", "null"] },
            contactEmail: { type: ["string", "null"] },
            contactPhone: { type: ["string", "null"] },
            website: { type: ["string", "null"], format: "uri" },
            companyRegistrationId: { type: ["string", "null"] },
            onboardingNote: { type: ["string", "null"] },
            reviewNote: { type: ["string", "null"] },
            approvedAt: { type: ["string", "null"], format: "date-time" },
            approvedBy: { type: ["string", "null"] },
            statusChangedAt: { type: ["string", "null"], format: "date-time" },
            callbackBase: {
              type: ["string", "null"],
              format: "uri",
              description:
                t(
                  "订单未单独传 callbackUrl 时，NovaPay 使用的默认商户业务回调地址。",
                  "Default merchant business callback URL used by NovaPay when order-level callbackUrl is omitted.",
                ),
            },
            notifySecret: { type: ["string", "null"] },
            apiIpWhitelist: { type: ["string", "null"] },
            callbackEnabled: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        MerchantChannelAccount: {
          type: "object",
          properties: {
            id: { type: "string" },
            merchantId: { type: "string" },
            providerKey: { type: "string" },
            channelCode: { type: "string" },
            displayName: { type: "string" },
            config: {
              type: "object",
              additionalProperties: true,
            },
            callbackToken: { type: "string" },
            enabled: { type: "boolean" },
            remark: { type: ["string", "null"] },
            lastVerifiedAt: { type: ["string", "null"], format: "date-time" },
            lastErrorMessage: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        MerchantChannelBinding: {
          type: "object",
          properties: {
            id: { type: "string" },
            merchantCode: { type: "string" },
            channelCode: { type: "string" },
            enabled: { type: "boolean" },
            merchantChannelAccountId: { type: ["string", "null"] },
            minAmount: { type: ["string", "null"] },
            maxAmount: { type: ["string", "null"] },
            feeRate: { type: ["string", "null"] },
          },
        },
        CreateOrderRequest: {
          type: "object",
          required: ["merchantCode", "channelCode", "externalOrderId", "amount", "subject"],
          properties: {
            merchantCode: { type: "string" },
            channelCode: {
              type: "string",
              enum: ["alipay.page", "wxpay.native"],
            },
            externalOrderId: { type: "string" },
            amount: { oneOf: [{ type: "string" }, { type: "number" }] },
            currency: { type: "string", enum: ["CNY"] },
            subject: { type: "string" },
            description: { type: ["string", "null"] },
            returnUrl: {
              type: ["string", "null"],
              format: "uri",
              description:
                t(
                  "支付完成后的可选浏览器返回地址；不传时，NovaPay 使用托管结果页。",
                  "Optional browser return URL after payment completion. If omitted, NovaPay uses its hosted result page.",
                ),
            },
            callbackUrl: {
              type: ["string", "null"],
              format: "uri",
              description:
                t(
                  "当前订单的可选商户业务回调地址；不传时，NovaPay 使用商户默认 callbackBase。",
                  "Optional merchant business callback URL for this order. If omitted, NovaPay uses the merchant default callbackBase.",
                ),
            },
            metadata: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
        QueryOrderRequest: {
          type: "object",
          required: ["merchantCode"],
          properties: {
            merchantCode: { type: "string" },
            orderReference: { type: ["string", "null"] },
            orderId: { type: ["string", "null"] },
            externalOrderId: { type: ["string", "null"] },
            sync: { type: "boolean" },
          },
        },
        CloseOrderRequest: {
          type: "object",
          required: ["merchantCode"],
          properties: {
            merchantCode: { type: "string" },
            orderReference: { type: ["string", "null"] },
            orderId: { type: ["string", "null"] },
            externalOrderId: { type: ["string", "null"] },
          },
        },
        QueryOrderByPathRequest: {
          type: "object",
          required: ["merchantCode"],
          properties: {
            merchantCode: { type: "string" },
            sync: { type: "boolean" },
          },
        },
        CloseOrderByPathRequest: {
          type: "object",
          required: ["merchantCode"],
          properties: {
            merchantCode: { type: "string" },
          },
        },
        PaymentOrderResponse: {
          type: "object",
          properties: {
            created: { type: "boolean" },
            order: {
              type: "object",
              properties: {
                id: { type: "string" },
                merchantCode: { type: "string" },
                externalOrderId: { type: "string" },
                channelCode: { type: "string" },
                amount: { type: "string" },
                feeRate: { type: "string" },
                feeAmount: { type: "string" },
                netAmount: { type: "string" },
                currency: { type: "string" },
                subject: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
                status: { type: "string" },
                providerStatus: { type: ["string", "null"] },
                gatewayOrderId: { type: ["string", "null"] },
                checkoutUrl: { type: ["string", "null"] },
                hostedCheckoutUrl: { type: ["string", "null"], format: "uri" },
                paymentMode: {
                  type: ["string", "null"],
                  enum: ["redirect", "qr_code", null],
                },
                callbackStatus: { type: "string" },
                merchantChannelAccountId: { type: ["string", "null"] },
                channelAccountSource: {
                  type: ["string", "null"],
                  enum: ["merchant", null],
                },
                providerPayload: {
                  type: ["object", "null"],
                  additionalProperties: true,
                },
                createdAt: { type: ["string", "null"], format: "date-time" },
                updatedAt: { type: ["string", "null"], format: "date-time" },
                expireAt: { type: ["string", "null"], format: "date-time" },
                paidAt: { type: ["string", "null"], format: "date-time" },
                completedAt: { type: ["string", "null"], format: "date-time" },
                refundSummary: {
                  type: ["object", "null"],
                  properties: {
                    totalRequestedAmount: { type: "string" },
                    totalRefundedAmount: { type: "string" },
                    refundableAmount: { type: "string" },
                  },
                },
              },
            },
          },
        },
        CreateRefundRequest: {
          type: "object",
          required: ["merchantCode", "externalRefundId", "amount"],
          properties: {
            merchantCode: { type: "string" },
            orderReference: { type: ["string", "null"] },
            orderId: { type: ["string", "null"] },
            externalOrderId: { type: ["string", "null"] },
            externalRefundId: { type: "string" },
            amount: { oneOf: [{ type: "string" }, { type: "number" }] },
            reason: { type: ["string", "null"] },
            metadata: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
        QueryRefundRequest: {
          type: "object",
          required: ["merchantCode"],
          properties: {
            merchantCode: { type: "string" },
            refundReference: { type: ["string", "null"] },
            refundId: { type: ["string", "null"] },
            externalRefundId: { type: ["string", "null"] },
            sync: { type: "boolean" },
          },
        },
        CreateRefundForOrderRequest: {
          type: "object",
          required: ["merchantCode", "externalRefundId", "amount"],
          properties: {
            merchantCode: { type: "string" },
            externalRefundId: { type: "string" },
            amount: { oneOf: [{ type: "string" }, { type: "number" }] },
            reason: { type: ["string", "null"] },
            metadata: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
        QueryRefundByPathRequest: {
          type: "object",
          required: ["merchantCode"],
          properties: {
            merchantCode: { type: "string" },
            sync: { type: "boolean" },
          },
        },
        PaymentRefundResponse: {
          type: "object",
          properties: {
            created: { type: "boolean" },
            refund: {
              type: "object",
              properties: {
                id: { type: "string" },
                merchantCode: { type: "string" },
                paymentOrderId: { type: "string" },
                externalOrderId: { type: "string" },
                channelCode: { type: "string" },
                externalRefundId: { type: "string" },
                amount: { type: "string" },
                feeAmount: { type: "string" },
                netAmountImpact: { type: "string" },
                currency: { type: "string" },
                status: { type: "string" },
                providerStatus: { type: ["string", "null"] },
                providerRefundId: { type: ["string", "null"] },
                gatewayOrderId: { type: ["string", "null"] },
                merchantChannelAccountId: { type: ["string", "null"] },
                channelAccountSource: {
                  type: ["string", "null"],
                  enum: ["merchant", null],
                },
                reason: { type: ["string", "null"] },
                failureCode: { type: ["string", "null"] },
                failureMessage: { type: ["string", "null"] },
                metadata: {
                  type: ["object", "null"],
                  additionalProperties: true,
                },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
                refundedAt: { type: ["string", "null"], format: "date-time" },
              },
            },
          },
        },
        SystemConfigItem: {
          type: "object",
          properties: {
            key: { type: "string" },
            value: { type: "string" },
            group: { type: "string" },
            label: { type: ["string", "null"] },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    paths: {
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: t("健康检查", "Health check"),
          responses: {
            200: {
              description: t("服务与数据库状态", "Service and database status"),
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      database: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/channels": {
        get: {
          tags: ["Health"],
          summary: t("列出支付通道", "List payment channels"),
          responses: {
            200: {
              description: t("可用支付通道列表", "Available payment channels"),
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      channels: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            code: { type: "string" },
                            provider: { type: "string" },
                            displayName: { type: "string" },
                            description: { type: "string" },
                            configured: { type: "boolean" },
                            implementationStatus: { type: "string" },
                            capabilities: {
                              type: "array",
                              items: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/payment-orders": {
        post: {
          tags: ["Payments"],
          summary: t("创建支付订单", "Create payment order"),
          description:
            t(
              "REST 风格的商户下单接口。请求必须使用商户 API 凭证签名，并携带 x-novapay-key、x-novapay-timestamp、x-novapay-nonce、x-novapay-signature；写接口建议同时传入 Idempotency-Key 以保障安全重试。NovaPay 只会使用商户自有通道实例，并自动分配上游支付回调地址；如需商户业务通知请使用 callbackUrl；returnUrl 省略时将回到 NovaPay 托管结果页；正式使用官方通道前还需要补齐商户资料。",
              "REST-style merchant order creation endpoint. Requests must be signed with merchant API credentials: x-novapay-key + x-novapay-timestamp + x-novapay-nonce + x-novapay-signature. Idempotency-Key is recommended for safe retries. NovaPay will only use merchant-owned channel instances, will assign the upstream payment callback URL automatically, supports callbackUrl for merchant business notifications, uses a hosted result page when returnUrl is omitted, and requires the merchant profile to be complete before production orders are accepted.",
            ),
          parameters: [...makeMerchantSignatureParameters(locale), makeIdempotencyParameter(locale)],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateOrderRequest" },
                examples: {
                  alipay: {
                    value: {
                      merchantCode: "merchant-prod-cn-001",
                      channelCode: "alipay.page",
                      externalOrderId: "ORDER-20260410-001",
                      amount: "88.00",
                      subject: t("NovaPay 正式支付订单", "NovaPay Production Order"),
                      description: t("支付宝网页支付", "Alipay page payment"),
                    },
                  },
                  wxpay: {
                    value: {
                      merchantCode: "merchant-prod-cn-001",
                      channelCode: "wxpay.native",
                      externalOrderId: "ORDER-20260410-002",
                      amount: "18.80",
                      subject: t("NovaPay 微信 Native 订单", "NovaPay WeChat Native Order"),
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t("订单已创建或命中幂等复用", "Payment order created or reused"),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentOrderResponse" },
                },
              },
            },
            400: makeErrorResponse(t("请求体不合法", "Invalid request body")),
            401: makeErrorResponse(t("商户签名校验失败", "Merchant signature verification failed")),
            403: makeErrorResponse(
              t(
                "商户未通过审核或未完成该通道所需资料，无法创建订单",
                "Merchant is not approved or profile-complete for order creation",
              ),
            ),
            404: makeErrorResponse(t("商户或通道不存在", "Merchant or channel not found")),
            409: makeErrorResponse(
              t("幂等键冲突，或相同幂等键请求仍在处理中", "Idempotency key conflicts or is still processing"),
            ),
            422: makeErrorResponse(t("通道尚未完成配置", "Channel not configured")),
            500: makeErrorResponse(t("上游通道或服务端发生异常", "Unexpected provider or server failure")),
          },
        },
      },
      "/api/payment-orders/{orderReference}": {
        post: {
          tags: ["Payments"],
          summary: t("查询支付订单", "Query payment order"),
          description:
            t(
              "按资源路径查询当前支付订单状态，并默认同步最新的上游支付状态到 NovaPay。为了保持商户签名口径统一，这里仍使用 POST + JSON body。",
              "Queries the current payment order state by resource path and, by default, synchronizes the latest provider status back into NovaPay. POST + JSON body is kept here to preserve the merchant signing model.",
            ),
          parameters: [
            {
              in: "path",
              name: "orderReference",
              required: true,
              schema: { type: "string" },
              description: t(
                "订单引用，可传平台订单号或商户订单号。",
                "Order reference, either NovaPay order id or merchant external order id.",
              ),
            },
            ...makeMerchantSignatureParameters(locale),
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QueryOrderByPathRequest" },
                examples: {
                  queryOrder: {
                    value: {
                      merchantCode: "merchant-prod-cn-001",
                      sync: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t("最新订单状态", "Latest order state"),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentOrderResponse" },
                },
              },
            },
            400: makeErrorResponse(t("请求体不合法", "Invalid request body")),
            401: makeErrorResponse(t("商户签名校验失败", "Merchant signature verification failed")),
            404: makeErrorResponse(t("商户或订单不存在", "Merchant or order not found")),
            500: makeErrorResponse(t("上游通道或服务端发生异常", "Unexpected provider or server failure")),
          },
        },
      },
      "/api/payment-orders/{orderReference}/close": {
        post: {
          tags: ["Payments"],
          summary: t("关闭未支付订单", "Close unpaid order"),
          description:
            t(
              "按资源路径关闭一笔未支付订单，并同步更新 NovaPay 本地订单状态。为了保持商户签名口径统一，这里仍使用 POST + JSON body；写接口建议同时传入 Idempotency-Key 以保障安全重试。",
              "Closes an unpaid order by resource path and updates the local NovaPay order state. POST + JSON body is kept here to preserve the merchant signing model. Idempotency-Key is recommended for safe retries.",
            ),
          parameters: [
            {
              in: "path",
              name: "orderReference",
              required: true,
              schema: { type: "string" },
              description: t(
                "订单引用，可传平台订单号或商户订单号。",
                "Order reference, either NovaPay order id or merchant external order id.",
              ),
            },
            ...makeMerchantSignatureParameters(locale),
            makeIdempotencyParameter(locale),
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CloseOrderByPathRequest" },
                examples: {
                  closeOrder: {
                    value: {
                      merchantCode: "merchant-prod-cn-001",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t("关闭后的订单状态", "Closed order state"),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentOrderResponse" },
                },
              },
            },
            400: makeErrorResponse(t("请求体不合法", "Invalid request body")),
            401: makeErrorResponse(t("商户签名校验失败", "Merchant signature verification failed")),
            404: makeErrorResponse(t("商户或订单不存在", "Merchant or order not found")),
            409: makeErrorResponse(t("订单已支付成功、当前不可关闭，或幂等键冲突/处理中", "Order is already paid, cannot be closed, or idempotency conflicts/is processing")),
            422: makeErrorResponse(t("当前通道不支持关闭订单", "Channel does not support close payment")),
            500: makeErrorResponse(t("上游通道或服务端发生异常", "Unexpected provider or server failure")),
          },
        },
      },
      "/api/payment-orders/{orderReference}/refunds": {
        post: {
          tags: ["Payments"],
          summary: t("创建退款", "Create refund"),
          description:
            t(
              "按订单资源路径为已支付订单创建退款。上游退款状态会被持久化保存，后续可继续查询异步退款结果；写接口建议同时传入 Idempotency-Key 以保障安全重试。",
              "Creates a refund for a paid order by order resource path. The provider status is persisted and can be queried later for asynchronous refunds. Idempotency-Key is recommended for safe retries.",
            ),
          parameters: [
            {
              in: "path",
              name: "orderReference",
              required: true,
              schema: { type: "string" },
              description: t(
                "订单引用，可传平台订单号或商户订单号。",
                "Order reference, either NovaPay order id or merchant external order id.",
              ),
            },
            ...makeMerchantSignatureParameters(locale),
            makeIdempotencyParameter(locale),
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateRefundForOrderRequest" },
                examples: {
                  partialRefund: {
                    value: {
                      merchantCode: "merchant-prod-cn-001",
                      externalRefundId: "REFUND-20260410-001",
                      amount: "8.80",
                      reason: t("用户申请退款", "customer requested refund"),
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t("退款已创建或命中幂等复用", "Refund created or reused"),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentRefundResponse" },
                },
              },
            },
            400: makeErrorResponse(t("请求体不合法", "Invalid request body")),
            401: makeErrorResponse(t("商户签名校验失败", "Merchant signature verification failed")),
            404: makeErrorResponse(t("商户或订单不存在", "Merchant or order not found")),
            409: makeErrorResponse(t("订单当前不可退款、退款单号发生冲突，或幂等键冲突/处理中", "Order is not refundable, refund reference conflicts, or idempotency conflicts/is processing")),
            422: makeErrorResponse(t("退款金额超过可退余额，或当前通道不支持退款", "Refund amount exceeds balance or channel does not support refunds")),
            500: makeErrorResponse(t("上游通道或服务端发生异常", "Unexpected provider or server failure")),
          },
        },
      },
      "/api/payment-refunds/{refundReference}": {
        post: {
          tags: ["Payments"],
          summary: t("查询退款", "Query refund"),
          description:
            t(
              "按资源路径查询当前退款状态，并默认同步最新的上游退款状态到 NovaPay。为了保持商户签名口径统一，这里仍使用 POST + JSON body。",
              "Queries the current refund state by resource path and, by default, synchronizes the latest provider status back into NovaPay. POST + JSON body is kept here to preserve the merchant signing model.",
            ),
          parameters: [
            {
              in: "path",
              name: "refundReference",
              required: true,
              schema: { type: "string" },
              description: t(
                "退款引用，可传平台退款号或商户退款单号。",
                "Refund reference, either NovaPay refund id or merchant external refund id.",
              ),
            },
            ...makeMerchantSignatureParameters(locale),
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QueryRefundByPathRequest" },
                examples: {
                  queryRefund: {
                    value: {
                      merchantCode: "merchant-prod-cn-001",
                      sync: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t("最新退款状态", "Latest refund state"),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentRefundResponse" },
                },
              },
            },
            400: makeErrorResponse(t("请求体不合法", "Invalid request body")),
            401: makeErrorResponse(t("商户签名校验失败", "Merchant signature verification failed")),
            404: makeErrorResponse(t("商户或退款不存在", "Merchant or refund not found")),
            500: makeErrorResponse(t("上游通道或服务端发生异常", "Unexpected provider or server failure")),
          },
        },
      },
      "/api/payments/callback/alipay/{accountId}/{token}": {
        post: {
          tags: ["Callbacks"],
          summary: t("支付宝商户实例回调接口", "Alipay merchant-instance callback endpoint"),
          parameters: [
            {
              in: "path",
              name: "accountId",
              required: true,
              schema: { type: "string" },
            },
            {
              in: "path",
              name: "token",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: t(
                "回调处理成功后返回纯文本 success",
                "Returns plain text success on successful callback processing",
              ),
            },
            400: makeErrorResponse(t("支付宝回调参数不合法", "Invalid Alipay callback")),
            404: makeErrorResponse(t("商户通道实例或订单不存在", "Merchant channel account or order not found")),
          },
        },
        get: {
          tags: ["Callbacks"],
          summary: t(
            "支付宝商户实例回调调试接口（Query String）",
            "Alipay merchant-instance callback test via query string",
          ),
          parameters: [
            {
              in: "path",
              name: "accountId",
              required: true,
              schema: { type: "string" },
            },
            {
              in: "path",
              name: "token",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: t(
                "回调处理成功后返回纯文本 success",
                "Returns plain text success on successful callback processing",
              ),
            },
            400: makeErrorResponse(t("支付宝回调参数不合法", "Invalid Alipay callback")),
            404: makeErrorResponse(t("商户通道实例或订单不存在", "Merchant channel account or order not found")),
          },
        },
      },
      "/api/payments/callback/wxpay/{accountId}/{token}": {
        post: {
          tags: ["Callbacks"],
          summary: t("微信支付商户实例回调接口", "WeChat Pay merchant-instance callback endpoint"),
          description:
            t(
              "接收商户自有微信支付通道实例的 API v3 回调，校验响应签名、解密加密资源，并更新对应支付订单状态。",
              "Receives WeChat Pay API v3 notifications for a merchant-owned channel instance, verifies response signatures, decrypts encrypted resources, and updates the payment order.",
            ),
          parameters: [
            {
              in: "path",
              name: "accountId",
              required: true,
              schema: { type: "string" },
            },
            {
              in: "path",
              name: "token",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            204: {
              description: t("回调已受理", "Notification accepted"),
            },
            400: makeErrorResponse(t("微信支付回调参数不合法", "Invalid WeChat Pay callback")),
            404: makeErrorResponse(t("商户通道实例或订单不存在", "Merchant channel account or order not found")),
          },
        },
      },
      "/api/admin/merchants": {
        get: {
          tags: ["Admin"],
          summary: t("获取商户列表", "List merchants"),
          security: [{ AdminSessionCookie: [] }],
          parameters: [
            {
              in: "query",
              name: "code",
              schema: { type: "string" },
              required: false,
            },
          ],
          responses: {
            200: {
              description: t("商户列表", "Merchant list"),
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      merchants: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Merchant" },
                      },
                    },
                  },
                },
              },
            },
            401: makeErrorResponse(t("未授权的后台请求", "Unauthorized admin request")),
          },
        },
        post: {
          tags: ["Admin"],
          summary: t("创建商户", "Create merchant"),
          security: [{ AdminSessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "name"],
                  properties: {
                    code: { type: "string" },
                    name: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
                    },
                    legalName: { type: ["string", "null"] },
                    contactName: { type: ["string", "null"] },
                    contactEmail: { type: ["string", "null"] },
                    contactPhone: { type: ["string", "null"] },
                    website: { type: ["string", "null"], format: "uri" },
                    companyRegistrationId: { type: ["string", "null"] },
                    onboardingNote: { type: ["string", "null"] },
                    reviewNote: { type: ["string", "null"] },
                    callbackBase: { type: ["string", "null"], format: "uri" },
                    notifySecret: { type: ["string", "null"] },
                    apiIpWhitelist: { type: ["string", "null"] },
                    callbackEnabled: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: t("商户已创建", "Merchant created"),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Merchant" },
                },
              },
            },
            400: makeErrorResponse(t("商户请求参数不合法", "Invalid merchant payload")),
            401: makeErrorResponse(t("未授权的后台请求", "Unauthorized admin request")),
          },
        },
      },
      "/api/admin/merchants/{id}": {
        get: {
          tags: ["Admin"],
          summary: t("获取商户详情", "Get merchant detail"),
          security: [{ AdminSessionCookie: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: t("商户详情", "Merchant detail"),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Merchant" },
                },
              },
            },
            404: makeErrorResponse(t("商户不存在", "Merchant not found")),
          },
        },
        put: {
          tags: ["Admin"],
          summary: t("更新商户", "Update merchant"),
          security: [{ AdminSessionCookie: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    name: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
                    },
                    legalName: { type: ["string", "null"] },
                    contactName: { type: ["string", "null"] },
                    contactEmail: { type: ["string", "null"] },
                    contactPhone: { type: ["string", "null"] },
                    website: { type: ["string", "null"], format: "uri" },
                    companyRegistrationId: { type: ["string", "null"] },
                    onboardingNote: { type: ["string", "null"] },
                    reviewNote: { type: ["string", "null"] },
                    callbackBase: { type: ["string", "null"], format: "uri" },
                    notifySecret: { type: ["string", "null"] },
                    apiIpWhitelist: { type: ["string", "null"] },
                    callbackEnabled: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t("商户已更新", "Merchant updated"),
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Merchant" },
                },
              },
            },
            404: makeErrorResponse(t("商户不存在", "Merchant not found")),
          },
        },
      },
      "/api/admin/merchant-channel-bindings": {
        get: {
          tags: ["Admin"],
          summary: t("获取商户通道路由列表", "List merchant-channel bindings"),
          security: [{ AdminSessionCookie: [] }],
          parameters: [
            {
              in: "query",
              name: "merchantCode",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: t("路由绑定列表", "Binding list"),
            },
          },
        },
        post: {
          tags: ["Admin"],
          summary: t("创建或更新商户通道路由", "Create or update merchant-channel binding"),
          security: [{ AdminSessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["merchantCode", "channelCode"],
                  properties: {
                    merchantCode: { type: "string" },
                    channelCode: { type: "string" },
                    enabled: { type: "boolean" },
                    merchantChannelAccountId: { type: ["string", "null"] },
                    minAmount: { oneOf: [{ type: "string" }, { type: "number" }] },
                    maxAmount: { oneOf: [{ type: "string" }, { type: "number" }] },
                    feeRate: { oneOf: [{ type: "string" }, { type: "number" }] },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: t("路由绑定已保存", "Binding saved"),
            },
          },
        },
      },
      "/api/admin/system-config": {
        get: {
          tags: ["Admin"],
          summary: t("获取系统配置", "List system config"),
          security: [{ AdminSessionCookie: [] }],
          responses: {
            200: {
              description: t("系统配置项列表", "System config entries"),
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      configs: {
                        type: "array",
                        items: { $ref: "#/components/schemas/SystemConfigItem" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        put: {
          tags: ["Admin"],
          summary: t("批量更新系统配置", "Bulk update system config"),
          security: [{ AdminSessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["configs"],
                  properties: {
                    configs: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["key", "value"],
                        properties: {
                          key: { type: "string" },
                          value: { type: "string" },
                          group: { type: "string" },
                          label: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t("系统配置已更新", "System config updated"),
            },
          },
        },
      },
      "/api/admin/payment-orders/{id}/retry-callback": {
        post: {
          tags: ["Admin"],
          summary: t("重试商户业务回调", "Retry merchant callback delivery"),
          security: [{ AdminSessionCookie: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: t("重试结果", "Retry result"),
            },
            404: makeErrorResponse(t("支付订单不存在", "Payment order not found")),
          },
        },
      },
    },
  };
}
