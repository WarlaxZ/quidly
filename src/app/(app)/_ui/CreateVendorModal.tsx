"use client";
import { useState, type SubmitEvent } from "react";
import { Modal } from "./Modal";
import { createVendorAction } from "../vendors/actions";

export function CreateVendorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (vendor: { id: string; name: string }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = await createVendorAction({
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        address: String(fd.get("address") ?? ""),
        notes: String(fd.get("notes") ?? ""),
      });
      if (result.ok) {
        onCreated(result.vendor);
        onClose();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New vendor">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <p className="text-sm text-negative">{error}</p> : null}
        <label className="block">
          <span className="label">Name</span>
          <input name="name" placeholder="e.g. Plumber Ltd" required autoFocus className="field" />
        </label>
        <label className="block">
          <span className="label">Email (optional)</span>
          <input name="email" type="email" placeholder="name@example.com" className="field" />
        </label>
        <label className="block">
          <span className="label">Phone (optional)</span>
          <input name="phone" placeholder="07123 456789" className="field" />
        </label>
        <label className="block">
          <span className="label">Address (optional)</span>
          <input name="address" placeholder="1 High St" className="field" />
        </label>
        <label className="block">
          <span className="label">Notes (optional)</span>
          <input name="notes" placeholder="Any notes" className="field" />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Add vendor"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
