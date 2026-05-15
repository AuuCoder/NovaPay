import Link from "next/link";

export default async function DeveloperVersionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version } = await params;

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <Link
            href={`/developer/plugins/${slug}`}
            className="text-body-sm"
            style={{ color: "var(--color-positive-deep)", fontWeight: 600 }}
          >
            ← Back to plugin
          </Link>
          <p className="text-eyebrow" style={{ marginTop: 16 }}>Version</p>
          <h1 className="text-display-md" style={{ marginTop: 8 }}>
            {slug} <span style={{ fontWeight: 500, color: "var(--color-mute)" }}>v{version}</span>
          </h1>
        </div>
      </section>

      <section className="content-band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 32 }}>
          <div className="card card-lg">
            <h2 className="text-display-xs">Review &amp; scan findings</h2>
            <p className="text-body-md text-body-color" style={{ marginTop: 12 }}>
              Static scan + reviewer notes for this version. Findings of severity BLOCK
              must be resolved before the version can be approved.
            </p>
            <div className="divider" />
            <p className="text-body-sm text-mute">No findings yet.</p>
          </div>
          <div className="card-feature-sage" style={{ padding: 24 }}>
            <p className="text-eyebrow">Submit</p>
            <p className="text-body-sm" style={{ marginTop: 8 }}>
              Once you&apos;re happy with this version, submit it to the registry admins for review.
            </p>
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 16 }}>
              Submit for review
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
