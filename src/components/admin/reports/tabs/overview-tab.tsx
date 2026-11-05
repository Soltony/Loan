"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parse } from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  Banknote,
  Loader2,
  Percent,
  RefreshCw,
  Table2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useReportQuery } from "../hooks/use-report-query";
import { formatCompact, formatCount, formatMoney } from "../lib/format";
import { periodLabel, reportUrl, scopeParams, type ReportFilters } from "../lib/report-filters";
import type { OverviewData } from "../types";

// ---------------------------------------------------------------------------
// Palette
//
// Every value below was produced by the dataviz palette validator rather than
// picked by eye, and re-running it is the way to change them:
//
//   Trend (categorical, 2 series)
//     light: node validate_palette.js "#e76e50,#2a9d90" --mode light --surface "#ffffff"
//     dark:  node validate_palette.js "#2662d9,#24ab7c" --mode dark  --surface "#020817"
//   Aging (ordinal severity ramp, Pass -> Loss)
//     light: node validate_palette.js "#f87171,#e93a3a,#c92a2a,#9b1c1c,#6b1212" --ordinal --mode light --surface "#ffffff"
//     dark:  node validate_palette.js "#8f2222,#b83030,#dc4444,#ef6b6b,#fca5a5" --ordinal --mode dark  --surface "#020817"
//
// The light steps mirror the app's --chart-1/--chart-2 tokens; the dark steps are
// chosen for the dark surface (--chart-2 sits above the dark lightness band), not
// flipped automatically.
// ---------------------------------------------------------------------------
const PALETTE = {
  light: {
    disbursed: "#e76e50",
    collected: "#2a9d90",
    // Ordered severity: pale -> deep. Order carries meaning, so it is a one-hue
    // ordinal ramp, never five categorical hues.
    aging: ["#f87171", "#e93a3a", "#c92a2a", "#9b1c1c", "#6b1212"],
    grid: "#e8ecf1",
    axis: "#64748b",
    text: "#0f172a",
    surface: "#ffffff",
  },
  dark: {
    disbursed: "#2662d9",
    collected: "#24ab7c",
    aging: ["#8f2222", "#b83030", "#dc4444", "#ef6b6b", "#fca5a5"],
    grid: "#1e293b",
    axis: "#94a3b8",
    text: "#f8fafc",
    surface: "#020817",
  },
};

const formatPercent = (value: number) => `${(value || 0).toFixed(1)}%`;

/** The app's dark mode, a class on <html> (tailwind darkMode: ['class']), watched for changes. */
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

/** Stat tile: label (sentence case) + value + a quiet supporting line. */
function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {/* Proportional figures: tabular-nums makes a display-size number look loose. */}
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-popover-foreground">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-popover-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">{formatMoney(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** The Overall tab: headline figures, the disbursed/collected trend, aging and collected income. */
export function OverviewTab({ filters }: { filters: ReportFilters }) {
  const { data, error, isFetching, refetch } = useReportQuery<OverviewData>(
    reportUrl("/api/reports/overview", scopeParams(filters)),
  );
  const [showTrendTable, setShowTrendTable] = useState(false);
  const [showAgingTable, setShowAgingTable] = useState(false);
  const theme = useIsDark() ? PALETTE.dark : PALETTE.light;

  const trendData = useMemo(() => {
    if (!data?.trend) return [];
    return data.trend.points.map((point) => {
      const parsed =
        data.trend.granularity === "day"
          ? parse(point.period, "yyyy-MM-dd", new Date())
          : parse(point.period, "yyyy-MM", new Date());
      return { ...point, label: format(parsed, data.trend.granularity === "day" ? "MMM d" : "MMM yy") };
    });
  }, [data]);

  const agingTotal = useMemo(() => (data?.aging ?? []).reduce((sum, row) => sum + row.amount, 0), [data]);

  if (!data && !error) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Building overview…
      </div>
    );
  }

  if (!data || !data.trend) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Overview unavailable</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "The summary could not be loaded for the current selection."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={refetch}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { kpis, income, aging } = data;

  return (
    // Refetches hold the previous render at reduced opacity instead of flashing
    // a skeleton, so the cards never jump.
    <div className={cn("space-y-4", isFetching && "pointer-events-none opacity-60")} aria-busy={isFetching}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {periodLabel(filters)} · generated {format(new Date(data.generatedAt), "MMM d, yyyy HH:mm")}
        </p>
        {error ? (
          <p className="text-xs text-destructive">
            Could not refresh: {error instanceof Error ? error.message : "Something went wrong."}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Disbursed"
          value={formatCompact(kpis.disbursedAmount)}
          hint={`${formatCount(kpis.loansDisbursed)} loans in period`}
          icon={TrendingUp}
        />
        <StatTile
          label="Collected"
          value={formatCompact(kpis.collectedAmount)}
          hint={`${formatCount(kpis.repaymentCount)} repayments received`}
          icon={TrendingDown}
        />
        <StatTile
          label="Outstanding"
          value={formatCompact(kpis.outstandingBalance)}
          hint={`${formatCount(kpis.outstandingLoans)} unpaid loans, as of today`}
          icon={Wallet}
        />
        {/* Deliberately not called a "collection rate": collections in a period
            include repayments of loans disbursed earlier, so this legitimately
            exceeds 100% (May 2026 in dev data reads 134.6%). */}
        <StatTile
          label="Collections vs disbursements"
          value={formatPercent(kpis.collectionRate)}
          hint="Over 100% means older loans are repaying"
          icon={Percent}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Borrowers served"
          value={formatCount(kpis.uniqueBorrowers)}
          hint="Unique borrowers disbursed in period"
          icon={Users}
        />
        <StatTile
          label="Average loan size"
          value={formatCompact(kpis.avgLoanSize)}
          hint="Disbursed ÷ loan count"
          icon={Banknote}
        />
        <StatTile
          label="Overdue portfolio"
          value={formatCompact(kpis.overdueBalance)}
          hint={`${formatCount(kpis.overdueLoans)} loans past due date`}
          icon={AlertTriangle}
        />
        <StatTile
          label="Portfolio at risk"
          value={formatPercent(kpis.parRatio)}
          hint="Overdue ÷ outstanding balance"
          icon={BarChart3}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Disbursed vs collected</CardTitle>
            <CardDescription>
              {data.trend.granularity === "day" ? "Daily" : "Monthly"} totals
              {data.trend.clamped ? " · last 12 months" : ""}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowTrendTable((prev) => !prev)}>
            <Table2 className="mr-2 h-4 w-4" />
            {showTrendTable ? "Chart" : "Table"}
          </Button>
        </CardHeader>
        <CardContent>
          {showTrendTable ? (
            <div className="max-h-[320px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Disbursed</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trendData.map((point) => (
                    <TableRow key={point.period}>
                      <TableCell>{point.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(point.disbursed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(point.collected)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                {/* Solid hairline grid, one step off the surface — never dashed. */}
                <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: theme.axis }}
                  tickLine={false}
                  axisLine={{ stroke: theme.grid }}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: theme.axis }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={formatCompact}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: theme.grid }} />
                <Legend
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(value) => <span style={{ color: theme.axis }}>{value}</span>}
                />
                <Line
                  type="monotone"
                  dataKey="disbursed"
                  name="Disbursed"
                  stroke={theme.disbursed}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
                />
                <Line
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke={theme.collected}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Aging distribution</CardTitle>
              <CardDescription>Outstanding balance by classification, as of today</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowAgingTable((prev) => !prev)}>
              <Table2 className="mr-2 h-4 w-4" />
              {showAgingTable ? "Chart" : "Table"}
            </Button>
          </CardHeader>
          <CardContent>
            {showAgingTable ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Classification</TableHead>
                    <TableHead className="text-right">Loans</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aging.map((row) => (
                    <TableRow key={row.bucket}>
                      <TableCell>{row.bucket}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(row.loans)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : agingTotal === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No overdue loans in scope.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={aging} layout="vertical" barCategoryGap={10} margin={{ top: 4, right: 56, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={theme.grid} strokeWidth={1} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: theme.axis }}
                    tickLine={false}
                    axisLine={{ stroke: theme.grid }}
                    tickFormatter={formatCompact}
                  />
                  <YAxis
                    type="category"
                    dataKey="bucket"
                    tick={{ fontSize: 12, fill: theme.axis }}
                    tickLine={false}
                    axisLine={false}
                    width={110}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "transparent" }} />
                  {/* One ordered series: no legend box, values labelled at the tip. */}
                  <Bar dataKey="amount" name="Outstanding" barSize={20} radius={[0, 4, 4, 0]}>
                    {aging.map((row, index) => (
                      <Cell key={row.bucket} fill={theme.aging[index]} />
                    ))}
                    <LabelList
                      dataKey="amount"
                      position="right"
                      fill={theme.axis}
                      fontSize={12}
                      formatter={formatCompact}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Collected income</CardTitle>
            <CardDescription>Ledger-recorded receipts for the period</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Four numbers are not a chart — they are four numbers. */}
            <dl className="space-y-3">
              {[
                { label: "Interest", value: income.interest },
                { label: "Service fee", value: income.serviceFee },
                { label: "Penalty", value: income.penalty },
                { label: "Tax withheld", value: income.tax },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-medium tabular-nums">{formatMoney(row.value)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <dt className="font-medium">Total income</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(income.total)}</dd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">Principal recovered</dt>
                <dd className="tabular-nums">{formatMoney(income.principal)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
