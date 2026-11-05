'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/use-auth';
import type { LoanProvider } from '@/lib/types';
import { SearchInput } from '../data-table';
import { useReportExport } from '../report-export-provider';
import { ExportDialog } from './export-dialog';
import { useReportFilters } from './hooks/use-report-filters';
import { REPORT_TABS, SEARCH_PLACEHOLDERS, type ReportFilters, type ReportTab } from './lib/report-filters';
import { ReportSummary } from './report-summary';
import { ReportToolbar } from './report-toolbar';
import { AgingTab } from './tabs/aging-tab';
import { BorrowerPerformanceTab } from './tabs/borrower-performance-tab';
import { CollectionsTab } from './tabs/collections-tab';
import { FundUtilizationTab } from './tabs/fund-utilization-tab';
import { NationalBankTab } from './tabs/national-bank-tab';
import { OverviewTab } from './tabs/overview-tab';
import { useProviderSummaries } from './tabs/provider-summaries';
import { ProviderLoansTab } from './tabs/provider-loans-tab';
import type { ReportTabProps } from './tabs/tab-props';
import { DisbursementsTab, RepaymentsTab } from './tabs/transaction-tabs';

/** The tabs that read the provider summaries ask for them only while they are open. */
function UtilizationPanel({ providers, filters }: { providers: LoanProvider[]; filters: ReportFilters }) {
  return <FundUtilizationTab {...useProviderSummaries(providers, filters)} />;
}

function AgingPanel({ providers, ...props }: ReportTabProps & { providers: LoanProvider[] }) {
  return <AgingTab {...props} summary={useProviderSummaries(providers, props.filters)} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
      {children}
    </div>
  );
}

/**
 * The reports screen. Each tab loads its own page of data when it is opened,
 * sorted, filtered and paged on the server; the view (tab, period, provider,
 * branch, search, page, order) lives in the URL, so it can be shared and
 * survives a reload.
 */
export function ReportsClient({ providers }: { providers: LoanProvider[] }) {
  const { currentUser, isLoading: isAuthLoading } = useAuth();
  const { isExporting } = useReportExport();
  const [exportOpen, setExportOpen] = useState(false);

  const role = currentUser?.role;
  const isSuperAdminOrRecon = role === 'Super Admin' || role === 'Reconciliation';
  // District and Branch users don't manage provider funds: no Fund Utilization.
  const showUtilization = role !== 'District' && role !== 'Branch';
  const managedBranchCodes: number[] | null | undefined = currentUser?.managedBranchCodes;
  const branchCodes = useMemo<number[]>(
    () => (role === 'District' ? (managedBranchCodes ?? []) : []),
    [role, managedBranchCodes],
  );
  // Users with a loanProviderId are bound to that provider and only see its reports.
  const canViewAllProviders =
    isSuperAdminOrRecon ||
    (!!currentUser?.permissions?.['reports']?.read && providers.length > 1 && !currentUser?.loanProviderId);
  const defaultProvider = canViewAllProviders
    ? 'all'
    : (currentUser?.loanProviderId ?? providers[0]?.id ?? 'none');

  const { filters, update } = useReportFilters(
    defaultProvider,
    (providerId) =>
      canViewAllProviders ? providerId === 'all' || providers.some((p) => p.id === providerId) : providerId === defaultProvider,
    (branch) => branch === 'all' || branchCodes.some((code) => String(code) === branch),
  );
  const onSearch = useCallback((search: string) => update({ search }), [update]);

  const tabs = REPORT_TABS.filter((t) => t.id !== 'utilization' || showUtilization);
  const tab: ReportTab = tabs.some((t) => t.id === filters.tab) ? filters.tab : 'overview';
  const view = useMemo(() => ({ ...filters, tab }), [filters, tab]);
  const providersInView = useMemo(
    () => (view.providerId === 'all' ? providers : providers.filter((p) => p.id === view.providerId)),
    [providers, view.providerId],
  );

  if (isAuthLoading) {
    return (
      <Shell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Shell>
    );
  }

  if (defaultProvider === 'none') {
    return (
      <Shell>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You are not currently associated with a loan provider. Please contact an administrator to get access to
              reports.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const tabProps: ReportTabProps = { filters: view, update };
  const searchPlaceholder = SEARCH_PLACEHOLDERS[tab];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex flex-col items-start justify-between gap-2 xl:flex-row xl:items-end">
          <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
          <ReportToolbar
            filters={view}
            update={update}
            providers={providers}
            canViewAllProviders={canViewAllProviders}
            branchCodes={branchCodes}
            onExport={() => setExportOpen(true)}
            isExporting={isExporting}
          />
        </div>

        <ExportDialog open={exportOpen} onOpenChange={setExportOpen} filters={view} showUtilization={showUtilization} />

        {tab !== 'overview' ? (
          <>
            <ReportSummary filters={view} />
            <SearchInput
              label="Search reports"
              value={view.search}
              onChange={onSearch}
              placeholder={searchPlaceholder ?? 'Search is not available for this report'}
              disabled={!searchPlaceholder}
            />
          </>
        ) : null}

        <Tabs
          value={tab}
          // Paging, order and status filters belong to the tab they were set on.
          onValueChange={(next) =>
            update({ tab: next as ReportTab, sort: undefined, status: undefined, agingClass: undefined })
          }
          className="space-y-4"
        >
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max">
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="overview" className="m-0">
            <OverviewTab filters={view} />
          </TabsContent>
          <TabsContent value="loans" className="m-0">
            <ProviderLoansTab {...tabProps} />
          </TabsContent>
          <TabsContent value="disbursements" className="m-0">
            <DisbursementsTab {...tabProps} />
          </TabsContent>
          <TabsContent value="repayments" className="m-0">
            <RepaymentsTab {...tabProps} />
          </TabsContent>
          <TabsContent value="collections" className="m-0">
            <CollectionsTab {...tabProps} />
          </TabsContent>
          {showUtilization ? (
            <TabsContent value="utilization" className="m-0">
              <UtilizationPanel providers={providersInView} filters={view} />
            </TabsContent>
          ) : null}
          <TabsContent value="aging" className="m-0">
            <AgingPanel {...tabProps} providers={providersInView} />
          </TabsContent>
          <TabsContent value="borrowers" className="m-0">
            <BorrowerPerformanceTab {...tabProps} />
          </TabsContent>
          <TabsContent value="national-bank" className="m-0">
            <NationalBankTab {...tabProps} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
