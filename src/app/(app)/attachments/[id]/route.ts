import { readFile } from "node:fs/promises";
import { getAttachment } from "../../../../lib/data/attachments";

function mimeFor(filePath: string): string {
  const p = filePath.toLowerCase();
  if (p.endsWith(".pdf")) return "application/pdf";
  if (p.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attachment = await getAttachment(id);
  if (!attachment) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(attachment.filePath);
    const safeName = attachment.originalName.replace(/["\r\n]/g, "_");
    return new Response(bytes, {
      headers: {
        "Content-Type": mimeFor(attachment.filePath),
        "Content-Disposition": `inline; filename="${safeName}"`,
      },
    });
  } catch {
    return new Response("File missing", { status: 404 });
  }
}
