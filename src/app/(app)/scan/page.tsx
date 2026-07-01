import { isExtractionEnabled } from "../../../lib/extraction/config";
import { uploadReceiptAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  if (!isExtractionEnabled()) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="reveal" style={{ animationDelay: "0ms" }}>
          <PageHeader title="Scan a receipt" />
        </div>
        <Banner variant="info">
          Set <code>ANTHROPIC_API_KEY</code> in your environment to enable receipt scanning.
        </Banner>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Scan a receipt" subtitle="Upload a receipt or invoice to pre-fill a transaction." />
      </div>

      {error && <Banner variant="error">{error}</Banner>}

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={uploadReceiptAction} className="card p-5 space-y-5">
          <label className="block">
            <span className="label">Receipt or invoice</span>
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,application/pdf"
              required
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface-sunk file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:border-forest"
            />
          </label>
          <p className="text-xs text-faint">
            JPG, PNG, or PDF. Scanning uses your Anthropic API key (~a few pence per receipt) and sends the file to Anthropic for processing.
          </p>
          <button type="submit" className="btn btn-primary">Scan</button>
        </form>
      </section>
    </div>
  );
}
