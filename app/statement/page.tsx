"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow, TradeType } from "@/lib/types";
import { getPivotedRosterData, getCrewMasterData, type CrewMasterRecord } from "@/lib/actions";
import { safeParseDate, shortenPost, getTradeRank, formatDate } from "@/lib/logic";

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

interface StatementRow {
  crew_id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  // Offshore
  offshoreDays: number;
  offshoreRate: number;
  offshoreTotal: number;
  // Relief
  reliefDays: number;
  reliefRate: number;
  reliefTotal: number;
  // Standby
  standbyDays: number;
  standbyRate: number;
  standbyTotal: number;
  // Medevac
  medevacCount: number;
  medevacRate: number;
  medevacTotal: number;
  // Grand
  grandTotal: number;
  cycles: {
    cycleNum: number;
    sign_on: string | null;
    sign_off: string | null;
    days: number;
    is_offshore: boolean;
    day_relief: number;
    relief_rate: number;
    day_standby: number;
    standby_rate: number;
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

  const statementRows = useMemo(() => {
    const monthStart = new Date(selectedYear, selectedMonthNum - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(selectedYear, selectedMonthNum, 0, 23, 59, 59, 999);
    const monthStartTime = monthStart.getTime();
    const monthEndTime = monthEnd.getTime();

    const rows: StatementRow[] = [];

    for (const crew of data) {
      const isOM = (crew.post || "").toUpperCase().includes("OFFSHORE MEDIC");
      const isEM = (crew.post || "").toUpperCase().includes("ESCORT MEDIC");

      const master = masterMap.get((crew.crew_name || "").toUpperCase().trim());
      const oaRate = master?.oa_rate ?? 0;
      const medevacRate = master?.medevac_rate ?? 0;

      const cycleDetails: StatementRow["cycles"] = [];
      let totalOffshoreDays = 0;
      let totalReliefDays = 0;
      let totalReliefAmount = 0;
      let totalStandbyDays = 0;
      let totalStandbyAmount = 0;
      let totalMedevacCount = 0;

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

        const isOffshore = cycle.is_offshore !== false;
        if (isOM && isOffshore) {
          totalOffshoreDays += daysInMonth;
        }

        const cycleReliefDays = cycle.day_relief ?? 0;
        const cycleReliefRate = cycle.relief_all ?? 0;
        totalReliefDays += cycleReliefDays;
        totalReliefAmount += cycleReliefDays * cycleReliefRate;

        const cycleStandbyDays = cycle.day_standby ?? 0;
        const cycleStandbyRate = cycle.standby_all ?? 0;
        totalStandbyDays += cycleStandbyDays;
        totalStandbyAmount += cycleStandbyDays * cycleStandbyRate;

        const cycleMedevacDates = (cycle.medevac_dates || []).filter((d) => {
          const md = safeParseDate(d);
          if (!md) return false;
          return md.getTime() >= monthStartTime && md.getTime() <= monthEndTime;
        });
        totalMedevacCount += cycleMedevacDates.length;

        cycleDetails.push({
          cycleNum: parseInt(cycleNumStr),
          sign_on: cycle.sign_on,
          sign_off: cycle.sign_off,
          days: daysInMonth,
          is_offshore: isOffshore,
          day_relief: cycleReliefDays,
          relief_rate: cycleReliefRate,
          day_standby: cycleStandbyDays,
          standby_rate: cycleStandbyRate,
          medevac_dates: cycleMedevacDates,
          notes: cycle.notes,
        });
      }

      if (cycleDetails.length === 0) continue;

      const offshoreTotal = isOM ? totalOffshoreDays * oaRate : 0;
      const medevacTotal = isEM ? totalMedevacCount * medevacRate : 0;
      const grandTotal = offshoreTotal + totalReliefAmount + totalStandbyAmount + medevacTotal;

      rows.push({
        crew_id: crew.crew_id,
        crew_name: crew.crew_name,
        post: crew.post,
        client: crew.client,
        location: crew.location,
        offshoreDays: isOM ? totalOffshoreDays : 0,
        offshoreRate: isOM ? oaRate : 0,
        offshoreTotal,
        reliefDays: totalReliefDays,
        reliefRate: totalReliefAmount > 0 && totalReliefDays > 0 ? totalReliefAmount / totalReliefDays : 0,
        reliefTotal: totalReliefAmount,
        standbyDays: totalStandbyDays,
        standbyRate: totalStandbyAmount > 0 && totalStandbyDays > 0 ? totalStandbyAmount / totalStandbyDays : 0,
        standbyTotal: totalStandbyAmount,
        medevacCount: isEM ? totalMedevacCount : 0,
        medevacRate: isEM ? medevacRate : 0,
        medevacTotal,
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
        offshore: acc.offshore + row.offshoreTotal,
        relief: acc.relief + row.reliefTotal,
        standby: acc.standby + row.standbyTotal,
        medevac: acc.medevac + row.medevacTotal,
        grand: acc.grand + row.grandTotal,
      }),
      { offshore: 0, relief: 0, standby: 0, medevac: 0, grand: 0 }
    );
  }, [filteredRows]);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const formatRM = (val: number) => {
    if (val === 0) return "-";
    return `RM ${val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatNum = (val: number) => {
    if (val === 0) return "-";
    return val.toString();
  };

  const thBase = "px-2 py-2.5 text-[10px] font-black uppercase tracking-wider text-center border-r border-slate-700 last:border-r-0";
  const tdBase = "px-2 py-2 text-[11px] font-semibold text-center border-r border-border last:border-r-0 tabular-nums";

  return (
    <AppShell>
      <div className="space-y-4 animate-in fade-in duration-500 mt-2">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none">
              MONTHLY ALLOWANCE STATEMENT
            </h2>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
              ALLOWANCE PAYABLE FOR {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}
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
              <table className="w-full border-collapse min-w-[1200px]">
                <thead>
                  {/* Group header row */}
                  <tr className="bg-slate-900 text-white">
                    <th className={`${thBase} border-b border-slate-700`} rowSpan={2} style={{ width: "180px" }}>Name / Client / Trade / Location</th>
                    <th className={`${thBase} border-b border-slate-600`} colSpan={3}>Offshore</th>
                    <th className={`${thBase} border-b border-slate-600`} colSpan={3}>Relief</th>
                    <th className={`${thBase} border-b border-slate-600`} colSpan={3}>Standby</th>
                    <th className={`${thBase} border-b border-slate-600`} colSpan={3}>Medevac</th>
                    <th className={`${thBase} border-b border-slate-700`} rowSpan={2} style={{ width: "110px" }}>Grand Total</th>
                  </tr>
                  {/* Sub-header row */}
                  <tr className="bg-slate-800 text-slate-300">
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "50px" }}>Days</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "70px" }}>Rate</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "90px" }}>Total</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "50px" }}>Days</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "70px" }}>Rate</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "90px" }}>Total</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "50px" }}>Days</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "70px" }}>Rate</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "90px" }}>Total</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "45px" }}>Count</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "70px" }}>Rate</th>
                    <th className={`${thBase} !text-[8px] !font-bold`} style={{ width: "90px" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const isExpanded = expandedRow === row.crew_id;
                    return (
                      <tr key={row.crew_id} className="group">
                        <td colSpan={14} className="p-0 border-b border-border">
                          <button
                            type="button"
                            onClick={() => setExpandedRow(isExpanded ? null : row.crew_id)}
                            className="w-full hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center min-w-[1200px]">
                              {/* Name / Client / Trade / Location */}
                              <div className="px-2 py-2.5 text-left border-r border-border" style={{ width: "180px" }}>
                                <span className="text-[11px] font-black text-foreground uppercase tracking-tight block truncate">{row.crew_name}</span>
                                <span className="text-[9px] font-medium text-muted-foreground">
                                  {row.client} / {shortenPost(row.post)} / {row.location}
                                </span>
                              </div>
                              {/* Offshore: Days */}
                              <div className={`${tdBase}`} style={{ width: "50px" }}>
                                <span className={row.offshoreDays > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>{formatNum(row.offshoreDays)}</span>
                              </div>
                              {/* Offshore: Rate */}
                              <div className={`${tdBase}`} style={{ width: "70px" }}>
                                <span className="text-muted-foreground text-[10px]">{row.offshoreRate > 0 ? formatRM(row.offshoreRate) : "-"}</span>
                              </div>
                              {/* Offshore: Total */}
                              <div className={`${tdBase}`} style={{ width: "90px" }}>
                                <span className={row.offshoreTotal > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>{formatRM(row.offshoreTotal)}</span>
                              </div>
                              {/* Relief: Days */}
                              <div className={`${tdBase}`} style={{ width: "50px" }}>
                                <span className={row.reliefDays > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{formatNum(row.reliefDays)}</span>
                              </div>
                              {/* Relief: Rate */}
                              <div className={`${tdBase}`} style={{ width: "70px" }}>
                                <span className="text-muted-foreground text-[10px]">{row.reliefRate > 0 ? formatRM(row.reliefRate) : "-"}</span>
                              </div>
                              {/* Relief: Total */}
                              <div className={`${tdBase}`} style={{ width: "90px" }}>
                                <span className={row.reliefTotal > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{formatRM(row.reliefTotal)}</span>
                              </div>
                              {/* Standby: Days */}
                              <div className={`${tdBase}`} style={{ width: "50px" }}>
                                <span className={row.standbyDays > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{formatNum(row.standbyDays)}</span>
                              </div>
                              {/* Standby: Rate */}
                              <div className={`${tdBase}`} style={{ width: "70px" }}>
                                <span className="text-muted-foreground text-[10px]">{row.standbyRate > 0 ? formatRM(row.standbyRate) : "-"}</span>
                              </div>
                              {/* Standby: Total */}
                              <div className={`${tdBase}`} style={{ width: "90px" }}>
                                <span className={row.standbyTotal > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{formatRM(row.standbyTotal)}</span>
                              </div>
                              {/* Medevac: Count */}
                              <div className={`${tdBase}`} style={{ width: "45px" }}>
                                <span className={row.medevacCount > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>{formatNum(row.medevacCount)}</span>
                              </div>
                              {/* Medevac: Rate */}
                              <div className={`${tdBase}`} style={{ width: "70px" }}>
                                <span className="text-muted-foreground text-[10px]">{row.medevacRate > 0 ? formatRM(row.medevacRate) : "-"}</span>
                              </div>
                              {/* Medevac: Total */}
                              <div className={`${tdBase}`} style={{ width: "90px" }}>
                                <span className={row.medevacTotal > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>{formatRM(row.medevacTotal)}</span>
                              </div>
                              {/* Grand Total */}
                              <div className="px-2 py-2.5 text-center flex-1">
                                <span className="text-[12px] font-black text-foreground tabular-nums">
                                  {formatRM(row.grandTotal)}
                                </span>
                              </div>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="bg-muted/30 border-t border-border px-6 py-3">
                              <div className="space-y-2">
                                {row.cycles.map((c) => (
                                  <div key={c.cycleNum} className="flex flex-wrap items-center gap-3 text-[10px] py-1.5 border-b border-border/50 last:border-0">
                                    <span className="font-black text-muted-foreground w-16 shrink-0">Cycle {c.cycleNum}</span>
                                    <span className="font-bold text-foreground w-52 shrink-0">
                                      {formatDate(c.sign_on)} to {formatDate(c.sign_off)}
                                    </span>
                                    <span className="font-bold text-foreground w-16 shrink-0 tabular-nums">{c.days} days</span>
                                    {c.is_offshore && (
                                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold text-[9px] uppercase">OA</span>
                                    )}
                                    {c.day_relief > 0 && (
                                      <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold text-[9px] uppercase">
                                        Relief: {c.day_relief}d x {formatRM(c.relief_rate)}
                                      </span>
                                    )}
                                    {c.day_standby > 0 && (
                                      <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold text-[9px] uppercase">
                                        Standby: {c.day_standby}d x {formatRM(c.standby_rate)}
                                      </span>
                                    )}
                                    {c.medevac_dates.length > 0 && (
                                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold text-[9px] uppercase">
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
                    <td colSpan={14} className="p-0">
                      <div className="flex items-center min-w-[1200px]">
                        <div className="px-2 py-3 text-left border-r border-slate-700" style={{ width: "180px" }}>
                          <span className="text-[10px] font-black uppercase tracking-widest">Total ({filteredRows.length} crew)</span>
                        </div>
                        <div className="px-2 py-3 text-center border-r border-slate-700" style={{ width: "50px" }}></div>
                        <div className="px-2 py-3 text-center border-r border-slate-700" style={{ width: "70px" }}></div>
                        <div className="px-2 py-3 text-center border-r border-slate-700 text-[11px] tabular-nums" style={{ width: "90px" }}>{formatRM(totals.offshore)}</div>
                        <div className="px-2 py-3 text-center border-r border-slate-700" style={{ width: "50px" }}></div>
                        <div className="px-2 py-3 text-center border-r border-slate-700" style={{ width: "70px" }}></div>
                        <div className="px-2 py-3 text-center border-r border-slate-700 text-[11px] tabular-nums" style={{ width: "90px" }}>{formatRM(totals.relief)}</div>
                        <div className="px-2 py-3 text-center border-r border-slate-700" style={{ width: "50px" }}></div>
                        <div className="px-2 py-3 text-center border-r border-slate-700" style={{ width: "70px" }}></div>
                        <div className="px-2 py-3 text-center border-r border-slate-700 text-[11px] tabular-nums" style={{ width: "90px" }}>{formatRM(totals.standby)}</div>
                        <div className="px-2 py-3 text-center border-r border-slate-700" style={{ width: "45px" }}></div>
                        <div className="px-2 py-3 text-center border-r border-slate-700" style={{ width: "70px" }}></div>
                        <div className="px-2 py-3 text-center border-r border-slate-700 text-[11px] tabular-nums" style={{ width: "90px" }}>{formatRM(totals.medevac)}</div>
                        <div className="px-2 py-3 text-center flex-1 text-[12px] font-black tabular-nums">{formatRM(totals.grand)}</div>
                      </div>
                    </td>
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
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Offshore (OM only)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Relief / Standby (All)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-500" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Medevac (EM only)</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
