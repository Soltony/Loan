"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getTaxTransfers } from "@/lib/tax-transfer-utils";
import { TaxTransferForm } from "@/components/admin/tax-transfers/form";
import { TaxTransferHistory } from "@/components/admin/tax-transfers/history";
import { BalanceSummary } from "@/components/admin/tax-transfers/balance-summary";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TaxTransferPageProps {
  providers: Array<{ id: string; name: string }>;
  availableBalance: number;
  currentBalanceBefore: number;
}

export function TaxTransferPage({
  providers,
  availableBalance,
  currentBalanceBefore,
}: TaxTransferPageProps) {
  const searchParams = useSearchParams();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState(
    searchParams?.get("provider") || providers[0]?.id || ""
  );
  const [currentBalance, setCurrentBalance] = useState(availableBalance);
  const [activeTab, setActiveTab] = useState("transfer");
  const { toast } = useToast();

  async function loadTransfers() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getTaxTransfers(selectedProviderId);
      setTransfers(data.data || []);
      
      // Calculate current balance
      let balance = currentBalanceBefore;
      data.data?.forEach((transfer: any) => {
        if (transfer.status === "SIMULATED") {
          balance -= transfer.transferAmount;
        } else if (transfer.status === "REVERSED") {
          balance += transfer.transferAmount;
        }
      });
      setCurrentBalance(balance);
    } catch (err: any) {
      const errorMessage = err.message || "Failed to load transfers";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTransfers();
  }, [selectedProviderId]);

  const simulatedTransfers = transfers.filter((t) => t.status === "SIMULATED");
  const totalTransferred = simulatedTransfers.reduce(
    (sum, t) => sum + t.transferAmount,
    0
  );
  const totalReversed = transfers
    .filter((t) => t.status === "REVERSED")
    .reduce((sum, t) => sum + t.transferAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tax Transfer Simulation</h1>
        <p className="text-gray-600 mt-1">
          Manage and track manual inclusive tax transfers to real accounts
        </p>
      </div>

      {/* Alert */}
      <Alert className="border-blue-200 bg-blue-50">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          This page simulates manual transfers of collected inclusive tax. The system
          creates the corresponding journal entries and adjusts account balances.
          Actual fund transfers must be completed separately.
        </AlertDescription>
      </Alert>

      {/* Balance Summary */}
      <BalanceSummary
        currentBalance={currentBalance}
        totalTransferred={totalTransferred}
        totalReversed={totalReversed}
        pendingTransferAmount={0}
      />

      {/* Main Content */}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="transfer">New Transfer</TabsTrigger>
            <TabsTrigger value="history">
              Transfer History ({transfers.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transfer" className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  Record Manual Transfer
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Create a new tax transfer simulation for accounting purposes
                </p>
              </div>

              <TaxTransferForm
                providers={providers}
                availableBalance={currentBalance}
                onSuccess={(transfer) => {
                  loadTransfers();
                  setActiveTab("history");
                  toast({
                    title: "Success",
                    description: "Transfer recorded successfully",
                  });
                }}
              />
            </div>

            {/* Best Practices */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <h3 className="font-semibold text-green-900 mb-3">Best Practices</h3>
              <ul className="space-y-2 text-sm text-green-800">
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Use unique, descriptive transfer references to prevent duplicates</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Match the transfer date with the actual manual transfer date</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Include check numbers, bank references, or receipt numbers</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Always verify the available balance before creating transfers</span>
                </li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  Transfer History
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  View all recorded transfers and reversals
                </p>
              </div>

              <TaxTransferHistory
                transfers={transfers}
                onTransferReversed={loadTransfers}
              />
            </div>

            {/* Summary Stats */}
            {transfers.length > 0 && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-sm text-gray-600 mb-1">Total Records</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {transfers.length}
                  </p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-blue-700 font-medium mb-1">Active Transfers</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {simulatedTransfers.length}
                  </p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                  <p className="text-sm text-orange-700 font-medium mb-1">Reversed</p>
                  <p className="text-2xl font-bold text-orange-900">
                    {transfers.filter((t) => t.status === "REVERSED").length}
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
