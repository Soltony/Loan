import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireServerPermission } from "@/lib/require-permission";
import { TaxTransferPage } from "@/components/admin/tax-transfers/page";

export const metadata = {
  title: "Tax Transfer Simulation",
  description: "Simulate and manage manual inclusive tax transfers",
};

export default async function TaxTransfersPage() {
  // Check permissions
  await requireServerPermission("tax-transfers");

  // Fetch providers
  const providers = await prisma.loanProvider.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      displayOrder: "asc",
    },
  });

  if (providers.length === 0) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-800">No active loan providers found</p>
      </div>
    );
  }

  // Get default provider or first one
  const defaultProviderId = providers[0].id;

  // Fetch tax holding balance for default provider
  const taxHoldingAccount = await prisma.ledgerAccount.findFirst({
    where: {
      providerId: defaultProviderId,
      category: "Tax", // Tax holding account
    },
  });

  const currentBalance = taxHoldingAccount?.balance || 0;

  return (
    <div className="space-y-6">
      <TaxTransferPage
        providers={providers}
        availableBalance={currentBalance}
        currentBalanceBefore={currentBalance}
      />
    </div>
  );
}
