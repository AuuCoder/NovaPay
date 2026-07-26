import { createHash, randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getOptionalUrl } from "@/lib/payments/utils";

const QR_LOCAL_PREFIX = "/uploads/ctf-qr/";
const QR_S3_PREFIX = "merchant-qr/";
const MAX_MERCHANT_QR_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MERCHANT_QR_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

type MerchantQrStorageDriver = "local" | "s3";

function inferDriver(): MerchantQrStorageDriver {
  const explicit = process.env.NOVAPAY_QR_STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit === "local" || explicit === "s3") {
    return explicit;
  }
  return "local";
}

function getS3Config() {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const endpoint = getOptionalUrl(process.env.S3_ENDPOINT_URL?.trim());
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE?.trim() === "true";

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY 未配置完整。");
  }

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: endpoint || undefined,
    forcePathStyle,
  };
}

function extFromFile(file: File) {
  const extFromType =
    file.type === "image/png"
      ? ".png"
      : file.type === "image/jpeg"
        ? ".jpg"
        : file.type === "image/webp"
          ? ".webp"
          : file.type === "image/gif"
            ? ".gif"
            : path.extname(file.name || "").toLowerCase() || ".png";
  return extFromType;
}

function assertSupportedMerchantQrImage(file: File) {
  if (!ALLOWED_MERCHANT_QR_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error("收款码图片仅支持 PNG / JPG / WEBP / GIF。");
  }

  if (file.size <= 0) {
    throw new Error("收款码图片不能为空文件。");
  }

  if (file.size > MAX_MERCHANT_QR_IMAGE_BYTES) {
    throw new Error("收款码图片大小不能超过 2MB。");
  }
}

function safeMerchantId(merchantId: string) {
  return merchantId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildMerchantQrProxyPath(objectKey: string) {
  const normalized = objectKey.replace(/^\/+/, "");
  return `/api/merchant-qr/${normalized}`;
}

export function isManagedMerchantQrImagePath(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(QR_LOCAL_PREFIX);
}

export function isManagedMerchantQrObjectKey(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(QR_S3_PREFIX);
}

async function getS3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const config = getS3Config();
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function storeMerchantQrImage(input: {
  merchantId: string;
  file: File;
}) {
  assertSupportedMerchantQrImage(input.file);
  const driver = inferDriver();
  const extension = extFromFile(input.file);
  const merchantId = safeMerchantId(input.merchantId);
  const buffer = Buffer.from(await input.file.arrayBuffer());

  if (driver === "local") {
    const fileName = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${extension}`;
    const relativeDir = path.posix.join("uploads", "ctf-qr", merchantId);
    const absoluteDir = path.join(process.cwd(), "public", relativeDir);
    await mkdir(absoluteDir, { recursive: true });
    const absoluteFilePath = path.join(absoluteDir, fileName);
    await writeFile(absoluteFilePath, buffer);
    return {
      driver,
      objectKey: null,
      publicUrl: `/${path.posix.join(relativeDir, fileName)}`,
    };
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const fileName = `qr_${Date.now()}_${sha256}${extension}`;
  const objectKey = `${QR_S3_PREFIX}${merchantId}/${fileName}`;
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const config = getS3Config();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: input.file.type || "image/png",
        Metadata: {
          merchantId,
          uploadedAt: new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    throw new Error(
      `二维码图片上传到对象存储失败。请检查 NOVAPAY_QR_STORAGE_DRIVER / S3_ENDPOINT_URL / S3_BUCKET / S3_ACCESS_KEY_ID 配置，原始错误：${
        error instanceof Error ? error.message || error.name : String(error)
      }`,
    );
  }

  return {
    driver,
    objectKey,
    publicUrl: buildMerchantQrProxyPath(objectKey),
  };
}

export async function removeMerchantQrImage(input: {
  qrImageUrl?: string | null;
  qrImageObjectKey?: string | null;
}) {
  if (isManagedMerchantQrObjectKey(input.qrImageObjectKey)) {
    const objectKey = input.qrImageObjectKey!;
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    const config = getS3Config();
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
        }),
      );
    } catch {
      // 删除失败时静默降级，不阻塞主流程。
    }
    return;
  }

  if (!isManagedMerchantQrImagePath(input.qrImageUrl)) {
    return;
  }

  const normalized = input.qrImageUrl!.replace(/^\/+/, "");
  const absoluteFilePath = path.join(process.cwd(), "public", normalized);
  try {
    await rm(absoluteFilePath, { force: true });
  } catch {
    // 删除失败时静默降级，不阻塞主流程。
  }
}

export async function readMerchantQrImageObject(objectKey: string) {
  if (!isManagedMerchantQrObjectKey(objectKey)) {
    return null;
  }

  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const config = getS3Config();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    }),
  );

  if (!result.Body) {
    return null;
  }

  const body = Buffer.from(await result.Body.transformToByteArray());
  return {
    body,
    contentType: result.ContentType || "application/octet-stream",
    contentLength: body.length,
  };
}

export function getMerchantQrStorageDriver() {
  return inferDriver();
}
