import { isExtractionEnabled } from "../../../lib/extraction/config";
import { uploadReceiptAction } from "./actions";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!isExtractionEnabled()) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold">Scan a receipt</h1>
        <p className="rounded bg-yellow-100 px-3 py-2 text-yellow-800">
          Set <code>ANTHROPIC_API_KEY</code> in your environment to enable receipt scanning.
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Scan a receipt</h1>
      <p className="text-sm text-gray-600">Upload a receipt or invoice (JPG, PNG, or PDF). It will be read and used to pre-fill a transaction for you to review.</p>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}
      <form action={uploadReceiptAction} className="space-y-3">
        <input type="file" name="file" accept="image/jpeg,image/png,application/pdf" required className="block" />
        <button type="submit" className="bg-blue-600 px-3 py-2 text-white">Scan</button>
      </form>
      <p className="text-xs text-gray-400">Scanning uses your Anthropic API key (~a few pence per receipt) and sends the file to Anthropic for processing.</p>
    </div>
  );
}
