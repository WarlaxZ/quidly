import { beforeEach, describe, expect, it } from "vitest";
import { createAttachment, getAttachment } from "./attachments";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("attachments data layer", () => {
  it("creates and fetches an attachment with extracted data", async () => {
    const a = await createAttachment({ filePath: "/tmp/r.jpg", originalName: "r.jpg", extractedData: '{"vendorName":"X"}' });
    const got = await getAttachment(a.id);
    expect(got?.originalName).toBe("r.jpg");
    expect(got?.extractedData).toBe('{"vendorName":"X"}');
    expect(await getAttachment("nope")).toBeNull();
  });
});
