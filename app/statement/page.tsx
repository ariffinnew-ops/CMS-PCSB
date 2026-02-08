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
  offshoreDays: number;
  offshoreRate: number;
  offshoreTotal: number;
  reliefDays: number;
  reliefRate: number;
  reliefTotal: number;
  standbyDays: number;
  standbyRate: number;
  standbyTotal: number;
  medevacDays: number;
  medevacTotal: number;
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
    const OA_RATE = 200;
    const MEDEVAC_RATE = 500;

    const rows: StatementRow[] = [];

    for (const crew of data) {
      const isOM = (crew.post || "").toUpperCase().includes("OFFSHORE MEDIC");
      const isEM = (crew.post || "").toUpperCase().includes("ESCORT MEDIC");

      const cycleDetails: StatementRow["cycles"] = [];
      let totalOffshoreDays = 0;
      let totalReliefDays = 0;
      let totalReliefAmount = 0;
      let totalStandbyDays = 0;
      let totalStandbyAmount = 0;
      let totalMedevacDays = 0;

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
        if (isOM && isOffshore) totalOffshoreDays += daysInMonth;

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
        totalMedevacDays += cycleMedevacDates.length;

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

      const offshoreTotal = isOM ? totalOffshoreDays * OA_RATE : 0;
      const medevacTotal = isEM ? totalMedevacDays * MEDEVAC_RATE : 0;
      const grandTotal = offshoreTotal + totalReliefAmount + totalStandbyAmount + medevacTotal;

      rows.push({
        crew_id: crew.crew_id,
        crew_name: crew.crew_name,
        post: crew.post,
        client: crew.client,
        location: crew.location,
        offshoreDays: isOM ? totalOffshoreDays : 0,
        offshoreRate: isOM ? OA_RATE : 0,
        offshoreTotal,
        reliefDays: totalReliefDays,
        reliefRate: totalReliefAmount > 0 && totalReliefDays > 0 ? totalReliefAmount / totalReliefDays : 0,
        reliefTotal: totalReliefAmount,
        standbyDays: totalStandbyDays,
        standbyRate: totalStandbyAmount > 0 && totalStandbyDays > 0 ? totalStandbyAmount / totalStandbyDays : 0,
        standbyTotal: totalStandbyAmount,
        medevacDays: isEM ? totalMedevacDays : 0,
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

  const fmtAmt = (val: number) => (val === 0 ? "-" : val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtNum = (val: number) => (val === 0 ? "-" : val.toString());

  const hasActiveFilters = tradeFilter !== "ALL" || clientFilter !== "ALL" || search.trim() !== "";
  const resetFilters = () => {
    setTradeFilter("ALL");
    setClientFilter("ALL");
    setSearch("");
  };

  return (
    <AppShell>
      <div className="space-y-3 animate-in fade-in duration-500 mt-1">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">
              Monthly Allowance Statement
            </h2>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Allowance Payable for {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Period</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-muted border border-border rounded-md px-2.5 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Client</label>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value as "ALL" | "SBA" | "SKA")}
                className="bg-muted border border-border rounded-md px-2.5 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="ALL">All</option>
                <option value="SBA">SBA</option>
                <option value="SKA">SKA</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Grade</label>
              <select
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value as TradeType | "ALL")}
                className="bg-muted border border-border rounded-md px-2.5 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="ALL">All</option>
                <option value="OM">OM</option>
                <option value="EM">EM</option>
                <option value="IMP/OHN">OHN</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Search</label>
              <input
                type="text"
                placeholder="Name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-muted border border-border rounded-md px-2.5 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-32"
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-wider transition-colors border border-red-500/20"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* TABLE */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <p className="text-muted-foreground text-sm font-medium">No active rotations found for {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-lg overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-220px)]">
              <table className="w-full border-collapse text-[12px] font-sans" style={{ minWidth: "1100px" }}>
                <thead className="sticky top-0 z-10">
                  {/* Group header */}
                  <tr className="bg-slate-900 text-white">
                    <th rowSpan={2} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-left border-r border-slate-700 whitespace-nowrap" style={{ minWidth: "240px" }}>
                      Name / Client / Trade
                    </th>
                    <th colSpan={3} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-center border-r border-slate-700 border-b border-slate-600">
                      Offshore
                    </th>
                    <th colSpan={3} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-center border-r border-slate-700 border-b border-slate-600">
                      Relief
                    </th>
                    <th colSpan={3} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-center border-r border-slate-700 border-b border-slate-600">
                      Standby
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-center border-r border-slate-700 border-b border-slate-600">
                      Medevac
                    </th>
                    <th rowSpan={2} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-center whitespace-nowrap" style={{ minWidth: "100px" }}>
                      Grand Total
                    </th>
                  </tr>
                  {/* Sub-header */}
                  <tr className="bg-slate-800 text-slate-300">
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "50px" }}>Days</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "60px" }}>Rate</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "80px" }}>Total</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "50px" }}>Days</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "60px" }}>Rate</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "80px" }}>Total</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "50px" }}>Days</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "60px" }}>Rate</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "80px" }}>Total</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "60px" }}>No of Days</th>
                    <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-slate-700" style={{ width: "80px" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const isExpanded = expandedRow === row.crew_id;
                    return (
                      <>
                        <tr
                          key={row.crew_id}
                          onClick={() => setExpandedRow(isExpanded ? null : row.crew_id)}
                          className="border-b border-border hover:bg-muted/40 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-1 text-left border-r border-border" style={{ minWidth: "240px" }}>
                            <span className="text-[12px] font-bold text-foreground uppercase block">{row.crew_name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {row.client} / {shortenPost(row.post)} / {row.location}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.offshoreDays > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.offshoreDays)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums text-muted-foreground text-[11px]">
                            {row.offshoreRate > 0 ? fmtAmt(row.offshoreRate) : "-"}
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.offshoreTotal > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.offshoreTotal)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.reliefDays > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.reliefDays)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums text-muted-foreground text-[11px]">
                            {row.reliefRate > 0 ? fmtAmt(row.reliefRate) : "-"}
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.reliefTotal > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.reliefTotal)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.standbyDays > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.standbyDays)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums text-muted-foreground text-[11px]">
                            {row.standbyRate > 0 ? fmtAmt(row.standbyRate) : "-"}
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.standbyTotal > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.standbyTotal)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.medevacDays > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.medevacDays)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.medevacTotal > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.medevacTotal)}</span>
                          </td>
                          <td className="px-3 py-1 text-center tabular-nums">
                            <span className="text-[12px] font-black text-foreground">{fmtAmt(row.grandTotal)}</span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${row.crew_id}-detail`} className="bg-muted/20">
                            <td colSpan={13} className="px-5 py-2 border-b border-border">
                              <div className="space-y-1">
                                {row.cycles.map((c) => (
                                  <div key={c.cycleNum} className="flex flex-wrap items-center gap-3 text-[10px] py-1 border-b border-border/40 last:border-0">
                                    <span className="font-bold text-muted-foreground w-14 shrink-0">Cycle {c.cycleNum}</span>
                                    <span className="font-semibold text-foreground w-48 shrink-0">
                                      {formatDate(c.sign_on)} to {formatDate(c.sign_off)}
                                    </span>
                                    <span className="font-semibold text-foreground w-14 shrink-0 tabular-nums">{c.days} days</span>
                                    {c.is_offshore && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[9px] uppercase">OA</span>
                                    )}
                                    {c.day_relief > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[9px] uppercase">
                                        Relief: {c.day_relief}d x {fmtAmt(c.relief_rate)}
                                      </span>
                                    )}
                                    {c.day_standby > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[9px] uppercase">
                                        Standby: {c.day_standby}d x {fmtAmt(c.standby_rate)}
                                      </span>
                                    )}
                                    {c.medevac_dates.length > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[9px] uppercase">
                                        Medevac: {c.medevac_dates.length} day{c.medevac_dates.length > 1 ? "s" : ""}
                                      </span>
                                    )}
                                    {c.notes && (
                                      <span className="text-muted-foreground italic max-w-[200px]" title={c.notes}>{c.notes}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}

                  {/* TOTALS ROW */}
                  <tr className="bg-slate-900 text-white font-bold sticky bottom-0">
                    <td className="px-3 py-2 text-left border-r border-slate-700">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Total ({filteredRows.length} crew)</span>
                    </td>
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 text-center border-r border-slate-700 tabular-nums text-[11px]">{fmtAmt(totals.offshore)}</td>
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 text-center border-r border-slate-700 tabular-nums text-[11px]">{fmtAmt(totals.relief)}</td>
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 text-center border-r border-slate-700 tabular-nums text-[11px]">{fmtAmt(totals.standby)}</td>
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 text-center border-r border-slate-700 tabular-nums text-[11px]">{fmtAmt(totals.medevac)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-[12px] font-black">{fmtAmt(totals.grand)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
