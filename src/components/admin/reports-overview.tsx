"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { DateRange } from "react-day-picker";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

type AgingRow = { bucket: string; loans: number; amount: number };
type TrendPoint = { period: string; disbursed: number; collected: number };

type OverviewData = {
  scope: { providerId: string; from: string | null; to: string | null; timeframe: string };
  kpis: {
    disbursedAmount: number;
    loansDisbursed: number;
    uniqueBorrowers: number;
    avgLoanSize: number;
    collectedAmount: number;
    repaymentCount: number;
    collectionRate: number;
    outstandingPrincipal: number;
    outstandingBalance: number;
    outstandingLoans: number;
    overduePrincipal: number;
    overdueBalance: number;
    overdueLoans: number;
    parRatio: number;
  };
  income: {
    principal: number;
    interest: number;
    serviceFee: number;
    penalty: number;
    tax: number;
    total: number;
  };
  aging: AgingRow[];
  trend: {
    granularity: "day" | "month";
    clamped: boolean;
    from: string;
    to: string;
    points: TrendPoint[];
  };
  generatedAt: string;
};

const fullCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

// Stat tiles and axis ticks auto-compact; tables and tooltips stay exact.
const compactCurrency = (value: number) => {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);
};

const compactNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);

const formatPercent = (value: number) => `${(value || 0).toFixed(1)}%`;

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
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-popover-foreground">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-popover-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">
            {fullCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReportsOverview({
  providerId,
  timeframe,
  dateRange,
  branchCode,
  periodLabel,
}: {
  providerId: string | null;
  timeframe: string;
  dateRange?: DateRange;
  branchCode: string;
  periodLabel: string;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTrendTable, setShowTrendTable] = useState(false);
  const [showAgingTable, setShowAgingTable] = useState(false);

  // The app wires dark mode through a class (tailwind darkMode: ['class']) and
  // ships no toggle, so the mode is read once rather than observed.
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);
  const theme = isDark ? PALETTE.dark : PALETTE.light;

  const fetchOverview = useCallback(async () => {
    if (!providerId || providerId === "none") return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ providerId, timeframe });
      if (dateRange?.from) params.set("from", dateRange.from.toISOString());
      if (dateRange?.to) params.set("to", dateRange.to.toISOString());
      if (branchCode && branchCode !== "all") params.set("branchCode", branchCode);

      const response = await fetch(`/api/reports/overview?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch overview data");
      }
      setData(await response.json());
    } catch (error: any) {
      toast({
        title: "Error fetching overview",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [providerId, timeframe, dateRange, branchCode, toast]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const trendData = useMemo(() => {
    if (!data) return [];
    return data.trend.points.map((point) => {
      const parsed =
        data.trend.granularity === "day"
          ? parse(point.period, "yyyy-MM-dd", new Date())
          : parse(point.period, "yyyy-MM", new Date());
      return {
        ...point,
        label: format(parsed, data.trend.granularity === "day" ? "MMM d" : "MMM yy"),
      };
    });
  }, [data]);

  const agingTotal = useMemo(
    () => (data?.aging ?? []).reduce((sum, row) => sum + row.amount, 0),
    [data]
  );

  if (!data && isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Building overview…
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Overview unavailable</CardTitle>
          <CardDescription>
            The summary could not be loaded for the current selection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={fetchOverview}>
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
    <div className={cn("space-y-4", isLoading && "pointer-events-none opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {periodLabel} · generated {format(new Date(data.generatedAt), "MMM d, yyyy HH:mm")}
        </p>
        <Button variant="ghost" size="sm" onClick={fetchOverview} disabled={isLoading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Disbursed"
          value={compactCurrency(kpis.disbursedAmount)}
          hint={`${compactNumber(kpis.loansDisbursed)} loans in period`}
          icon={TrendingUp}
        />
        <StatTile
          label="Collected"
          value={compactCurrency(kpis.collectedAmount)}
          hint={`${compactNumber(kpis.repaymentCount)} repayments received`}
          icon={TrendingDown}
        />
        <StatTile
          label="Outstanding"
          value={compactCurrency(kpis.outstandingBalance)}
          hint={`${compactNumber(kpis.outstandingLoans)} unpaid loans, as of today`}
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
          value={compactNumber(kpis.uniqueBorrowers)}
          hint="Unique borrowers disbursed in period"
          icon={Users}
        />
        <StatTile
          label="Average loan size"
          value={compactCurrency(kpis.avgLoanSize)}
          hint="Disbursed ÷ loan count"
          icon={Banknote}
        />
        <StatTile
          label="Overdue portfolio"
          value={compactCurrency(kpis.overdueBalance)}
          hint={`${compactNumber(kpis.overdueLoans)} loans past due date`}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTrendTable((prev) => !prev)}
          >
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
                      <TableCell className="text-right tabular-nums">
                        {fullCurrency(point.disbursed)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fullCurrency(point.collected)}
                      </TableCell>
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
                  tickFormatter={compactCurrency}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: theme.grid }} />
                <Legend
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(value) => (
                    <span style={{ color: theme.axis }}>{value}</span>
                  )}
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
              <CardDescription>
                Outstanding balance by classification, as of today
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAgingTable((prev) => !prev)}
            >
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
                      <TableCell className="text-right tabular-nums">
                        {compactNumber(row.loans)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fullCurrency(row.amount)}
                      </TableCell>
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
                <BarChart
                  data={aging}
                  layout="vertical"
                  barCategoryGap={10}
                  margin={{ top: 4, right: 56, left: 8, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke={theme.grid} strokeWidth={1} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: theme.axis }}
                    tickLine={false}
                    axisLine={{ stroke: theme.grid }}
                    tickFormatter={compactCurrency}
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
                      formatter={compactCurrency}
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
                  <dd className="font-medium tabular-nums">{fullCurrency(row.value)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <dt className="font-medium">Total income</dt>
                <dd className="font-semibold tabular-nums">{fullCurrency(income.total)}</dd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">Principal recovered</dt>
                <dd className="tabular-nums">{fullCurrency(income.principal)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
