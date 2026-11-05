'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useReportExport } from '../report-export-provider';
import {
  EXPORT_SHEETS,
  periodLabel,
  reportUrl,
  scopeParams,
  TAB_EXPORT_SHEETS,
  type ReportFilters,
} from './lib/report-filters';

/** The export's request: the filters in view; one tab's export also takes its status, class and order. */
export function exportQuery(filters: ReportFilters, sheets: string[], tabOnly: boolean): Record<string, string> {
  return {
    ...scopeParams(filters),
    sheets: sheets.join(','),
    ...(filters.search && { search: filters.search }),
    ...(tabOnly && filters.status && { status: filters.status }),
    ...(tabOnly && filters.agingClass && { class: filters.agingClass }),
    ...(tabOnly && filters.sort && { sortBy: filters.sort.by, sortDir: filters.sort.dir }),
  };
}

/**
 * Picks the reports to export. The workbook is built on the server in one
 * request (each report read once, in full) and downloads when it is ready; the
 * export keeps running, with its progress in the corner, if the user moves on
 * to another page.
 */
export function ExportDialog({
  open,
  onOpenChange,
  filters,
  showUtilization,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ReportFilters;
  showUtilization: boolean;
}) {
  const { isExporting, runExport } = useReportExport();
  const available = useMemo(
    () => EXPORT_SHEETS.filter((s) => showUtilization || !('utilizationOnly' in s && s.utilizationOnly)),
    [showUtilization],
  );
  const currentTab = useMemo(
    () => (TAB_EXPORT_SHEETS[filters.tab] ?? []).filter((id) => available.some((s) => s.id === id)),
    [filters.tab, available],
  );
  const [ticked, setTicked] = useState<string[]>(() => EXPORT_SHEETS.map((s) => s.id));
  // In workbook order, whatever order they were ticked in; sheets hidden from
  // the user's role never count, even if ticked before the role was known.
  const selected: string[] = available.map((s) => s.id).filter((id) => ticked.includes(id));

  const toggle = (id: string) =>
    setTicked((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const run = () => {
    const sheets = selected;
    const tabOnly = currentTab.length > 0 && sheets.length === currentTab.length && currentTab.every((id) => sheets.includes(id));
    const url = reportUrl('/api/reports/export', exportQuery(filters, sheets, tabOnly));
    onOpenChange(false);
    void runExport('Exporting reports to Excel', async (ctl) => {
      ctl.update(() => ({ done: 0, total: 0, phase: 'building' }));
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not generate the Excel file.');
      }
      const fileName =
        /filename="([^"]+)"/i.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'LoanFlow_Report.xlsx';
      ctl.update((p) => ({ ...p, phase: 'generating' }));
      saveAs(await response.blob(), fileName);
      return { fileName };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose reports to export</DialogTitle>
          <DialogDescription>
            Each selected report becomes its own sheet in the workbook. The current filters ({periodLabel(filters)}
            {filters.search ? `, search “${filters.search}”` : ''}) apply to all of them; exporting just this tab also
            keeps its status filter and sort order.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {available.map((sheet) => (
            <label key={sheet.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
              <Checkbox checked={selected.includes(sheet.id)} onCheckedChange={() => toggle(sheet.id)} />
              <span className="text-sm">{sheet.label}</span>
            </label>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setTicked(available.map((s) => s.id))}>
              Select all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setTicked([])}>
              Clear
            </Button>
            {currentTab.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setTicked(currentTab)}>
                This tab only
              </Button>
            ) : null}
          </div>
          <Button type="button" onClick={run} disabled={selected.length === 0 || isExporting}>
            <Download className="mr-2 h-4 w-4" />
            Export {selected.length} report{selected.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
