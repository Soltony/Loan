"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LoanProvider, LoanDetails, Tax } from "@/lib/types";
import { Landmark, Loader2 } from "lucide-react";
import { LoanOfferAndCalculator } from "@/components/loan/loan-offer-and-calculator";
import {
  LoanDetailsView,
  type DisbursementState,
} from "@/components/loan/loan-details-view";
import { useToast } from "@/hooks/use-toast";
import AccountSelector from "@/components/loan/account-selector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniAppShell } from "@/components/miniapp/shell";
import { BottomSheet } from "@/components/miniapp/bottom-sheet";
import { BrandButton, Panel } from "@/components/miniapp/ui";
import { maskAccount, titleCaseName } from "@/lib/miniapp/format";

type Step = "calculator" | "details";

export function ApplyClient({
  provider,
  taxConfigs,
}: {
  provider: LoanProvider;
  taxConfigs: Tax[] | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const productId = searchParams.get("product");
  const borrowerId = searchParams.get("borrowerId");

  const selectedProduct = useMemo(() => {
    if (!provider || !productId) return null;
    return provider.products.find((p) => p.id === productId) || null;
  }, [provider, productId]);

  const initialStep: Step = (searchParams.get("step") as Step) || "calculator";

  const [step, setStep] = useState<Step>(initialStep);
  const [loanDetails, setLoanDetails] = useState<LoanDetails | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [isCheckingAccount, setIsCheckingAccount] = useState(true);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [disbursement, setDisbursement] = useState<DisbursementState>("sending");
  // What the customer was shown before confirming, for the result screen.
  const [outcome, setOutcome] = useState<{ receive: number; total?: number }>({
    receive: 0,
  });

  // TIN (Tax Identification Number) collection state.
  const [storedTin, setStoredTin] = useState<string | null>(null);
  const [showTinModal, setShowTinModal] = useState(false);
  const [tinInput, setTinInput] = useState("");
  const [savingTin, setSavingTin] = useState(false);
  const pendingDetailsRef = useRef<Omit<
    LoanDetails,
    "id" | "providerName" | "productName" | "payments"
  > | null>(null);

  useEffect(() => {
    // When the super-app provides a borrowerId (phone), check for an active associated account.
    // If none exists, open a blocking modal to force the user to select one.
    const checkActive = async () => {
      if (!borrowerId) {
        setIsCheckingAccount(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/phone-accounts?phoneNumber=${encodeURIComponent(borrowerId)}`,
        );
        if (!res.ok) {
          setShowAccountModal(true);
          return;
        }
        const items = await res.json();
        const active = items && items.find((i: any) => i.isActive);
        if (active) {
          setSelectedAccount(active);
          // Ensure customer info is provisioned for this active account
          try {
            fetch("/api/phone-accounts/fetch-customer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phoneNumber: borrowerId,
                accountNumber: active.accountNumber,
                providerId: provider?.id,
              }),
            })
              .then(() => {
                /* fire-and-forget */
              })
              .catch(() => {
                /* ignore */
              });
          } catch (e) {
            // ignore
          }
        } else {
          setShowAccountModal(true);
        }
      } catch (err) {
        setShowAccountModal(true);
      } finally {
        setIsCheckingAccount(false);
      }
    };

    checkActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowerId]);

  // Check whether the borrower already has a TIN Number on file so we know
  // whether to prompt for it during the application.
  useEffect(() => {
    if (!borrowerId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/borrower-tin");
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data) return;
        if (data.tin) setStoredTin(String(data.tin));
      } catch {
        /* ignore; will re-check when the borrower applies */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [borrowerId]);

  const eligibilityResult = useMemo(() => {
    const min = searchParams.get("min");
    const max = searchParams.get("max");

    return {
      isEligible: true,
      suggestedLoanAmountMin: min
        ? parseFloat(min)
        : (selectedProduct?.minLoan ?? 0),
      suggestedLoanAmountMax: max
        ? parseFloat(max)
        : (selectedProduct?.maxLoan ?? 0),
      reason: "You are eligible for a loan.",
    };
  }, [searchParams, selectedProduct]);

  type AcceptedDetails = Omit<
    LoanDetails,
    "id" | "providerName" | "productName" | "payments"
  >;

  // Returns true if the borrower already has a TIN Number on file.
  const ensureTinOnFile = async (): Promise<boolean> => {
    if (storedTin) return true;
    try {
      const res = await fetch("/api/borrower-tin");
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.tin) {
          setStoredTin(String(data.tin));
          return true;
        }
        return false;
      }
    } catch {
      /* ignore and prompt for the TIN below */
    }
    return false;
  };

  const handleTinSubmit = async () => {
    const value = tinInput.trim();
    if (!value) {
      toast({
        title: "TIN Number required",
        description: "Please enter your TIN Number to continue.",
        variant: "destructive",
      });
      return;
    }
    setSavingTin(true);
    try {
      const res = await fetch("/api/borrower-tin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tin: value, providerId: provider?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save TIN Number.");
      }
      const saved = String(data?.tin ?? value);
      setStoredTin(saved);
      setShowTinModal(false);
      setTinInput("");
      toast({
        title: "TIN Number saved",
        description: "Thank you. Continuing your application.",
      });
      // Resume the loan application that was paused to collect the TIN.
      const pending = pendingDetailsRef.current;
      pendingDetailsRef.current = null;
      if (pending) {
        await submitLoan(pending);
      }
    } catch (err: any) {
      toast({
        title: "Could not save TIN Number",
        description: String(err?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setSavingTin(false);
    }
  };

  const handleLoanAccept = async (details: AcceptedDetails) => {
    if (!selectedProduct || !borrowerId) {
      toast({
        title: "Something went wrong",
        description: "Please go back and start your application again.",
        variant: "destructive",
      });
      return;
    }

    if (isSubmitting || savingTin) {
      return;
    }

    // A TIN Number must be on file before a loan application can proceed. If the
    // borrower does not have one yet, prompt for it and resume once it is saved.
    const hasTin = await ensureTinOnFile();
    if (!hasTin) {
      pendingDetailsRef.current = details;
      setTinInput("");
      setShowTinModal(true);
      return;
    }

    await submitLoan(details);
  };

  const submitLoan = async (details: AcceptedDetails) => {
    if (!selectedProduct || !borrowerId) {
      toast({
        title: "Something went wrong",
        description: "Please go back and start your application again.",
        variant: "destructive",
      });
      return;
    }

    // Prevent double-submission
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Personal Loan Flow: Disburse the loan directly
      const finalDetails = {
        borrowerId,
        productId: selectedProduct.id,
        loanAmount: details.loanAmount,
        disbursedDate: details.disbursedDate,
        dueDate: details.dueDate,
        creditAccount: selectedAccount?.accountNumber || undefined,
      };

      const response = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalDetails),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          typeof errorData?.error === "string"
            ? errorData.error
            : "We could not create your loan. Please try again.",
        );
      }

      const savedLoan = await response.json();

      // The calculator's figures, as shown on the confirmation (the received amount
      // includes the deduction core banking makes, which the loan record does not hold).
      const shown = details as AcceptedDetails & {
        netReceivedAmount?: number;
        total?: number;
      };
      setOutcome({
        receive:
          shown.netReceivedAmount ??
          savedLoan.netDisbursedAmount ??
          savedLoan.loanAmount,
        total: shown.total,
      });

      const displayLoan: LoanDetails = {
        ...savedLoan,
        providerName: provider.name,
        productName: selectedProduct.name,
        disbursedDate: new Date(savedLoan.disbursedDate),
        dueDate: new Date(savedLoan.dueDate),
        payments: [],
      };
      setLoanDetails(displayLoan);
      setDisbursement("sending");
      setStep("details");

      try {
        if (selectedAccount && selectedAccount.accountNumber) {
          // Disburse the net amount (after inclusive tax deduction) if available, otherwise full amount
          const disbursementAmount =
            savedLoan.netDisbursedAmount != null && savedLoan.taxDeducted > 0
              ? savedLoan.netDisbursedAmount
              : savedLoan.loanAmount;
          const disRes = await fetch("/api/external/disbursement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creditAccount: selectedAccount.accountNumber,
              providerId: provider.id,
              amount: disbursementAmount,
              loanId: savedLoan.id,
            }),
          });

          if (!disRes.ok) {
            const err = await disRes.json().catch(() => null);
            console.error("[apply] disbursement failed", disRes.status, err);
            setDisbursement("failed");
          } else {
            setDisbursement("sent");
          }
        } else {
          setDisbursement("skipped");
        }
      } catch (err: any) {
        console.error("[apply] disbursement error", err);
        setDisbursement("failed");
      }
    } catch (error: any) {
      toast({
        title: "Loan not created",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("product");
    params.delete("step");
    router.push(`/loan?${params.toString()}`);
  };

  const handleReset = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("product");
    params.delete("step");
    router.push(`/loan?${params.toString()}`);
  };

  const handleViewLoan = () => {
    if (!loanDetails) return;
    const params = new URLSearchParams();
    if (borrowerId) params.set("borrowerId", borrowerId);
    router.push(`/history/${loanDetails.id}?${params.toString()}`);
  };

  const accountLabel = selectedAccount?.accountNumber
    ? maskAccount(selectedAccount.accountNumber)
    : undefined;

  const renderStep = () => {
    switch (step) {
      case "calculator":
        if (selectedProduct) {
          return (
            <LoanOfferAndCalculator
              product={selectedProduct}
              taxConfigs={taxConfigs || []}
              isLoading={false}
              eligibilityResult={eligibilityResult}
              onAccept={handleLoanAccept}
              isSubmitting={isSubmitting}
              accountLabel={accountLabel}
            />
          );
        }
        if (productId && !selectedProduct) {
          return (
            <Panel className="py-10 text-center">
              <p className="font-semibold">This loan is no longer available</p>
              <p className="mt-1 text-sm text-gray-500">
                It may have been changed or withdrawn.
              </p>
              <BrandButton className="mt-5" onClick={handleBack}>
                Back to loans
              </BrandButton>
            </Panel>
          );
        }
        return (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        );

      case "details":
        if (loanDetails && selectedProduct) {
          return (
            <LoanDetailsView
              details={loanDetails}
              disbursement={disbursement}
              amountToReceive={outcome.receive}
              totalToRepay={outcome.total}
              accountLabel={accountLabel}
              onDone={handleReset}
              onViewLoan={handleViewLoan}
            />
          );
        }
        return (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        );
      default:
        return <div className="text-center">Invalid step.</div>;
    }
  };

  const onCalculator = step === "calculator";

  return (
    <MiniAppShell
      brandColor={provider.colorHex}
      title={onCalculator ? selectedProduct?.name ?? "Apply" : undefined}
      onBack={onCalculator ? handleBack : undefined}
    >
      {onCalculator && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600" aria-hidden>
            <Landmark className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500">Paid into</p>
            {isCheckingAccount ? (
              <Skeleton className="mt-1 h-4 w-40 bg-gray-100" />
            ) : selectedAccount ? (
              <p className="truncate text-sm font-semibold">
                {maskAccount(selectedAccount.accountNumber)}
                {selectedAccount.customerName
                  ? ` · ${titleCaseName(selectedAccount.customerName)}`
                  : ""}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setShowAccountModal(true)}
                className="text-sm font-semibold text-brand-ink underline-offset-2 hover:underline"
              >
                Choose an account
              </button>
            )}
          </div>
        </div>
      )}

      {renderStep()}

      {/* While the loan is being created: block taps and say what is happening. */}
      {isSubmitting && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-white/85 px-8 text-center backdrop-blur-sm"
        >
          <Loader2 className="h-10 w-10 animate-spin text-brand-ink" aria-hidden />
          <p className="text-base font-semibold">Setting up your loan…</p>
          <p className="text-sm text-gray-500">Please keep the app open.</p>
        </div>
      )}

      {/* Blocking: forces account selection when there is no active account */}
      <BottomSheet
        open={showAccountModal}
        onOpenChange={setShowAccountModal}
        dismissible={!!selectedAccount}
        title="Choose your account"
        description="Your loan is paid into this account."
      >
        {borrowerId && (
          <AccountSelector
            phoneNumber={borrowerId}
            onSelected={(acc) => {
              (async () => {
                setSelectedAccount(acc);
                setShowAccountModal(false);
                try {
                  const res = await fetch(
                    "/api/phone-accounts/fetch-customer",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        phoneNumber: borrowerId,
                        accountNumber: acc.accountNumber,
                        providerId: provider?.id,
                      }),
                    },
                  );
                  const data = await res.json().catch(() => null);
                  if (!res.ok) {
                    console.error("[apply] fetch-customer failed", res.status, data);
                    toast({
                      title: "Account not checked",
                      description:
                        data?.error ||
                        "We could not check this account right now. Please try again shortly.",
                      variant: "destructive",
                    });
                  } else if (data?.pending && !data?.saved && !data?.reused) {
                    // pending without a result: the details are still being
                    // fetched in the background.
                    toast({
                      title: "Checking your account",
                      description: "This takes a moment.",
                    });
                  }
                } catch (err: any) {
                  console.error("[apply] fetch-customer error", err);
                  toast({
                    title: "Account not checked",
                    description:
                      "We could not reach the bank to check this account. Please try again shortly.",
                    variant: "destructive",
                  });
                }
              })();
            }}
          />
        )}
      </BottomSheet>

      {/* Collects the borrower's TIN Number when none is on file */}
      <BottomSheet
        open={showTinModal}
        onOpenChange={(open) => {
          // Prevent closing while saving.
          if (savingTin) return;
          if (!open) pendingDetailsRef.current = null;
          setShowTinModal(open);
        }}
        title="Enter your TIN"
        description="A Tax Identification Number (TIN) is needed before your loan can be paid out. We'll save it so you won't be asked again."
        closeOnOutsideTap={false}
        footer={
          <BrandButton
            block
            size="lg"
            onClick={handleTinSubmit}
            disabled={!tinInput.trim()}
            loading={savingTin}
          >
            {savingTin ? "Saving…" : "Save and continue"}
          </BrandButton>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="tin-input">TIN Number</Label>
          <Input
            id="tin-input"
            inputMode="numeric"
            autoFocus
            value={tinInput}
            onChange={(e) => setTinInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleTinSubmit();
              }
            }}
            placeholder="Enter your TIN"
            disabled={savingTin}
            className="h-12 rounded-xl text-base focus-visible:ring-brand-ink"
          />
        </div>
      </BottomSheet>
    </MiniAppShell>
  );
}
