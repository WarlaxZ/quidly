import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getPersonalTaxYearSummary } from "../../../../lib/data/personalSummary";
import { latestConfiguredTaxYear } from "../../../../lib/tax/taxYear";
import { formatGBP } from "../../../../lib/tax/money";
import { SA105_BOX_LABELS } from "../../../../lib/tax/sa105Labels";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const taxYear = url.searchParams.get("ty") ?? latestConfiguredTaxYear();
  const { summary } = await getPersonalTaxYearSummary(taxYear);
  const boxes = Object.keys(summary.sa105).sort((a, b) => Number(a) - Number(b));

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const draw = (text: string, x: number, size = 11, f = font) => { page.drawText(text, { x, y, size, font: f, color: rgb(0, 0, 0) }); };

  draw(`SA105 summary — ${taxYear}`, 50, 18, bold); y -= 28;
  draw("All personal properties", 50, 12); y -= 28;
  draw("Box", 50, 11, bold); draw("Description", 110, 11, bold); draw("Amount", 460, 11, bold); y -= 18;
  for (const box of boxes) {
    draw(box, 50); draw(SA105_BOX_LABELS[box] ?? "—", 110); draw(formatGBP(summary.sa105[box]), 460); y -= 18;
  }
  y -= 20;
  draw("Box 44 (finance costs) is a 20% basic-rate tax reducer, not a deduction.", 50, 9);
  y -= 14;
  draw("Estimates only — verify box numbers against the current SA105 notes before filing.", 50, 9);

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sa105-${taxYear}.pdf"`,
    },
  });
}
