/**
 * Admin plugin detail page (phase 1 placeholder).
 * Shows plugin metadata and provides take-down action.
 */
export default async function AdminPluginDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div>
      <h1>Plugin: {slug}</h1>
      <p>Phase 1 placeholder — will show plugin details and take-down controls once the database is wired.</p>
    </div>
  );
}
