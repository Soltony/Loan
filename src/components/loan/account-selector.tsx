"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Landmark, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { maskAccount, titleCaseName } from "@/lib/miniapp/format";
import { BrandButton, Notice } from "@/components/miniapp/ui";
import { Skeleton } from "@/components/ui/skeleton";

type ExternalAccount = {
  AccountNumber: number | string;
  Name: string;
  Status?: string;
};

type PhoneAccount = {
  id: string;
  phoneNumber: string;
  accountNumber: string;
  customerName?: string | null;
  isActive: boolean;
};

type Props = {
  phoneNumber: string;
  onSelected?: (account: PhoneAccount) => void;
};

/** One row of the picker: a bank account, saved for this phone or not yet. */
type AccountOption = {
  accountNumber: string;
  name: string;
  status?: string;
  association?: PhoneAccount;
};

// Refusals the server words for customers (ownership checks); anything else is generic.
async function customerMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  console.warn(`[AccountSelector] ${res.status} ${text}`);
  if (res.status === 403 || res.status === 503) {
    try {
      const body = JSON.parse(text);
      if (typeof body?.error === "string" && body.error !== "Forbidden") return body.error;
    } catch {
      // not JSON
    }
  }
  return fallback;
}

export default function AccountSelector({ phoneNumber, onSelected }: Props) {
  const [externalAccounts, setExternalAccounts] = useState<
    ExternalAccount[] | null
  >(null);
  const [associations, setAssociations] = useState<PhoneAccount[]>([]);
  const [associationsLoaded, setAssociationsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!phoneNumber) return;
    fetchAssociations();
    fetchExternalAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneNumber]);

  async function fetchExternalAccounts() {
    setLoadFailed(false);
    setExternalAccounts(null);
    try {
      const res = await fetch("/api/loan-accounts", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn(
          `[AccountSelector] external service returned ${res.status} ${txt}`
        );
        setLoadFailed(true);
        setExternalAccounts([]);
        return;
      }
      const data = await res.json();
      // upstream returns { details: [...] }
      setExternalAccounts(data?.details ?? []);
    } catch (err: any) {
      console.error("[AccountSelector] fetchExternalAccounts error", err);
      setLoadFailed(true);
      setExternalAccounts([]);
    }
  }

  async function fetchAssociations() {
    try {
      const url = `/api/phone-accounts?phoneNumber=${encodeURIComponent(
        phoneNumber
      )}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const items = await res.json();
      setAssociations(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error("[AccountSelector] fetchAssociations error", err);
    } finally {
      setAssociationsLoaded(true);
    }
  }

  async function handleSave(accountNumber: string, customerName?: string) {
    setBusyAccount(accountNumber);
    setError(null);
    try {
      const res = await fetch("/api/phone-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          accountNumber,
          customerName,
          isActive: true,
        }),
      });
      if (!res.ok) {
        setError(
          await customerMessage(
            res,
            "We could not select this account. Please try again."
          )
        );
        return;
      }
      const saved = await res.json();
      await fetchAssociations();
      // The parent's onSelected calls /api/phone-accounts/fetch-customer, which also
      // refreshes the account's statement figures in the background.
      onSelected?.(saved);
    } catch (err: any) {
      console.error("[AccountSelector] handleSave error", err);
      setError("We could not reach the bank. Check your connection and try again.");
    } finally {
      setBusyAccount(null);
    }
  }

  async function handleSetActive(accountNumber: string) {
    setBusyAccount(accountNumber);
    setError(null);
    try {
      const res = await fetch("/api/phone-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, accountNumber }),
      });
      if (!res.ok) {
        setError(
          await customerMessage(
            res,
            "We could not switch to this account. Please try again."
          )
        );
        return;
      }
      const updated = await res.json();
      await fetchAssociations();
      onSelected?.(updated);
    } catch (err: any) {
      console.error("[AccountSelector] handleSetActive error", err);
      setError("We could not reach the bank. Check your connection and try again.");
    } finally {
      setBusyAccount(null);
    }
  }

  // The bank's list first, then saved accounts the bank did not return (e.g. when the
  // bank's service is down), so the customer can still switch between them.
  const options = useMemo<AccountOption[]>(() => {
    const byNumber = new Map<string, AccountOption>();
    for (const ea of externalAccounts ?? []) {
      const accountNumber = String(ea.AccountNumber);
      byNumber.set(accountNumber, {
        accountNumber,
        name: ea.Name,
        status: ea.Status,
        association: associations.find((a) => a.accountNumber === accountNumber),
      });
    }
    for (const a of associations) {
      if (!byNumber.has(a.accountNumber)) {
        byNumber.set(a.accountNumber, {
          accountNumber: a.accountNumber,
          name: a.customerName ?? "",
          association: a,
        });
      }
    }
    return [...byNumber.values()];
  }, [externalAccounts, associations]);

  const isLoading = externalAccounts === null || !associationsLoaded;

  const choose = (option: AccountOption) => {
    if (busyAccount) return;
    if (option.association?.isActive) {
      onSelected?.(option.association);
      return;
    }
    if (option.association) handleSetActive(option.accountNumber);
    else handleSave(option.accountNumber, option.name);
  };

  return (
    <div className="space-y-3">
      {error && <Notice tone="danger">{error}</Notice>}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading your accounts">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3">
              <Skeleton className="h-10 w-10 rounded-xl bg-gray-100" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28 bg-gray-100" />
                <Skeleton className="h-3 w-40 bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : options.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-center">
          <p className="text-sm font-medium text-gray-900">
            {loadFailed ? "We could not load your accounts" : "No accounts found"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {loadFailed
              ? "The bank did not respond. Please try again in a moment."
              : "We found no bank accounts registered to your phone number."}
          </p>
          <BrandButton
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              fetchAssociations();
              fetchExternalAccounts();
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </BrandButton>
        </div>
      ) : (
        <ul className="space-y-2" role="radiogroup" aria-label="Your bank accounts">
          {options.map((option) => {
            const active = !!option.association?.isActive;
            const busy = busyAccount === option.accountNumber;
            return (
              <li key={option.accountNumber}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!!busyAccount && !busy}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink disabled:opacity-60",
                    active
                      ? "border-brand-ink bg-brand-soft"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                      active ? "bg-white text-brand-ink" : "bg-gray-100 text-gray-600"
                    )}
                    aria-hidden
                  >
                    <Landmark className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold tabular-nums">
                      {maskAccount(option.accountNumber)}
                    </span>
                    <span className="block truncate text-sm text-gray-500">
                      {titleCaseName(option.name) || "Bank account"}
                      {option.status ? ` · ${option.status}` : ""}
                    </span>
                  </span>
                  {busy ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-ink" aria-label="Saving" />
                  ) : active ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-ink text-white">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                  ) : (
                    <span className="h-6 w-6 rounded-full border-2 border-gray-300" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!isLoading && loadFailed && options.length > 0 && (
        <p className="text-xs text-gray-500">
          The bank did not return your latest accounts, so only saved accounts are shown.
        </p>
      )}
    </div>
  );
}
