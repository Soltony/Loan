"use client";

import { formatCurrency } from "@/lib/tax-transfer-utils";
import { TrendingDown, TrendingUp } from "lucide-react";

interface BalanceSummaryProps {
  currentBalance: number;
  totalTransferred: number;
  totalReversed: number;
  pendingTransferAmount?: number;
}

export function BalanceSummary({
  currentBalance,
  totalTransferred,
  totalReversed,
  pendingTransferAmount = 0,
}: BalanceSummaryProps) {
  const projectedBalance = currentBalance - pendingTransferAmount;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Current Balance</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">
              {formatCurrency(currentBalance)}
            </p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-600">Total Transferred</p>
            <p className="text-2xl font-bold text-orange-900 mt-1">
              {formatCurrency(totalTransferred)}
            </p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center">
            <TrendingDown className="h-6 w-6 text-orange-600" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-600">Total Reversed</p>
            <p className="text-2xl font-bold text-green-900 mt-1">
              {formatCurrency(totalReversed)}
            </p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-green-600" />
          </div>
        </div>
      </div>

      {pendingTransferAmount > 0 && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-600">Projected After Transfer</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">
                {formatCurrency(projectedBalance)}
              </p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
              <span className="text-lg font-bold text-purple-600">→</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
