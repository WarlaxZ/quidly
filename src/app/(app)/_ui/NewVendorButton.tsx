"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateVendorModal } from "./CreateVendorModal";

export function NewVendorButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        ＋ New vendor
      </button>
      <CreateVendorModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
