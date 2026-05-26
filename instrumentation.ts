/**
 * Next.js instrumentation hook (https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
 *
 * Keep this hook dependency-free.
 *
 * In this workspace, importing Prisma / pg-backed modules from instrumentation
 * causes Webpack to trace `pg -> fs` during compilation, which breaks builds.
 * Runtime bootstrap that needs database access must stay lazy and happen inside
 * normal Node request flows instead of this file.
 */

export async function register() {
  return;
}
