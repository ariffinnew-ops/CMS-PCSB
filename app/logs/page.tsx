"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getLoginLogs, type LoginLogEntry } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export default function LoginLogsPage() {
  const [logs, setLogs] = useState<LoginLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    const data = await getLoginLogs();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-amber-100 text-amber-700";
      case "datalogger": return "bg-blue-100 text-blue-700";
      case "guest": return "bg-slate-100 text-slate-700";
      default: return "bg-red-100 text-red-700";
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4 animate-in fade-in duration-300">
        {/* HEADER BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Login Logs</h1>
              <p className="text-xs text-muted-foreground">Authentication activity history</p>
            </div>
          </div>
          
          <Button
            onClick={fetchLogs}
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{logs.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Logs</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{logs.filter(l => l.success).length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Successful</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{logs.filter(l => !l.success).length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Failed</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">
              {new Set(logs.filter(l => l.success).map(l => l.username)).size}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Unique Users</p>
          </div>
        </div>

        {/* LOGS TABLE */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">#</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Timestamp</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Username</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-foreground capitalize">{log.username}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium capitalize ${getRoleBadgeColor(log.role)}`}>
                        {log.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {log.success ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <p className="text-sm text-muted-foreground">No login logs recorded yet</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER INFO */}
        <div className="text-xs text-muted-foreground px-1">
          Showing last 100 login attempts
        </div>
      </div>
    </AppShell>
  );
}
