export default async function DeveloperVersionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version } = await params;
  return (
    <div>
      <h1>Plugin: {slug} — Version {version}</h1>
      <p>Review state, scan findings, and approval notes.</p>
    </div>
  );
}
