"use client";

import { useMemo, useState, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { ClientType, TradeType } from "@/lib/types";
import { COMPETENCY_DATA, CREW_DATA } from "@/lib/data";
import { formatDate } from "@/lib/logic";

const COURSES = ["BOSIET", "APC", "ALS", "BLS", "OGUK", "HUET"];

function getStatusInfo(expiryStr: string, today: Date) {
  const d = new Date(expiryStr);
  const diffDays = Math.floor(
    (d.getTime() - today.getTime()) / (1000 * 3600 * 24)
  );

  if (diffDays < 0)
    return {
      label: "Expired",
      color: "bg-red-500",
      textColor: "text-red-400",
      bgLight: "bg-red-500/15",
      border: "border-red-500/30",
      days: Math.abs(diffDays),
      expired: true,
      warning: false,
    };
  if (diffDays < 90)
    return {
      label: "Expiring",
      color: "bg-amber-500",
      textColor: "text-amber-400",
      bgLight: "bg-amber-500/15",
      border: "border-amber-500/30",
      days: diffDays,
      expired: false,
      warning: true,
    };
  return {
    label: "Valid",
    color: "bg-emerald-500",
    textColor: "text-emerald-400",
    bgLight: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    days: diffDays,
    expired: false,
    warning: false,
  };
}

export default function TrainingMatrixPage() {
  const [clientFilter, setClientFilter] = useState<ClientType | "ALL">("ALL");
  const [tradeFilter, setTradeFilter] = useState<TradeType | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "EXPIRED" | "WARNING" | "VALID"
  >("ALL");
  const today = new Date(2026, 11, 31);

  const filteredCrews = useMemo(() => {
    return CREW_DATA.filter((c) => {
      const matchesClient = clientFilter === "ALL" || c.client === clientFilter;
      const matchesTrade = tradeFilter === "ALL" || c.trade === tradeFilter;
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.location.toLowerCase().includes(search.toLowerCase());

      if (!matchesClient || !matchesTrade || !matchesSearch) return false;

      // Status filter - check if person has any cert matching status
      if (statusFilter !== "ALL") {
        const hasStatus = COURSES.some((course) => {
          const rec = COMPETENCY_DATA.find(
            (r) => r.crew_name === c.name && r.course_name === course
          );
          if (!rec) return statusFilter === "EXPIRED";
          const info = getStatusInfo(rec.expiry_date, today);
          if (statusFilter === "EXPIRED") return info.expired;
          if (statusFilter === "WARNING") return info.warning;
          if (statusFilter === "VALID") return !info.expired && !info.warning;
          return false;
        });
        if (!hasStatus) return false;
      }

      return true;
    }).sort(
      (a, b) =>
        a.client.localeCompare(b.client) || a.name.localeCompare(b.name)
    );
  }, [clientFilter, tradeFilter, search, statusFilter, today]);

  const getRecord = (name: string, course: string) => {
    return COMPETENCY_DATA.find(
      (r) => r.crew_name === name && r.course_name === course
    );
  };

  // Summary stats
  const stats = useMemo(() => {
    let expired = 0;
    let warning = 0;
    let valid = 0;
    let missing = 0;

    CREW_DATA.forEach((crew) => {
      COURSES.forEach((course) => {
        const rec = getRecord(crew.name, course);
        if (!rec) {
          missing++;
          return;
        }
        const info = getStatusInfo(rec.expiry_date, today);
        if (info.expired) expired++;
        else if (info.warning) warning++;
        else valid++;
      });
    });

    return { expired, warning, valid, missing, total: CREW_DATA.length };
  }, [today]);

  return (
    <AppShell>
      <div className="space-y-4 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">
              Training Matrix
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Medical Certification & Compliance Status
            </p>
          </div>

          {/* Summary Cards */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div>
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                  Valid
                </div>
                <div className="text-lg font-black text-emerald-600 tabular-nums leading-none">
                  {stats.valid}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <div>
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                  {"< 90 Days"}
                </div>
                <div className="text-lg font-black text-amber-600 tabular-nums leading-none">
                  {stats.warning}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <div>
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                  Expired
                </div>
                <div className="text-lg font-black text-red-600 tabular-nums leading-none">
                  {stats.expired}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              <div>
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                  Personnel
                </div>
                <div className="text-lg font-black text-foreground tabular-nums leading-none">
                  {stats.total}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Client
            </label>
            <select
              value={clientFilter}
              onChange={(e) =>
                setClientFilter(e.target.value as ClientType | "ALL")
              }
              className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="SKA">SKA</option>
              <option value="SBA">SBA</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Trade
            </label>
            <select
              value={tradeFilter}
              onChange={(e) =>
                setTradeFilter(e.target.value as TradeType | "ALL")
              }
              className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="OM">OM</option>
              <option value="EM">EM</option>
              <option value="IMP/OHN">OHN</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "ALL" | "EXPIRED" | "WARNING" | "VALID"
                )
              }
              className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="EXPIRED">Expired</option>
              <option value="WARNING">Expiring Soon</option>
              <option value="VALID">Valid</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Search
            </label>
            <input
              type="text"
              placeholder="Name or location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm font-semibold outline-none w-48"
            />
          </div>
          <span className="ml-auto text-[10px] text-muted-foreground font-bold">
            Showing{" "}
            <span className="text-foreground">{filteredCrews.length}</span> of{" "}
            {CREW_DATA.length}
          </span>
        </div>

        {/* Matrix Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th
                    rowSpan={2}
                    className="px-4 py-3 border-r border-slate-700 text-[10px] font-black uppercase tracking-wider sticky left-0 bg-slate-900 z-10 min-w-[60px]"
                  >
                    #
                  </th>
                  <th
                    rowSpan={2}
                    className="px-4 py-3 border-r border-slate-700 text-[10px] font-black uppercase tracking-wider sticky left-[60px] bg-slate-900 z-10 min-w-[220px]"
                  >
                    Personnel
                  </th>
                  <th
                    rowSpan={2}
                    className="px-4 py-3 border-r border-slate-700 text-[10px] font-black uppercase tracking-wider text-center min-w-[70px]"
                  >
                    Trade
                  </th>
                  <th
                    rowSpan={2}
                    className="px-4 py-3 border-r border-slate-700 text-[10px] font-black uppercase tracking-wider text-center min-w-[70px]"
                  >
                    Client
                  </th>
                  {COURSES.map((course) => (
                    <th
                      key={course}
                      colSpan={2}
                      className="px-2 py-2 border-r border-slate-700 text-center text-[10px] font-black uppercase tracking-widest border-b border-slate-700"
                    >
                      {course}
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-800 text-[9px] font-bold text-slate-400 uppercase">
                  {COURSES.map((course) => (
                    <Fragment key={course}>
                      <th className="px-2 py-2 text-center border-r border-slate-700/50 min-w-[80px]">
                        Attended
                      </th>
                      <th className="px-2 py-2 text-center border-r border-slate-700 min-w-[80px]">
                        Expiry
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredCrews.map((crew, idx) => {
                  // Check for group separator
                  const prev = filteredCrews[idx - 1];
                  const showSeparator =
                    !prev || prev.client !== crew.client;

                  return (
                    <Fragment key={`${crew.name}-${idx}`}>
                      {showSeparator && (
                        <tr className="bg-slate-100 dark:bg-slate-800/50">
                          <td
                            colSpan={4 + COURSES.length * 2}
                            className="px-4 py-2 sticky left-0"
                          >
                            <span
                              className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider ${
                                crew.client === "SKA"
                                  ? "text-blue-600"
                                  : "text-orange-600"
                              }`}
                            >
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  crew.client === "SKA"
                                    ? "bg-blue-500"
                                    : "bg-orange-500"
                                }`}
                              />
                              {crew.client} Project
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-muted/50 transition-colors group">
                        <td className="px-4 py-2.5 border-r border-border/30 sticky left-0 bg-card group-hover:bg-muted/50 z-10 text-xs text-muted-foreground font-bold tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-2.5 border-r border-border/30 sticky left-[60px] bg-card group-hover:bg-muted/50 z-10">
                          <div className="text-xs font-bold text-foreground uppercase">
                            {crew.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {crew.location}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 border-r border-border/30 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              crew.trade === "OM"
                                ? "bg-blue-500/15 text-blue-600 border border-blue-500/30"
                                : crew.trade === "EM"
                                  ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-600 border border-amber-500/30"
                            }`}
                          >
                            {crew.trade}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 border-r border-border/30 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              crew.client === "SKA"
                                ? "bg-blue-500/15 text-blue-600 border border-blue-500/30"
                                : "bg-orange-500/15 text-orange-600 border border-orange-500/30"
                            }`}
                          >
                            {crew.client}
                          </span>
                        </td>
                        {COURSES.map((course) => {
                          const rec = getRecord(crew.name, course);
                          if (!rec) {
                            return (
                              <Fragment key={course}>
                                <td className="px-2 py-2.5 text-[10px] text-center text-muted-foreground/40 border-r border-border/20">
                                  --
                                </td>
                                <td className="px-2 py-2.5 text-[10px] text-center text-muted-foreground/40 border-r border-border/30">
                                  --
                                </td>
                              </Fragment>
                            );
                          }
                          const info = getStatusInfo(rec.expiry_date, today);
                          return (
                            <Fragment key={course}>
                              <td className="px-2 py-2.5 text-[10px] text-center text-muted-foreground border-r border-border/20 tabular-nums">
                                {formatDate(rec.attended_date)}
                              </td>
                              <td
                                className={`px-2 py-2.5 text-[10px] font-bold text-center border-r border-border/30 tabular-nums ${info.bgLight} ${info.textColor} ${info.border} border-l`}
                              >
                                {formatDate(rec.expiry_date)}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
                {filteredCrews.length === 0 && (
                  <tr>
                    <td
                      colSpan={4 + COURSES.length * 2}
                      className="px-4 py-12 text-center"
                    >
                      <p className="text-sm text-muted-foreground">
                        No personnel match the selected filters
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 px-4 py-2.5 bg-card rounded-xl border border-border w-fit text-[10px] font-bold uppercase text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500/15 rounded border border-emerald-500/30" />
            <span className="text-emerald-600">Valid</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500/15 rounded border border-amber-500/30" />
            <span className="text-amber-600">{"Expiring < 90 Days"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500/15 rounded border border-red-500/30" />
            <span className="text-red-600">Expired</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
