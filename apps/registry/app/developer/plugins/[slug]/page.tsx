export default async function DeveloperPluginDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div>
      <h1>Plugin: {slug}</h1>
      <p>View versions, review status, pricing, and sales data.</p>
    </div>
  );
}
