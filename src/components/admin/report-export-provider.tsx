"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type ExportPhase = "fetching" | "generating";

export interface ExportProgress {
  done: number;
  total: number;
  phase: ExportPhase;
}

export interface ExportController {
  update: (updater: (progress: ExportProgress) => ExportProgress) => void;
}

interface ExportJob {
  label: string;
  status: "running" | "success" | "error";
  progress: ExportProgress;
  fileName?: string;
  error?: string;
}

interface ReportExportContextValue {
  isExporting: boolean;
  runExport: (
    label: string,
    task: (ctl: ExportController) => Promise<{ fileName?: string } | void>
  ) => Promise<void>;
}

const ReportExportContext = createContext<ReportExportContextValue | null>(
  null
);

export function useReportExport() {
  const ctx = useContext(ReportExportContext);
  if (!ctx) {
    throw new Error(
      "useReportExport must be used within a ReportExportProvider"
    );
  }
  return ctx;
}

/**
 * Runs report exports at the admin layout level so they keep going — and stay
 * visible via the floating progress widget — while the user navigates between
 * pages. Only one export can run at a time.
 */
export function ReportExportProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [job, setJob] = useState<ExportJob | null>(null);
  const runningRef = useRef(false);

  const runExport = useCallback(
    async (
      label: string,
      task: (ctl: ExportController) => Promise<{ fileName?: string } | void>
    ) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setJob({
        label,
        status: "running",
        progress: { done: 0, total: 0, phase: "fetching" },
      });

      const ctl: ExportController = {
        update: (updater) =>
          setJob((j) =>
            j && j.status === "running"
              ? { ...j, progress: updater(j.progress) }
              : j
          ),
      };

      try {
        const result = await task(ctl);
        setJob((j) =>
          j ? { ...j, status: "success", fileName: result?.fileName } : j
        );
      } catch (err: any) {
        console.error("Report export failed", err);
        setJob((j) =>
          j
            ? { ...j, status: "error", error: err?.message || "Export failed." }
            : j
        );
      } finally {
        runningRef.current = false;
      }
    },
    []
  );

  // Auto-dismiss the widget a few seconds after a successful export
  useEffect(() => {
    if (job?.status !== "success") return;
    const timer = setTimeout(() => setJob(null), 8000);
    return () => clearTimeout(timer);
  }, [job?.status]);

  return (
    <ReportExportContext.Provider
      value={{ isExporting: job?.status === "running", runExport }}
    >
      {children}
      {job && <ExportWidget job={job} onDismiss={() => setJob(null)} />}
    </ReportExportContext.Provider>
  );
}

function ExportWidget({
  job,
  onDismiss,
}: {
  job: ExportJob;
  onDismiss: () => void;
}) {
  const { status, progress } = job;
  const percent =
    status === "success" || progress.phase === "generating"
      ? 100
      : progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-card text-card-foreground shadow-lg animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={cn(
            "mt-0.5 shrink-0 rounded-full p-2",
            status === "error"
              ? "bg-destructive/10 text-destructive"
              : status === "success"
              ? "bg-green-600/10 text-green-600"
              : "bg-primary/10 text-primary"
          )}
        >
          {status === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : status === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 animate-pulse" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold leading-tight">
              {status === "running"
                ? job.label
                : status === "success"
                ? "Report downloaded"
                : "Export failed"}
            </p>
            {status !== "running" && (
              <button
                onClick={onDismiss}
                aria-label="Dismiss"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {status === "running" && (
            <>
              <Progress value={percent} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {progress.phase === "generating"
                  ? "Building Excel file…"
                  : progress.total > 0
                  ? `Fetching report data · ${progress.done}/${progress.total} pages · ${percent}%`
                  : "Preparing export…"}
              </p>
            </>
          )}
          {status === "success" && (
            <p className="truncate text-xs text-muted-foreground">
              {job.fileName || "Saved to your downloads folder."}
            </p>
          )}
          {status === "error" && (
            <p className="text-xs text-destructive">{job.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
