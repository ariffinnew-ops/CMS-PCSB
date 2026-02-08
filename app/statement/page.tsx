"use client";

import { Fragment, useEffect, useState, useMemo } from "react";
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

// Allowance pill component
function AllowancePill({
  label,
  days,
  amount,
  colorClass,
}: {
  label: string;
  days: number;
  amount: number;
  colorClass: string;
}) {
  if (days === 0 && amount === 0) return null;
  const fmtAmt = (val: number) =>
    val === 0
      ? "-"
      : val.toLocaleString("en-MY", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${colorClass}`}>
      <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-[10px] font-bold tabular-nums">{days}d</span>
      <span className="text-[11px] font-black tabular-nums">{fmtAmt(amount)}</span>
    </div>
  );
}

// Summary stat card
function SumCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  const fmtAmt = (val: number) =>
    val === 0
      ? "0.00"
      : val.toLocaleString("en-MY", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl ${colorClass}`}>
      <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-sm font-black tabular-nums mt-0.5">{fmtAmt(value)}</span>
    </div>
  );
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
        const rotEnd = signOff.getTime() - 86400000;
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
      if (row.grandTotal === 0) return false;
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

  const fmtAmt = (val: number) =>
    val === 0
      ? "-"
      : val.toLocaleString("en-MY", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  const hasActiveFilters = tradeFilter !== "ALL" || clientFilter !== "ALL" || search.trim() !== "";
  const resetFilters = () => {
    setTradeFilter("ALL");
    setClientFilter("ALL");
    setSearch("");
  };

  const getTradeShort = (post: string) => {
    if (post?.includes("OFFSHORE")) return "OM";
    if (post?.includes("ESCORT")) return "EM";
    return "OHN";
  };

  const getTradeBadge = (post: string) => {
    const trade = getTradeShort(post);
    if (trade === "OM") return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    if (trade === "EM") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  };

  return (
    <AppShell>
      <div className="space-y-4 animate-in fade-in duration-500 mt-1">
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
                className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Client</label>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value as "ALL" | "SBA" | "SKA")}
                className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-blue-500/40"
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
                className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-blue-500/40"
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
                className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/40 w-32"
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-wider transition-colors border border-red-500/20"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* SUMMARY CARDS */}
        {!loading && filteredRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <SumCard label="Offshore" value={totals.offshore} colorClass="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" />
            <SumCard label="Relief" value={totals.relief} colorClass="bg-blue-500/10 text-blue-500 border border-blue-500/20" />
            <SumCard label="Standby" value={totals.standby} colorClass="bg-violet-500/10 text-violet-500 border border-violet-500/20" />
            <SumCard label="Medevac" value={totals.medevac} colorClass="bg-amber-500/10 text-amber-500 border border-amber-500/20" />
            <div className="flex flex-col items-center px-5 py-2 rounded-xl bg-foreground/5 border border-foreground/10">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Grand Total</span>
              <span className="text-base font-black tabular-nums text-foreground mt-0.5">{fmtAmt(totals.grand)}</span>
            </div>
            <span className="ml-auto text-[10px] text-muted-foreground font-bold">
              {filteredRows.length} crew
            </span>
          </div>
        )}

        {/* CONTENT */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <p className="text-muted-foreground text-sm font-medium">
              No active rotations found for {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 overflow-auto max-h-[calc(100vh-280px)] pr-1">
            {filteredRows.map((row, idx) => {
              const isExpanded = expandedRow === row.crew_id;
              const trade = getTradeShort(row.post);
              const tradeBadge = getTradeBadge(row.post);

              return (
                <div key={row.crew_id}>
                  {/* Row Card */}
                  <button
                    type="button"
                    onClick={() => setExpandedRow(isExpanded ? null : row.crew_id)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                      isExpanded
                        ? "bg-card border border-border shadow-md ring-1 ring-blue-500/20"
                        : "bg-card/60 border border-transparent hover:bg-card hover:border-border hover:shadow-sm"
                    }`}
                  >
                    {/* Index */}
                    <span className="text-[10px] text-muted-foreground font-bold tabular-nums w-5 shrink-0">{idx + 1}</span>

                    {/* Name + meta */}
                    <div className="flex flex-col min-w-[200px] shrink-0">
                      <span className="text-[12px] font-bold text-foreground uppercase leading-tight">{row.crew_name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex px-1.5 py-px rounded text-[8px] font-bold border ${tradeBadge}`}>
                          {trade}
                        </span>
                        <span className={`inline-flex px-1.5 py-px rounded text-[8px] font-bold border ${
                          row.client === "SKA"
                            ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                            : "bg-orange-500/15 text-orange-400 border-orange-500/30"
                        }`}>
                          {row.client}
                        </span>
                        <span className="text-[9px] text-muted-foreground">{row.location}</span>
                      </div>
                    </div>

                    {/* Allowance pills */}
                    <div className="flex flex-wrap items-center gap-1.5 flex-1">
                      {row.offshoreDays > 0 && (
                        <AllowancePill
                          label="OA"
                          days={row.offshoreDays}
                          amount={row.offshoreTotal}
                          colorClass="bg-emerald-500/10 text-emerald-500"
                        />
                      )}
                      {row.reliefDays > 0 && (
                        <AllowancePill
                          label="Relief"
                          days={row.reliefDays}
                          amount={row.reliefTotal}
                          colorClass="bg-blue-500/10 text-blue-500"
                        />
                      )}
                      {row.standbyDays > 0 && (
                        <AllowancePill
                          label="Standby"
                          days={row.standbyDays}
                          amount={row.standbyTotal}
                          colorClass="bg-violet-500/10 text-violet-500"
                        />
                      )}
                      {row.medevacDays > 0 && (
                        <AllowancePill
                          label="Medevac"
                          days={row.medevacDays}
                          amount={row.medevacTotal}
                          colorClass="bg-amber-500/10 text-amber-500"
                        />
                      )}
                    </div>

                    {/* Grand Total */}
                    <div className="text-right shrink-0 min-w-[90px]">
                      <span className="text-[13px] font-black text-foreground tabular-nums">
                        {fmtAmt(row.grandTotal)}
                      </span>
                    </div>

                    {/* Expand indicator */}
                    <svg
                      className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded cycle details */}
                  {isExpanded && (
                    <div className="ml-9 mr-4 mt-1 mb-2 bg-muted/30 rounded-lg border border-border/50 overflow-hidden">
                      {row.cycles.map((c) => (
                        <div
                          key={c.cycleNum}
                          className="flex flex-wrap items-center gap-3 px-4 py-2 text-[10px] border-b border-border/30 last:border-0"
                        >
                          <span className="font-bold text-muted-foreground w-14 shrink-0">
                            Cycle {c.cycleNum}
                          </span>
                          <span className="font-semibold text-foreground shrink-0">
                            {formatDate(c.sign_on)} to {formatDate(c.sign_off)}
                          </span>
                          <span className="font-semibold text-foreground shrink-0 tabular-nums">
                            {c.days} days
                          </span>
                          {c.is_offshore && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 font-bold text-[9px] uppercase">
                              OA
                            </span>
                          )}
                          {c.day_relief > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 font-bold text-[9px] uppercase">
                              Relief: {c.day_relief}d x {fmtAmt(c.relief_rate)}
                            </span>
                          )}
                          {c.day_standby > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 font-bold text-[9px] uppercase">
                              Standby: {c.day_standby}d x {fmtAmt(c.standby_rate)}
                            </span>
                          )}
                          {c.medevac_dates.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-bold text-[9px] uppercase">
                              Medevac: {c.medevac_dates.length} day{c.medevac_dates.length > 1 ? "s" : ""}
                            </span>
                          )}
                          {c.notes && (
                            <span className="text-muted-foreground italic" title={c.notes}>
                              {c.notes}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
