"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
  LoanDetails,
  LoanProvider,
  LoanProduct,
  TermsAndConditions,
  Tax,
} from "@/lib/types";
import { IconDisplay } from "@/components/icons";
import {
  ChevronRight,
  Loader2,
  Eye,
  EyeOff,
  History,
  Landmark,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/loan/product-card";
import { RepaymentDialog } from "@/components/loan/repayment-dialog";
import { checkLoanEligibility } from "@/actions/eligibility";
import { useToast } from "@/hooks/use-toast";
import AccountSelector from "@/components/loan/account-selector";
import { Checkbox } from "../ui/checkbox";
import { Skeleton } from "../ui/skeleton";
import { MiniAppShell } from "@/components/miniapp/shell";
import { BottomSheet } from "@/components/miniapp/bottom-sheet";
import { Amount, BrandButton, Panel, SectionTitle } from "@/components/miniapp/ui";
import { usePersistentFlag } from "@/components/miniapp/use-persistent-flag";
import {
  firstName,
  formatETB,
  formatMoney,
  titleCaseName,
} from "@/lib/miniapp/format";

const HIDE_AMOUNTS_KEY = "miniapp.hideAmounts";

interface DashboardClientProps {
  providers: LoanProvider[];
  initialLoanHistory: LoanDetails[];
  taxConfigs: Tax[];
  asOfDate: Date;
}

interface EligibilityState {
  limits: Record<string, number>;
  reasons: Record<string, string>;
}

interface AgreementState {
  terms?: TermsAndConditions;
  hasAgreed?: boolean;
}

export function DashboardClient({
  providers,
  initialLoanHistory,
  taxConfigs,
  asOfDate,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const providerIdFromUrl = searchParams.get("providerId");
  const borrowerId = searchParams.get("borrowerId");
  const { toast } = useToast();

  const [loanHistory, setLoanHistory] = useState(initialLoanHistory);
  const [selectedProviderId, setSelectedProviderId] = useState(
    providerIdFromUrl ?? providers[0]?.id
  );
  const [isRepayDialogOpen, setIsRepayDialogOpen] = useState(false);
  const [repayingLoanInfo, setRepayingLoanInfo] = useState<{
    loan: LoanDetails;
    balanceDue: number;
  } | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [eligibility, setEligibility] = useState<EligibilityState>({
    limits: {},
    reasons: {},
  });
  // Customer info or statement figures are still being fetched: the limit will be redone.
  const [isUpdatingLimit, setIsUpdatingLimit] = useState(false);
  const calculationRef = useRef(0);
  const dataWatchRef = useRef<AbortController | null>(null);
  const selectedProviderIdRef = useRef(selectedProviderId);

  const [agreementState, setAgreementState] = useState<AgreementState>({});
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isAgreementDialogOpen, setIsAgreementDialogOpen] = useState(false);
  const [productToApply, setProductToApply] = useState<LoanProduct | null>(
    null
  );
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [isSavingAgreement, setIsSavingAgreement] = useState(false);
  // The product whose Apply was tapped, while its up-to-date limit is fetched.
  const [applyingProductId, setApplyingProductId] = useState<string | null>(
    null
  );
  // Coming back to a page the browser kept in memory must not leave Apply spinning.
  useEffect(() => {
    const reset = () => setApplyingProductId(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  // One privacy toggle for every amount on the page, remembered on this phone.
  const [hideAmounts, toggleHideAmounts] = usePersistentFlag(HIDE_AMOUNTS_KEY);

  const checkAgreement = useCallback(
    async (providerId: string) => {
      if (!borrowerId) return;

      try {
        const response = await fetch(
          `/api/borrowers/agreements?providerId=${providerId}&borrowerId=${borrowerId}`
        );
        if (!response.ok) throw new Error("Failed to check agreement status");
        const data = await response.json();
        setAgreementState(data);
      } catch (error) {
        console.error(error);
        toast({
          title: "Something went wrong",
          description: "We could not load the loan terms. Please try again.",
          variant: "destructive",
        });
      }
    },
    [borrowerId, toast]
  );

  const handleAcceptAgreement = async () => {
    if (!borrowerId || !agreementState.terms) return;
    setIsSavingAgreement(true);
    try {
      const response = await fetch("/api/borrowers/agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrowerId, termsId: agreementState.terms.id }),
      });
      if (!response.ok) throw new Error("Failed to accept agreement.");

      setAgreementState((prev) => ({ ...prev, hasAgreed: true }));
      setIsAgreementDialogOpen(false);

      // Now proceed with the original action
      if (productToApply) {
        handleApply(productToApply);
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Something went wrong",
        description: "We could not save your agreement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAgreement(false);
    }
  };

  const recalculateEligibility = useCallback(
    async (providerId: string) => {
      if (!borrowerId) return;

      // Only the newest calculation may show: an older one can finish later and would put back
      // a limit worked out before new data landed (or for the provider the user just left).
      const calculation = ++calculationRef.current;
      const isLatest = () => calculation === calculationRef.current;
      setIsRecalculating(true);
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) {
        setIsRecalculating(false);
        return;
      }

      try {
        const newLimits: Record<string, number> = {};
        const newReasons: Record<string, string> = {};

        for (const product of provider.products) {
          const { isEligible, reason, maxLoanAmount } =
            await checkLoanEligibility(borrowerId, providerId, product.id);
          newLimits[product.id] = isEligible ? maxLoanAmount : 0;
          newReasons[product.id] = reason;
        }

        if (!isLatest()) return;
        setEligibility({ limits: newLimits, reasons: newReasons });
      } catch (error) {
        if (!isLatest()) return;
        console.error("Error recalculating eligibility:", error);
        const defaultReason =
          "We could not work out your loan limit right now. Please try again shortly.";
        const newReasons = provider.products.reduce(
          (acc, p) => ({ ...acc, [p.id]: defaultReason }),
          {}
        );
        setEligibility({ limits: {}, reasons: newReasons });
        toast({
          title: "Limit not available",
          description: defaultReason,
          variant: "destructive",
        });
      } finally {
        if (isLatest()) setIsRecalculating(false);
      }
    },
    [borrowerId, providers, toast]
  );

  useEffect(() => {
    selectedProviderIdRef.current = selectedProviderId;
  }, [selectedProviderId]);

  useEffect(() => () => dataWatchRef.current?.abort(), []);

  // After /api/phone-accounts/fetch-customer: redo the limit when new data has been stored, and
  // while more is still being fetched (a new customer's statement can take minutes in a rush),
  // keep asking and redo it each time something lands - so the limit appears in this visit.
  const followDataFetch = useCallback(
    async (accountNumber: string, fetched: any) => {
      dataWatchRef.current?.abort();
      const recalculate = () => {
        const providerId = selectedProviderIdRef.current;
        if (providerId) recalculateEligibility(providerId);
      };
      if (fetched?.changed) recalculate();
      if (!fetched?.pending) return;

      const controller = new AbortController();
      dataWatchRef.current = controller;
      let stamp = `${fetched.customerInfoFetchedAt}|${fetched.figuresComputedAt}`;
      setIsUpdatingLimit(true);
      try {
        const giveUpAt = Date.now() + 15 * 60 * 1000;
        while (Date.now() < giveUpAt) {
          const askedAt = Date.now();
          // Waits up to 20 s on the server for the data to land.
          const res = await fetch(
            `/api/phone-accounts/data-status?accountNumber=${encodeURIComponent(accountNumber)}`,
            { cache: "no-store", signal: controller.signal }
          );
          if (!res.ok) break;
          const status = await res.json();
          const next = `${status.customerInfoFetchedAt}|${status.figuresComputedAt}`;
          if (next !== stamp) {
            stamp = next;
            recalculate();
          }
          if (!status.busy) break;
          if (Date.now() - askedAt < 2000) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      } catch {
        // Stopped (left the page, or another account was chosen) or offline: the limit is
        // worked out again on the next visit.
      } finally {
        if (dataWatchRef.current === controller) {
          dataWatchRef.current = null;
          setIsUpdatingLimit(false);
        }
      }
    },
    [recalculateEligibility]
  );

  useEffect(() => {
    setLoanHistory(initialLoanHistory);
  }, [initialLoanHistory]);

  const refreshLoanHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/loan-history", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoanHistory(data);
      }
    } catch {
      // ignore network errors; UI will still work with initial data
    }
  }, []);

  useEffect(() => {
    // When the super-app provides a borrowerId (phone), check for an active associated account.
    // If none exists, open a blocking modal to force the user to select one.
    const checkActive = async () => {
      if (!borrowerId) return;
      try {
        const res = await fetch(
          `/api/phone-accounts?phoneNumber=${encodeURIComponent(borrowerId)}`
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
            const providerIdToUse = providerIdFromUrl || providers[0]?.id;
            fetch("/api/phone-accounts/fetch-customer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phoneNumber: borrowerId,
                accountNumber: active.accountNumber,
                providerId: providerIdToUse,
              }),
            })
              .then((res) => (res.ok ? res.json() : null))
              .then((data) => {
                // The limit on screen was worked out before this data landed.
                if (data) followDataFetch(active.accountNumber, data);
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
      }
    };

    checkActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowerId, providerIdFromUrl, providers]);

  useEffect(() => {
    if (providers.length > 0 && borrowerId) {
      const providerIdToUse = providerIdFromUrl || providers[0]?.id;
      if (providerIdToUse) {
        setSelectedProviderId(providerIdToUse);
        if (Object.keys(eligibility.limits).length === 0) {
          // Only run on initial load
          recalculateEligibility(providerIdToUse);
        }
        checkAgreement(providerIdToUse);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, borrowerId, providerIdFromUrl]);

  const { overallMaxLimit, availableToBorrow } = useMemo(() => {
    const unpaidLoans = loanHistory.filter(
      (loan) => loan.repaymentStatus === "Unpaid"
    );
    const outstandingPrincipal = unpaidLoans.reduce(
      (acc, loan) => acc + (loan.loanAmount - (loan.repaidAmount || 0)),
      0
    );

    const maxLimitFromTiers = Object.values(eligibility.limits).reduce(
      (max, limit) => Math.max(max, limit),
      0
    );

    // Correct logic as per user's request
    const availableToBorrow = maxLimitFromTiers - outstandingPrincipal;

    return {
      overallMaxLimit: maxLimitFromTiers,
      totalBorrowed: outstandingPrincipal,
      availableToBorrow: Math.max(0, availableToBorrow),
    };
  }, [eligibility.limits, loanHistory]);

  const activeLoansByProduct = useMemo(() => {
    const unpaidLoans = loanHistory.filter(
      (loan) => loan.repaymentStatus === "Unpaid"
    );
    return unpaidLoans.reduce((acc, loan) => {
      // Use the active installment due date when present, otherwise fall back to loan.dueDate
      const activeInst = Array.isArray((loan as any).installments)
        ? (loan as any).installments.find((i: any) => i.isActive)
        : undefined;
      const effectiveDue = activeInst
        ? new Date(activeInst.dueDate)
        : new Date(loan.dueDate);
      const existing = acc[loan.product.id];
      const existingEffectiveDue = existing
        ? Array.isArray(existing.installments)
          ? existing.installments.find((i: any) => i.isActive)?.dueDate
            ? new Date(
                existing.installments.find((i: any) => i.isActive)?.dueDate
              )
            : new Date(existing.dueDate)
          : new Date(existing.dueDate)
        : null;
      if (
        !acc[loan.product.id] ||
        effectiveDue > (existingEffectiveDue || new Date(0))
      ) {
        acc[loan.product.id] = loan;
      }
      return acc;
    }, {} as Record<string, LoanDetails>);
  }, [loanHistory]);

  const selectedProvider = useMemo(() => {
    return (
      providers.find((p) => p.id === selectedProviderId) || providers[0] || null
    );
  }, [selectedProviderId, providers]);

  const handleApply = async (product: LoanProduct) => {
    if (agreementState.terms && !agreementState.hasAgreed) {
      setProductToApply(product);
      setAgreementChecked(false);
      setIsAgreementDialogOpen(true);
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("providerId", selectedProviderId);
    params.set("product", product.id);

    setApplyingProductId(product.id);
    // Fetch fresh eligibility for this borrower + provider to ensure UI uses up-to-date limit
    let productLimit = eligibility.limits[product.id] ?? 0;
    try {
      if (borrowerId && selectedProviderId) {
        const res = await fetch(
          `/api/ussd/borrowers/${encodeURIComponent(
            borrowerId
          )}/eligibility?providerId=${encodeURIComponent(selectedProviderId)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.limits)) {
            const found = data.limits.find(
              (l: any) => l.productId === product.id
            );
            if (found && typeof found.limit === "number") {
              productLimit = found.limit;
            }
          }
        }
      }
    } catch (e) {
      // ignore network errors and fall back to existing limit
      console.error("Failed to fetch fresh eligibility:", e);
    }

    params.set("min", String(product.minLoan ?? 0));
    params.set("max", String(productLimit));
    router.push(`/apply?${params.toString()}`);
  };

  const handleProviderSelect = (providerId: string) => {
    setSelectedProviderId(providerId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("providerId", providerId);
    router.push(`/loan?${params.toString()}`, { scroll: false });
    recalculateEligibility(providerId);
    checkAgreement(providerId);
  };

  const handleRepay = (loan: LoanDetails, balanceDue: number) => {
    setRepayingLoanInfo({ loan, balanceDue });
    setIsRepayDialogOpen(true);
  };

  const handleConfirmRepayment = async (amount: number) => {
    if (!repayingLoanInfo) return;
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: repayingLoanInfo.loan.id, amount }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process payment.");
      }

      const updatedLoanData = await response.json();

      const finalLoanObject: LoanDetails = {
        ...updatedLoanData,
        providerName: repayingLoanInfo.loan.providerName,
        productName: repayingLoanInfo.loan.productName,
        product: repayingLoanInfo.loan.product,
        provider: repayingLoanInfo.loan.provider,
        disbursedDate: new Date(updatedLoanData.disbursedDate),
        dueDate: new Date(updatedLoanData.dueDate),
        payments: updatedLoanData.payments,
      };

      setLoanHistory((prevHistory) =>
        prevHistory.map((l) =>
          l.id === updatedLoanData.id ? finalLoanObject : l
        )
      );

      // Re-check eligibility after repayment
      if (selectedProviderId) {
        recalculateEligibility(selectedProviderId);
      }

      toast({
        title: "Payment Successful",
        description: `${formatETB(amount)} has been paid towards your loan.`,
      });

      try {
        if (typeof window !== "undefined") {
          const event = new CustomEvent("payment:completed", {
            detail: { loanId: updatedLoanData.id },
          });
          window.dispatchEvent(event);
          try {
            const bc = new BroadcastChannel("payments");
            bc.postMessage({ loanId: updatedLoanData.id });
            bc.close();
          } catch (e) {
            // BroadcastChannel may not be available in some environments, ignore
          }
        }
      } catch (e) {
        // ignore
      }
    } catch (error: any) {
      toast({
        title: "Payment Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRepayDialogOpen(false);
      setRepayingLoanInfo(null);
    }
  };

  // A new disbursement account was chosen (or an existing one made active).
  const handleAccountSelected = async (acc: {
    accountNumber: string;
    customerName?: string | null;
    isActive?: boolean;
  }) => {
    const unchanged =
      !!selectedAccount &&
      String(selectedAccount.accountNumber) === String(acc.accountNumber);
    setSelectedAccount(acc);
    setShowAccountModal(false);
    // The account already in use was tapped again: nothing to redo.
    if (unchanged) return;
    const providerIdToUse =
      selectedProviderId || providerIdFromUrl || providers[0]?.id;
    // The limit depends on the active account: work it out again now. Waiting for
    // fetch-customer to report new data is not enough, since data already stored for
    // this account reports nothing new and the previous account's limit would stay.
    if (providerIdToUse) recalculateEligibility(providerIdToUse);
    try {
      const res = await fetch("/api/phone-accounts/fetch-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: borrowerId,
          accountNumber: acc.accountNumber,
          providerId: providerIdToUse,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("[dashboard] fetch-customer failed", res.status, data);
        toast({
          title: "Account not checked",
          description:
            data?.error ||
            "We could not check this account right now. Please try again shortly.",
          variant: "destructive",
        });
        return;
      }
      toast(
        data?.pending && !data?.saved && !data?.reused
          ? {
              title: "Checking your account",
              description: "Your limit will update in a moment.",
            }
          : {
              title: "Account updated",
              description: `Loans will be paid into ${acc.accountNumber}.`,
            }
      );
      followDataFetch(acc.accountNumber, data);
    } catch (err: any) {
      console.error("[dashboard] fetch-customer error", err);
      toast({
        title: "Account not checked",
        description:
          "We could not reach the bank to check this account. Please try again shortly.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onCustom = () => {
      // Prefer client refresh so UI updates even if navigation cache sticks
      refreshLoanHistory();
      router.refresh();
    };

    window.addEventListener("payment:completed", onCustom as EventListener);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("payments");
      bc.addEventListener("message", onCustom as EventListener);
    } catch (e) {
      // ignore if BroadcastChannel not supported
    }

    return () => {
      window.removeEventListener(
        "payment:completed",
        onCustom as EventListener
      );
      try {
        bc?.close();
      } catch (e) {
        // ignore
      }
    };
  }, [router, refreshLoanHistory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // When user returns to the miniapp (after paying elsewhere), refresh balances
    const onFocus = () => refreshLoanHistory();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshLoanHistory();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshLoanHistory]);

  const activeProducts = useMemo(
    () =>
      (selectedProvider?.products ?? []).filter((p) => p.status === "Active"),
    [selectedProvider]
  );
  const productsWithLoans = activeProducts.filter(
    (p) => activeLoansByProduct[p.id]
  );
  const productsToBorrow = activeProducts.filter(
    (p) => !activeLoansByProduct[p.id]
  );
  // Why nothing can be borrowed, shown under the limit (the products repeat it).
  const limitReason = useMemo(() => {
    if (availableToBorrow > 0) return "";
    for (const p of activeProducts) {
      const reason = eligibility.reasons[p.id];
      if (reason && !(eligibility.limits[p.id] > 0)) return reason;
    }
    return "";
  }, [activeProducts, availableToBorrow, eligibility]);

  const historyHref = `/history?${searchParams.toString()}`;
  const greetingName = firstName(selectedAccount?.customerName);
  const amount = (value: number) =>
    hideAmounts ? "••••••" : formatMoney(value);

  return (
    <>
      <MiniAppShell brandColor={selectedProvider?.colorHex}>
        {/* Who and where */}
        <div className="flex items-center gap-3 pb-4">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-gray-200 bg-white"
            aria-hidden
          >
            {selectedProvider ? (
              <IconDisplay
                iconName={selectedProvider.icon}
                className="h-7 w-7 object-contain text-brand-ink"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-500">
              {selectedProvider?.name ?? "Loans"}
            </p>
            <p className="truncate text-lg font-semibold leading-tight">
              {greetingName ? `Hello, ${greetingName}` : "Welcome"}
            </p>
          </div>
          <Link
            href={historyHref}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
          >
            <History className="h-4 w-4" aria-hidden />
            My loans
          </Link>
        </div>

        {/* Lender switcher: only when there is more than one lender */}
        {providers.length > 1 && (
          <div
            role="tablist"
            aria-label="Lenders"
            className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4"
          >
            {providers.map((provider) => {
              const selected = selectedProvider?.id === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => !selected && handleProviderSelect(provider.id)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm font-medium transition",
                    selected
                      ? "border-transparent bg-brand text-brand-fg shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-white">
                    {isRecalculating && selected ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    ) : (
                      <IconDisplay
                        iconName={provider.icon}
                        className="h-5 w-5 object-contain text-gray-600"
                      />
                    )}
                  </span>
                  {provider.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Limit card */}
        <section
          aria-label="Your loan limit"
          className="relative overflow-hidden rounded-3xl bg-brand px-4 pb-2 pt-3.5 text-brand-fg shadow-[0_12px_28px_-16px_rgba(0,0,0,0.45)]"
        >
          {/* Honeycomb, fading out toward the amount so it never sits behind the figures. */}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full text-white"
          >
            <defs>
              <pattern
                id="limit-card-honeycomb"
                width="31.18"
                height="54"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M15.59 0 31.18 9v18L15.59 36 0 27V9ZM15.59 36v18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                />
              </pattern>
              <linearGradient id="limit-card-honeycomb-fade" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0.25" stopColor="#fff" stopOpacity="0" />
                <stop offset="1" stopColor="#fff" stopOpacity="1" />
              </linearGradient>
              <mask id="limit-card-honeycomb-mask">
                <rect width="100%" height="100%" fill="url(#limit-card-honeycomb-fade)" />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="url(#limit-card-honeycomb)"
              mask="url(#limit-card-honeycomb-mask)"
              opacity="0.45"
            />
          </svg>
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium opacity-80">
                Available to borrow
              </p>
              <button
                type="button"
                onClick={toggleHideAmounts}
                aria-pressed={hideAmounts}
                aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
                className="-mr-1 grid h-8 w-8 place-items-center rounded-full bg-black/5 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                {hideAmounts ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {isRecalculating ? (
              <Skeleton className="mt-1 h-9 w-52 bg-black/10" />
            ) : (
              <>
                <Amount
                  value={amount(availableToBorrow)}
                  className="block text-[32px] leading-tight"
                />
                {/* The limit only adds something when part of it is in use. */}
                {overallMaxLimit > 0 && overallMaxLimit !== availableToBorrow ? (
                  <p className="text-sm opacity-80">
                    of your {amount(overallMaxLimit)} ETB limit
                  </p>
                ) : overallMaxLimit <= 0 && limitReason ? (
                  <p className="mt-1 flex items-start gap-1.5 text-sm leading-snug opacity-90">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {limitReason}
                  </p>
                ) : null}
              </>
            )}

            {isUpdatingLimit && (
              <p className="mt-2 flex items-center gap-2 text-xs opacity-80">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Checking your account activity. Your limit will update
                shortly.
              </p>
            )}

            {selectedAccount && (
              <div className="mt-2.5 border-t border-black/10 pt-1">
              <button
                type="button"
                onClick={() => setShowAccountModal(true)}
                aria-label={`Loans are paid into ${selectedAccount.accountNumber}. Change account`}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                <Landmark className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold tabular-nums">
                    {selectedAccount.accountNumber}
                    {selectedAccount.customerName
                      ? ` · ${titleCaseName(selectedAccount.customerName)}`
                      : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center text-xs font-semibold">
                  Change
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              </button>
              </div>
            )}
          </div>
        </section>

        {selectedProvider && productsWithLoans.length > 0 && (
          <>
            <SectionTitle>Your loans</SectionTitle>
            <div className="space-y-3">
              {productsWithLoans.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  taxConfigs={taxConfigs}
                  activeLoan={activeLoansByProduct[product.id]}
                  onApply={() => handleApply(product)}
                  onRepay={handleRepay}
                  IconDisplayComponent={IconDisplay}
                  isEligible={false}
                  eligibilityReason=""
                  availableToBorrow={availableToBorrow}
                  asOfDate={asOfDate}
                  hideAmounts={hideAmounts}
                />
              ))}
            </div>
          </>
        )}

        {selectedProvider && (
          <>
            {(productsToBorrow.length > 0 || activeProducts.length === 0) && (
              <SectionTitle>Borrow</SectionTitle>
            )}
            <div className="space-y-3">
              {productsToBorrow.map((product) => {
                const productLimit = eligibility.limits[product.id] ?? 0;
                return (
                  <ProductCard
                    key={product.id}
                    product={{ ...product, availableLimit: productLimit }}
                    taxConfigs={taxConfigs}
                    onApply={() => handleApply(product)}
                    onRepay={handleRepay}
                    IconDisplayComponent={IconDisplay}
                    isEligible={productLimit > 0}
                    eligibilityReason={eligibility.reasons[product.id] || ""}
                    availableToBorrow={availableToBorrow}
                    asOfDate={asOfDate}
                    isLoadingLimit={isRecalculating}
                    isApplying={applyingProductId === product.id}
                    hideAmounts={hideAmounts}
                  />
                );
              })}
              {activeProducts.length === 0 && (
                <Panel className="py-8 text-center text-sm text-gray-500">
                  {selectedProvider.name} has no loans available right now.
                </Panel>
              )}
            </div>
          </>
        )}

        <Link
          href={historyHref}
          className="mt-6 flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600">
            <History className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Loan history</span>
            <span className="block text-xs text-gray-500">
              Past loans and repayments
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-gray-400" aria-hidden />
        </Link>
      </MiniAppShell>

      {repayingLoanInfo && (
        <RepaymentDialog
          isOpen={isRepayDialogOpen}
          onClose={() => setIsRepayDialogOpen(false)}
          onConfirm={handleConfirmRepayment}
          loan={repayingLoanInfo.loan}
          totalBalanceDue={repayingLoanInfo.balanceDue}
          providerColor={selectedProvider?.colorHex}
          taxConfigs={taxConfigs}
          asOfDate={asOfDate}
        />
      )}

      <BottomSheet
        open={isAgreementDialogOpen}
        onOpenChange={setIsAgreementDialogOpen}
        title="Terms and conditions"
        description={`Please read and accept the terms of ${selectedProvider?.name ?? "the lender"} to continue.`}
        closeOnOutsideTap={false}
        footer={
          <div className="space-y-3">
            <label
              htmlFor="terms"
              className="flex cursor-pointer items-start gap-3 text-sm leading-snug"
            >
              <Checkbox
                id="terms"
                checked={agreementChecked}
                onCheckedChange={(checked) => setAgreementChecked(!!checked)}
                className="mt-0.5 h-5 w-5 border-gray-400 data-[state=checked]:border-brand-ink data-[state=checked]:bg-brand-ink data-[state=checked]:text-white"
              />
              I have read and agree to the terms and conditions.
            </label>
            <BrandButton
              block
              size="lg"
              onClick={handleAcceptAgreement}
              disabled={!agreementChecked}
              loading={isSavingAgreement}
            >
              Agree and continue
            </BrandButton>
          </div>
        }
      >
        <div className="whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
          {agreementState.terms?.content}
        </div>
      </BottomSheet>

      <BottomSheet
        open={showAccountModal}
        onOpenChange={setShowAccountModal}
        dismissible={!!selectedAccount}
        title="Choose your account"
        description="Your loan is paid into this account, and your limit is based on its activity."
      >
        {borrowerId && (
          <AccountSelector
            phoneNumber={borrowerId}
            onSelected={handleAccountSelected}
          />
        )}
      </BottomSheet>
    </>
  );
}
