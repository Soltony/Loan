"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  taxTransferFormSchema,
  type TaxTransferFormData,
  createTaxTransfer,
  formatCurrency,
} from "@/lib/tax-transfer-utils";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TaxTransferFormProps {
  providers: Array<{ id: string; name: string }>;
  availableBalance: number;
  onSuccess: (transfer: any) => void;
}

export function TaxTransferForm({
  providers,
  availableBalance,
  onSuccess,
}: TaxTransferFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingData, setPendingData] = useState<TaxTransferFormData | null>(null);
  const { toast } = useToast();

  const form = useForm<TaxTransferFormData>({
    resolver: zodResolver(taxTransferFormSchema),
    defaultValues: {
      providerId: "",
      transferAmount: 0,
      destinationAccountName: "",
      transferReference: "",
      transferDate: new Date().toISOString().split("T")[0],
      notes: "",
    },
  });

  const selectedAmount = form.watch("transferAmount");
  const amountExceedsBalance = selectedAmount > availableBalance;

  async function onSubmit(data: TaxTransferFormData) {
    // First show confirmation
    setPendingData(data);
    setShowConfirmation(true);
  }

  async function handleConfirm() {
    if (!pendingData) return;

    setIsSubmitting(true);
    try {
      const result = await createTaxTransfer(pendingData);
      
      toast({
        title: "Success",
        description: "Tax transfer has been recorded successfully",
      });

      form.reset();
      setShowConfirmation(false);
      setPendingData(null);
      onSuccess(result);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record tax transfer",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (showConfirmation && pendingData) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
        <h3 className="mb-4 flex items-center text-lg font-semibold text-yellow-900">
          <AlertCircle className="mr-2 h-5 w-5" />
          Confirm Transfer
        </h3>

        <div className="mb-6 space-y-3 rounded bg-white p-4">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Provider:</span>
            <span className="font-medium">
              {providers.find((p) => p.id === pendingData.providerId)?.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Transfer Amount:</span>
            <span className="font-medium text-blue-600">
              {formatCurrency(pendingData.transferAmount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Destination Account:</span>
            <span className="font-medium">{pendingData.destinationAccountName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Reference:</span>
            <span className="font-mono text-sm">{pendingData.transferReference}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Transfer Date:</span>
            <span className="font-medium">
              {new Date(pendingData.transferDate).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="mb-6 flex gap-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          <Check className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium mb-1">This will create journal entries:</p>
            <ul className="list-inside space-y-1 text-xs">
              <li>✓ Debit Provider Fund Account (1100)</li>
              <li>✓ Credit Real Account (selected destination)</li>
              <li>✓ Reduce tax holding balance by {formatCurrency(pendingData.transferAmount)}</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setShowConfirmation(false);
              setPendingData(null);
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Processing..." : "Confirm Transfer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="providerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Loan Provider</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-lg bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">
                Available Tax Balance
              </p>
              <p className="text-sm text-blue-700">
                This is the collected inclusive tax available for transfer
              </p>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(availableBalance)}
            </p>
          </div>
        </div>

        <FormField
          control={form.control}
          name="transferAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Transfer Amount (KES)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...field}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value ? parseFloat(e.target.value) : 0
                    )
                  }
                />
              </FormControl>
              <FormDescription>
                Maximum available: {formatCurrency(availableBalance)}
              </FormDescription>
              {amountExceedsBalance && (
                <FormMessage className="text-red-600">
                  Transfer amount cannot exceed available balance
                </FormMessage>
              )}
              {!amountExceedsBalance && selectedAmount > 0 && (
                <p className="text-xs text-green-600">
                  Remaining after transfer: {formatCurrency(availableBalance - selectedAmount)}
                </p>
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="destinationAccountName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination Real Account</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Collection Account, Bank Account ABC123"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Enter the name or reference of the real account receiving the funds
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="transferReference"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Transfer Reference (Unique)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., TRANSFER-2024-001"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Use a unique reference number (e.g., check number, payment reference)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="transferDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Transfer Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormDescription>
                Date when the manual transfer occurred
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any additional details about this transfer..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Note:</strong> This simulates the accounting effect of a manual
            transfer. The actual funds must be transferred separately. Once confirmed,
            this cannot be undone - you will need to create a reversal record.
          </AlertDescription>
        </Alert>

        <Button
          type="submit"
          disabled={isSubmitting || amountExceedsBalance || availableBalance <= 0}
          className="w-full"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? "Processing..." : "Continue to Confirmation"}
        </Button>
      </form>
    </Form>
  );
}
