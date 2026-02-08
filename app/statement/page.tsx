"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow, TradeType } from "@/lib/types";
import { getPivotedRosterData, getCrewMasterData, type CrewMasterRecord } from "@/lib/actions";
import { safeParseDate, shortenPost, getTradeRank, formatDate } from "@/lib/logic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface StatementRow {
  crew_id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  salary: number;
  fixedAllowance: number;
  totalDays: number;
  offshoreAllowance: number;
  reliefAllowance: number;
  standbyAllowance: number;
  medevacCount: number;
  medevacAllowance: number;
  grandTotal: number;
  cycles: {
    cycleNum: number;
    sign_on: string | null;
    sign_off: string | null;
    days: number;
    is_offshore: boolean;
    relief_all: number;
    standby_all: number;
    medevac_dates: string[];
    notes: string | null;
  }[];
}

export default function StatementPage() {
  const [data, setData] = useState<PivotedCrewRow[]>([]);
  const [masterData, setMasterData] = useState<CrewMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [tradeFilter, setTradeFilter] = useState<TradeType | "ALL">("ALL");
  const [clientFilter, setClientFilter] = useState<"ALL" | "SBA" | "SKA">("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([getPivotedRosterData(), getCrewMasterData()]).then(([pivotedData, master]) => {
      setData(pivotedData);
      setMasterData(master);
      setLoading(false);
    });
  }, []);

  // Build master lookup by crew_name (uppercase trimmed for matching)
  const masterMap = useMemo(() => {
    const map = new Map<string, CrewMasterRecord>();
    for (const m of masterData) {
      map.set((m.crew_name || "").toUpperCase().trim(), m);
    }
    return map;
  }, [masterData]);

  const [selectedYear, selectedMonthNum] = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return [y, m];
  }, [selectedMonth]);

  // Calculate statement rows
  const statementRows = useMemo(() => {
    const monthStart = new Date(selectedYear, selectedMonthNum - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(selectedYear, selectedMonthNum, 0, 23, 59, 59, 999);
    const monthStartTime = monthStart.getTime();
    const monthEndTime = monthEnd.getTime();

    const rows: StatementRow[] = [];

    for (const crew of data) {
      const isOM = (crew.post || "").toUpperCase().includes("OFFSHORE MEDIC");
      const isEM = (crew.post || "").toUpperCase().includes("ESCORT MEDIC");

      // Lookup master rates
      const master = masterMap.get((crew.crew_name || "").toUpperCase().trim());
      const salary = master?.salary ?? 0;
      const fixedAllowance = master?.fixed_allowance ?? 0;
      const oaRate = master?.oa_rate ?? 0;
      const medevacRate = master?.medevac_rate ?? 0;

      const cycleDetails: StatementRow["cycles"] = [];
      let totalDays = 0;
      let totalRelief = 0;
      let totalStandby = 0;
      let medevacCount = 0;
      let offshoreEligibleDays = 0;

      for (const [cycleNumStr, cycle] of Object.entries(crew.cycles)) {
        const signOn = safeParseDate(cycle.sign_on);
        const signOff = safeParseDate(cycle.sign_off);

        if (!signOn || !signOff) continue;

        const rotStart = signOn.getTime();
        const rotEnd = signOff.getTime();
        if (rotStart > monthEndTime || rotEnd < monthStartTime) continue;

        const effectiveStart = Math.max(rotStart, monthStartTime);
        const effectiveEnd = Math.min(rotEnd, monthEndTime);
        const daysInMonth = Math.ceil((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1;

        if (daysInMonth <= 0) continue;

        totalDays += daysInMonth;

        const isOffshore = cycle.is_offshore !== false;
        if (isOM && isOffshore) {
          offshoreEligibleDays += daysInMonth;
        }

        const reliefVal = cycle.relief_all ?? 0;
        const standbyVal = cycle.standby_all ?? 0;
        totalRelief += reliefVal;
        totalStandby += standbyVal;

        const cycleMedevacDates = (cycle.medevac_dates || []).filter((d) => {
          const md = safeParseDate(d);
          if (!md) return false;
          return md.getTime() >= monthStartTime && md.getTime() <= monthEndTime;
        });
        medevacCount += cycleMedevacDates.length;

        cycleDetails.push({
          cycleNum: parseInt(cycleNumStr),
          sign_on: cycle.sign_on,
          sign_off: cycle.sign_off,
          days: daysInMonth,
          is_offshore: isOffshore,
          relief_all: reliefVal,
          standby_all: standbyVal,
          medevac_dates: cycleMedevacDates,
          notes: cycle.notes,
        });
      }

      if (cycleDetails.length === 0) continue;

      const offshoreAllowance = isOM ? offshoreEligibleDays * oaRate : 0;
      const medevacAllowance = isEM ? medevacCount * medevacRate : 0;
      const reliefAllowance = totalRelief;
      const standbyAllowance = totalStandby;
      const grandTotal = salary + fixedAllowance + offshoreAllowance + medevacAllowance + reliefAllowance + standbyAllowance;

      rows.push({
        crew_id: crew.crew_id,
        crew_name: crew.crew_name,
        post: crew.post,
        client: crew.client,
        location: crew.location,
        salary,
        fixedAllowance,
        totalDays,
        offshoreAllowance,
        reliefAllowance,
        standbyAllowance,
        medevacCount,
        medevacAllowance,
        grandTotal,
        cycles: cycleDetails.sort((a, b) => a.cycleNum - b.cycleNum),
      });
    }

    return rows.sort((a, b) => {
      const rankA = getTradeRank(a.post);
      const rankB = getTradeRank(b.post);
      if (rankA !== rankB) return rankA - rankB;
      return a.crew_name.localeCompare(b.crew_name);
    });
  }, [data, masterMap, selectedYear, selectedMonthNum]);

  const filteredRows = useMemo(() => {
    return statementRows.filter((row) => {
      const matchesSearch = !search.trim() || row.crew_name.toLowerCase().includes(search.toLowerCase());
      const matchesTrade =
        tradeFilter === "ALL" ||
        (tradeFilter === "OM" && row.post?.includes("OFFSHORE MEDIC")) ||
        (tradeFilter === "EM" && row.post?.includes("ESCORT MEDIC")) ||
        (tradeFilter === "IMP/OHN" && (row.post?.includes("IM") || row.post?.includes("OHN")));
      const matchesClient = clientFilter === "ALL" || row.client === clientFilter;
      return matchesSearch && matchesTrade && matchesClient;
    });
  }, [statementRows, search, tradeFilter, clientFilter]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => ({
        salary: acc.salary + row.salary,
        fixedAllowance: acc.fixedAllowance + row.fixedAllowance,
        days: acc.days + row.totalDays,
        offshore: acc.offshore + row.offshoreAllowance,
        relief: acc.relief + row.reliefAllowance,
        standby: acc.standby + row.standbyAllowance,
        medevac: acc.medevac + row.medevacAllowance,
        grand: acc.grand + row.grandTotal,
      }),
      { salary: 0, fixedAllowance: 0, days: 0, offshore: 0, relief: 0, standby: 0, medevac: 0, grand: 0 }
    );
  }, [filteredRows]);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const formatRM = (val: number) => {
    if (val === 0) return "-";
    return `RM ${val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <AppShell>
      <div className="space-y-4 animate-in fade-in duration-500 mt-2">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none">
              MONTHLY STATEMENT
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
              Full cost calculation for {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <label className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Period</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Client</label>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value as "ALL" | "SBA" | "SKA")}
                className="bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="ALL">All Clients</option>
                <option value="SBA">SBA</option>
                <option value="SKA">SKA</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Grade</label>
              <select
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value as TradeType | "ALL")}
                className="bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="ALL">All Trades</option>
                <option value="OM">OM</option>
                <option value="EM">EM</option>
                <option value="IMP/OHN">OHN</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Search</label>
              <input
                type="text"
                placeholder="Name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-slate-400 w-36"
              />
            </div>
          </div>
        </div>

        {/* INFO BAR */}
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm">
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Rates fetched from cms_pcsb_master</span>
          <span className="text-[8px] text-muted-foreground">|</span>
          <span className="text-[8px] font-bold text-muted-foreground">
            Total = Salary + Fixed Allowance + Offshore + Relief + Standby + Medevac
          </span>
        </div>

        {/* TABLE */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-12 text-center">
            <p className="text-muted-foreground text-sm font-medium">No active rotations found for {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}.</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[1100px]">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest sticky left-0 bg-slate-900 z-10">Crew</th>
                    <th className="px-2 py-3 text-center text-[9px] font-black uppercase tracking-widest">Post</th>
                    <th className="px-2 py-3 text-center text-[9px] font-black uppercase tracking-widest">Client</th>
                    <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-widest">Salary</th>
                    <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-widest">Fixed All.</th>
                    <th className="px-2 py-3 text-center text-[9px] font-black uppercase tracking-widest">Days</th>
                    <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-widest">Offshore</th>
                    <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-widest">Relief</th>
                    <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-widest">Standby</th>
                    <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-widest">Medevac</th>
                    <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map((row) => {
                    const isExpanded = expandedRow === row.crew_id;
                    return (
                      <tr key={row.crew_id} className="group">
                        <td colSpan={11} className="p-0">
                          <button
                            type="button"
                            onClick={() => setExpandedRow(isExpanded ? null : row.crew_id)}
                            className="w-full flex items-center hover:bg-muted/50 transition-colors min-w-[1100px]"
                          >
                            <div className="px-3 py-2.5 text-left shrink-0" style={{ width: "180px" }}>
                              <span className="text-[10px] font-black text-foreground uppercase tracking-tight block truncate">{row.crew_name}</span>
                              <span className="text-[8px] font-medium text-muted-foreground">{row.location}</span>
                            </div>
                            <div className="px-2 py-2.5 text-center shrink-0" style={{ width: "55px" }}>
                              <span className="text-[9px] font-black text-foreground uppercase">{shortenPost(row.post)}</span>
                            </div>
                            <div className="px-2 py-2.5 text-center shrink-0" style={{ width: "55px" }}>
                              <span className="text-[9px] font-bold text-muted-foreground">{row.client}</span>
                            </div>
                            <div className="px-2 py-2.5 text-right shrink-0" style={{ width: "100px" }}>
                              <span className="text-[9px] font-bold text-foreground tabular-nums">{formatRM(row.salary)}</span>
                            </div>
                            <div className="px-2 py-2.5 text-right shrink-0" style={{ width: "90px" }}>
                              <span className="text-[9px] font-bold text-foreground tabular-nums">{formatRM(row.fixedAllowance)}</span>
                            </div>
                            <div className="px-2 py-2.5 text-center shrink-0" style={{ width: "50px" }}>
                              <span className="text-[10px] font-black text-foreground tabular-nums">{row.totalDays}</span>
                            </div>
                            <div className="px-2 py-2.5 text-right shrink-0" style={{ width: "100px" }}>
                              <span className={`text-[9px] font-bold tabular-nums ${row.offshoreAllowance > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                {formatRM(row.offshoreAllowance)}
                              </span>
                            </div>
                            <div className="px-2 py-2.5 text-right shrink-0" style={{ width: "90px" }}>
                              <span className={`text-[9px] font-bold tabular-nums ${row.reliefAllowance > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                                {formatRM(row.reliefAllowance)}
                              </span>
                            </div>
                            <div className="px-2 py-2.5 text-right shrink-0" style={{ width: "90px" }}>
                              <span className={`text-[9px] font-bold tabular-nums ${row.standbyAllowance > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                                {formatRM(row.standbyAllowance)}
                              </span>
                            </div>
                            <div className="px-2 py-2.5 text-right shrink-0" style={{ width: "90px" }}>
                              <span className={`text-[9px] font-bold tabular-nums ${row.medevacAllowance > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                                {formatRM(row.medevacAllowance)}
                              </span>
                            </div>
                            <div className="px-3 py-2.5 text-right flex-1">
                              <span className="text-[10px] font-black text-foreground tabular-nums">
                                {formatRM(row.grandTotal)}
                              </span>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="bg-muted/30 border-t border-border px-6 py-3">
                              <div className="space-y-2">
                                {row.cycles.map((c) => (
                                  <div key={c.cycleNum} className="flex items-center gap-4 text-[9px] py-1 border-b border-border/50 last:border-0">
                                    <span className="font-black text-muted-foreground w-14 shrink-0">Cycle {c.cycleNum}</span>
                                    <span className="font-bold text-foreground w-48 shrink-0">
                                      {formatDate(c.sign_on)} to {formatDate(c.sign_off)}
                                    </span>
                                    <span className="font-bold text-foreground w-14 shrink-0 tabular-nums">{c.days} days</span>
                                    {c.is_offshore && (
                                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold text-[8px] uppercase">OA</span>
                                    )}
                                    {c.relief_all > 0 && (
                                      <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold text-[8px] uppercase">Relief: {formatRM(c.relief_all)}</span>
                                    )}
                                    {c.standby_all > 0 && (
                                      <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold text-[8px] uppercase">Standby: {formatRM(c.standby_all)}</span>
                                    )}
                                    {c.medevac_dates.length > 0 && (
                                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold text-[8px] uppercase">
                                        Medevac: {c.medevac_dates.length} case{c.medevac_dates.length > 1 ? "s" : ""}
                                      </span>
                                    )}
                                    {c.notes && (
                                      <span className="text-muted-foreground italic truncate max-w-[200px]" title={c.notes}>{c.notes}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* TOTALS ROW */}
                  <tr className="bg-slate-900 text-white font-black">
                    <td className="px-3 py-3 text-[10px] uppercase tracking-widest" colSpan={3}>
                      Total ({filteredRows.length} crew)
                    </td>
                    <td className="px-2 py-3 text-right text-[10px] tabular-nums">{formatRM(totals.salary)}</td>
                    <td className="px-2 py-3 text-right text-[10px] tabular-nums">{formatRM(totals.fixedAllowance)}</td>
                    <td className="px-2 py-3 text-center text-[10px] tabular-nums">{totals.days}</td>
                    <td className="px-2 py-3 text-right text-[10px] tabular-nums">{formatRM(totals.offshore)}</td>
                    <td className="px-2 py-3 text-right text-[10px] tabular-nums">{formatRM(totals.relief)}</td>
                    <td className="px-2 py-3 text-right text-[10px] tabular-nums">{formatRM(totals.standby)}</td>
                    <td className="px-2 py-3 text-right text-[10px] tabular-nums">{formatRM(totals.medevac)}</td>
                    <td className="px-3 py-3 text-right text-[10px] tabular-nums">{formatRM(totals.grand)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-card rounded-lg w-fit shadow-sm border border-border">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Offshore Allowance (OM only)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Relief / Standby (All)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-500" />
            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Medevac (EM only)</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
