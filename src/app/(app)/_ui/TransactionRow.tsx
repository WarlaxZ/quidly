"use client";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteTransactionAction } from "../transactions/actions";
import { ConfirmSubmit } from "./ConfirmSubmit";

export function TransactionRow({
  id,
  date,
  showProperty,
  propertyName,
  categoryName,
  vendorId,
  vendorName,
  description,
  amountLabel,
}: {
  id: string;
  date: string;
  showProperty: boolean;
  propertyName: string;
  categoryName: string;
  vendorId: string | null;
  vendorName: string;
  description: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <tr className="cursor-pointer" onClick={() => router.push(`/transactions/${id}/edit`)}>
      <td className="text-muted">{date}</td>
      {showProperty && <td className="text-muted">{propertyName}</td>}
      <td className="font-medium text-ink">{categoryName}</td>
      <td className="text-muted">
        {vendorId ? (
          <a
            href={`/vendors/${vendorId}/edit`}
            className="text-forest hover:underline"
            onClick={stop}
          >
            {vendorName}
          </a>
        ) : (
          ""
        )}
      </td>
      <td className="text-muted">{description}</td>
      <td className="money text-right">{amountLabel}</td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-3" onClick={stop}>
          <a
            href={`/transactions/${id}/edit`}
            className="text-sm font-medium text-forest hover:underline"
          >
            Edit
          </a>
          <form action={deleteTransactionAction}>
            <input type="hidden" name="id" value={id} />
            <ConfirmSubmit confirm="Delete this transaction? This can't be undone.">
              Delete
            </ConfirmSubmit>
          </form>
        </div>
      </td>
    </tr>
  );
}
