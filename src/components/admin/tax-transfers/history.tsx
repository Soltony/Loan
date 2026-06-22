"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  formatCurrency,
  formatDateTime,
  reverseTaxTransfer,
} from "@/lib/tax-transfer-utils";
import { AlertCircle, Loader2, RotateCcw, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Transfer {
  id: string;
  transferReference: string;
  transferAmount: number;
  destinationAccountName: string;
  transferDate: string;
  status: "SIMULATED" | "REVERSED";
  recordedByUser: {
    fullName: string;
    email: string;
  };
  reversedByUser?: {
    fullName: string;
    email: string;
  };
  reversalReason?: string;
  createdAt: string;
  notes?: string;
  journalEntry?: {
    entries: Array<{
      id: string;
      ledgerAccountId: string;
      type: string; // "Debit" | "Credit"
      amount: number;
    }>;
  };
}

interface TaxTransferHistoryProps {
  transfers: Transfer[];
  onTransferReversed: () => void;
}

export function TaxTransferHistory({
  transfers,
  onTransferReversed,
}: TaxTransferHistoryProps) {
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [isReverting, setIsReverting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleReverse() {
    if (!selectedTransfer || !reversalReason.trim()) {
      toast({
        title: "Error",
        description: "Please enter a reversal reason",
        variant: "destructive",
      });
      return;
    }

    if (reversalReason.length < 10) {
      toast({
        title: "Error",
        description: "Reversal reason must be at least 10 characters",
        variant: "destructive",
      });
      return;
    }

    setIsReverting(true);
    try {
      await reverseTaxTransfer(selectedTransfer.id, reversalReason);
      
      toast({
        title: "Success",
        description: "Tax transfer has been reversed successfully",
      });

      setShowReverseDialog(false);
      setSelectedTransfer(null);
      setReversalReason("");
      onTransferReversed();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reverse transfer",
        variant: "destructive",
      });
    } finally {
      setIsReverting(false);
    }
  }

  if (transfers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">No tax transfers recorded yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Transfer Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recorded By</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((transfer) => (
              <div key={transfer.id}>
                <TableRow>
                  <TableCell className="font-mono text-sm">
                    {transfer.transferReference}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(transfer.transferAmount)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {transfer.destinationAccountName}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(transfer.transferDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        transfer.status === "SIMULATED" ? "default" : "secondary"
                      }
                    >
                      {transfer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span>{transfer.recordedByUser.fullName}</span>
                      <span className="text-xs text-gray-500">
                        {formatDateTime(transfer.createdAt)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedId(
                            expandedId === transfer.id ? null : transfer.id
                          )
                        }
                        title="View details"
                      >
                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${
                            expandedId === transfer.id ? "rotate-90" : ""
                          }`}
                        />
                      </Button>
                      {transfer.status === "SIMULATED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedTransfer(transfer);
                            setShowReverseDialog(true);
                          }}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          title="Reverse this transfer"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                {expandedId === transfer.id && (
                  <TableRow className="bg-gray-50">
                    <TableCell colSpan={7}>
                      <div className="space-y-4 py-4">
                        {transfer.notes && (
                          <div>
                            <p className="text-xs font-semibold text-gray-600 mb-1">
                              Notes
                            </p>
                            <p className="text-sm text-gray-700 bg-white p-2 rounded">
                              {transfer.notes}
                            </p>
                          </div>
                        )}

                        {transfer.journalEntry?.entries && (
                          <div>
                            <p className="text-xs font-semibold text-gray-600 mb-2">
                              Journal Entries
                            </p>
                            <div className="overflow-x-auto bg-white rounded border">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-gray-50">
                                    <th className="px-3 py-2 text-left">
                                      Type
                                    </th>
                                    <th className="px-3 py-2 text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {transfer.journalEntry.entries.map(
                                    (entry, idx) => (
                                      <tr
                                        key={idx}
                                        className="border-b hover:bg-gray-50"
                                      >
                                        <td className="px-3 py-2">
                                          <span
                                            className={`font-medium ${
                                              entry.type === "Debit"
                                                ? "text-red-600"
                                                : "text-green-600"
                                            }`}
                                          >
                                            {entry.type}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">
                                          {formatCurrency(entry.amount)}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {transfer.status === "REVERSED" && (
                          <Alert className="border-orange-200 bg-orange-50">
                            <RotateCcw className="h-4 w-4 text-orange-600" />
                            <AlertDescription>
                              <p className="font-medium text-orange-900">
                                Reversed by {transfer.reversedByUser?.fullName}
                              </p>
                              <p className="text-xs text-orange-700 mt-1">
                                Reason: {transfer.reversalReason}
                              </p>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </div>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showReverseDialog} onOpenChange={setShowReverseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse Tax Transfer</DialogTitle>
            <DialogDescription>
              This will reverse the selected transfer and restore the tax balance.
              A reversal journal entry will be created.
            </DialogDescription>
          </DialogHeader>

          {selectedTransfer && (
            <div className="space-y-4">
              <Alert className="border-orange-200 bg-orange-50">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  Reference: <span className="font-mono">{selectedTransfer.transferReference}</span>
                  <br />
                  Amount: <span className="font-semibold">
                    {formatCurrency(selectedTransfer.transferAmount)}
                  </span>
                </AlertDescription>
              </Alert>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Reversal Reason
                </label>
                <Textarea
                  placeholder="Explain why this transfer is being reversed (minimum 10 characters)..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  rows={4}
                  disabled={isReverting}
                  className="resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {reversalReason.length}/10 minimum
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReverseDialog(false);
                setSelectedTransfer(null);
                setReversalReason("");
              }}
              disabled={isReverting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReverse}
              disabled={
                isReverting || reversalReason.length < 10
              }
            >
              {isReverting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isReverting ? "Reversing..." : "Confirm Reversal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
