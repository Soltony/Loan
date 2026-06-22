import { z } from "zod";

// Validation schema for form inputs
export const taxTransferFormSchema = z.object({
  providerId: z.string().min(1, "Please select a provider"),
  transferAmount: z
    .number()
    .positive("Transfer amount must be greater than 0")
    .refine(
      (val) => Number.isFinite(val),
      "Transfer amount must be a valid number"
    ),
  destinationAccountName: z
    .string()
    .min(1, "Destination account name is required")
    .max(100, "Account name must be less than 100 characters"),
  transferReference: z
    .string()
    .min(3, "Reference must be at least 3 characters")
    .max(100, "Reference must be less than 100 characters")
    .regex(/^[A-Z0-9\-_]+$/i, "Reference can only contain letters, numbers, hyphens, and underscores"),
  transferDate: z.string().min(1, "Transfer date is required"),
  notes: z.string().optional(),
});

export type TaxTransferFormData = z.infer<typeof taxTransferFormSchema>;

// API functions
export async function createTaxTransfer(data: TaxTransferFormData) {
  const response = await fetch("/api/tax-transfers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create tax transfer");
  }

  return response.json();
}

export async function getTaxTransfers(
  providerId?: string,
  status?: string,
  page: number = 1,
  limit: number = 10
) {
  const params = new URLSearchParams();
  if (providerId) params.append("providerId", providerId);
  if (status) params.append("status", status);
  params.append("page", page.toString());
  params.append("limit", limit.toString());

  const response = await fetch(`/api/tax-transfers?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch tax transfers");
  }

  return response.json();
}

export async function reverseTaxTransfer(
  transferSimulationId: string,
  reversalReason: string
) {
  const response = await fetch("/api/tax-transfers", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transferSimulationId,
      reversalReason,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to reverse tax transfer");
  }

  return response.json();
}

// Utility functions
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
