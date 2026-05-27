export const OFFICIAL_DEVELOPER_ID = "novapay-official";

export function isOfficialPluginSlug(slug: string) {
  return slug.startsWith("novapay.");
}
