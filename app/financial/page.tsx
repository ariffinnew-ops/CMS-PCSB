"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow } from "@/lib/types";
import { getPivotedRosterData, getCrewMasterData, type CrewMasterRecord } from "@/lib/actions";
import { safeParseDate, shortenPost } from "@/lib/logic";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";

// Compute all months from Sept 2025 to current + 3 future
function generateMonthRange(): { year: number; month: number; label: string; isFuture: boolean }[] {
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1; // 1-indexed
  const futureEnd = new Date(now);
  futureEnd.setMonth(futureEnd.getMonth() + 3);
  const futureEndYear = futureEnd.getFullYear();
  const futureEndMonth = futureEnd.getMonth() + 1;

  const months: { year: number; month: number; label: string; isFuture: boolean }[] = [];
  let y = 2025, m = 9;
  while (y < futureEndYear || (y === futureEndYear && m <= futureEndMonth)) {
    const shortMonth = new Date(y, m - 1, 1).toLocaleString("en", { month: "short" });
    const isFuture = y > endYear || (y === endYear && m > endMonth);
    months.push({ year: y, month: m, label: `${shortMonth} ${String(y).slice(-2)}`, isFuture });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// Colors
const COLORS = {
  emerald: "#10b981",
  blue: "#3b82f6",
  amber: "#f59e0b",
  slate: "#64748b",
  indigo: "#6366f1",
  rose: "#f43f5e",
};
const CLIENT_COLORS = [COLORS.blue, COLORS.amber];
const TRADE_COLORS = [COLORS.emerald, COLORS.indigo, COLORS.amber, COLORS.rose, COLORS.slate];

interface MonthlyCostEntry {
  label: string;
  month: number;
  year: number;
  isFuture: boolean;
  total: number;
  salary: number;
  allowances: number;
}

interface CrewMonthCost {
  crew_name: string;
  post: string;
  client: string;
  salary: number;
  fixedAllowance: number;
  offshore: number;
  relief: number;
  standby: number;
  medevac: number;
  total: number;
}

function calcCrewMonthCosts(
  data: PivotedCrewRow[],
  masterMap: Map<string, CrewMasterRecord>,
  year: number,
  month: number
): CrewMonthCost[] {
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const monthStartTime = monthStart.getTime();
  const monthEndTime = monthEnd.getTime();

  const results: CrewMonthCost[] = [];

  for (const crew of data) {
    const isOM = (crew.post || "").toUpperCase().includes("OFFSHORE MEDIC");
    const isEM = (crew.post || "").toUpperCase().includes("ESCORT MEDIC");
    const master = masterMap.get((crew.crew_name || "").toUpperCase().trim());
    const salary = master?.salary ?? 0;
    const fixedAllowance = master?.fixed_allowance ?? 0;
    const oaRate = master?.oa_rate ?? 0;
    const medevacRate = master?.medevac_rate ?? 0;

    let totalDays = 0;
    let offshoreEligibleDays = 0;
    let totalRelief = 0;
    let totalStandby = 0;
    let medevacCount = 0;
    let hasCycles = false;

    for (const cycle of Object.values(crew.cycles)) {
      const signOn = safeParseDate(cycle.sign_on);
      const signOff = safeParseDate(cycle.sign_off);
      if (!signOn || !signOff) continue;

      const rotStart = signOn.getTime();
      const rotEnd = signOff.getTime();
      if (rotStart > monthEndTime || rotEnd < monthStartTime) continue;

      const effectiveStart = Math.max(rotStart, monthStartTime);
      const effectiveEnd = Math.min(rotEnd, monthEndTime);
      const days = Math.ceil((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1;
      if (days <= 0) continue;

      hasCycles = true;
      totalDays += days;
      if (isOM && cycle.is_offshore !== false) offshoreEligibleDays += days;
      totalRelief += cycle.relief_all ?? 0;
      totalStandby += cycle.standby_all ?? 0;
      medevacCount += (cycle.medevac_dates || []).filter((d) => {
        const md = safeParseDate(d);
        return md && md.getTime() >= monthStartTime && md.getTime() <= monthEndTime;
      }).length;
    }

    if (!hasCycles) continue;

    const offshore = isOM ? offshoreEligibleDays * oaRate : 0;
    const medevac = isEM ? medevacCount * medevacRate : 0;
    const total = salary + fixedAllowance + offshore + totalRelief + totalStandby + medevac;

    results.push({
      crew_name: crew.crew_name,
      post: crew.post,
      client: crew.client,
      salary,
      fixedAllowance,
      offshore,
      relief: totalRelief,
      standby: totalStandby,
      medevac,
      total,
    });
  }

  return results;
}

function formatRM(val: number) {
  if (val === 0) return "RM 0.00";
  return `RM ${val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompact(val: number) {
  if (val >= 1_000_000) return `RM ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `RM ${(val / 1_000).toFixed(1)}K`;
  return `RM ${val.toFixed(0)}`;
}

export default function FinancialDashboardPage() {
  const [data, setData] = useState<PivotedCrewRow[]>([]);
  const [masterData, setMasterData] = useState<CrewMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPivotedRosterData(), getCrewMasterData()]).then(([pivoted, master]) => {
      setData(pivoted);
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

  const monthRange = useMemo(() => generateMonthRange(), []);

  // Calculate cost per month across entire range
  const monthlyCosts = useMemo((): MonthlyCostEntry[] => {
    return monthRange.map(({ year, month, label, isFuture }) => {
      const costs = calcCrewMonthCosts(data, masterMap, year, month);
      const totalSalary = costs.reduce((s, c) => s + c.salary, 0);
      const totalAllowances = costs.reduce((s, c) => s + c.fixedAllowance + c.offshore + c.relief + c.standby + c.medevac, 0);
      return {
        label,
        month,
        year,
        isFuture,
        total: costs.reduce((s, c) => s + c.total, 0),
        salary: totalSalary,
        allowances: totalAllowances,
      };
    });
  }, [data, masterMap, monthRange]);

  const actualCosts = monthlyCosts.filter((m) => !m.isFuture);
  const estimatedCosts = monthlyCosts.filter((m) => m.isFuture);

  const totalActual = actualCosts.reduce((s, c) => s + c.total, 0);
  const monthlyAvg = actualCosts.length > 0 ? totalActual / actualCosts.length : 0;
  const totalEstimated = estimatedCosts.reduce((s, c) => s + c.total, 0);

  // Cost by Client (latest actual month or current)
  const costByClient = useMemo(() => {
    const now = new Date();
    const costs = calcCrewMonthCosts(data, masterMap, now.getFullYear(), now.getMonth() + 1);
    const clientMap = new Map<string, number>();
    for (const c of costs) {
      const client = c.client || "Unknown";
      clientMap.set(client, (clientMap.get(client) || 0) + c.total);
    }
    return Array.from(clientMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data, masterMap]);

  // Cost by Trade (aggregate across all actual months)
  const costByTrade = useMemo(() => {
    const tradeMap = new Map<string, number>();
    for (const m of actualCosts) {
      const costs = calcCrewMonthCosts(data, masterMap, m.year, m.month);
      for (const c of costs) {
        const trade = shortenPost(c.post) || "Other";
        tradeMap.set(trade, (tradeMap.get(trade) || 0) + c.total);
      }
    }
    return Array.from(tradeMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data, masterMap, actualCosts]);

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#1e293b",
      border: "1px solid #334155",
      borderRadius: "8px",
      color: "#f8fafc",
      fontSize: "11px",
      fontWeight: 700,
    },
    itemStyle: { color: "#f8fafc" },
    labelStyle: { color: "#94a3b8", fontWeight: 700, fontSize: "10px" },
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 animate-in fade-in duration-500 mt-2">
        {/* HEADER */}
        <div>
          <h2 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none">
            FINANCIAL DASHBOARD
          </h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
            Cost analytics from September 2025 onwards
          </p>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5 shadow-lg">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total Actual Cost</p>
            <p className="text-[8px] text-muted-foreground mb-2">Since Sept 2025</p>
            <p className="text-2xl font-black text-foreground tabular-nums tracking-tight">{formatCompact(totalActual)}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 shadow-lg">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Monthly Average</p>
            <p className="text-[8px] text-muted-foreground mb-2">{actualCosts.length} months</p>
            <p className="text-2xl font-black text-foreground tabular-nums tracking-tight">{formatCompact(monthlyAvg)}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 shadow-lg">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Estimated (Next 3 Months)</p>
            <p className="text-[8px] text-muted-foreground mb-2">Based on scheduled roster</p>
            <p className="text-2xl font-black text-foreground tabular-nums tracking-tight">{formatCompact(totalEstimated)}</p>
          </div>
        </div>

        {/* CHARTS ROW 1: Time Trend */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-lg">
          <h3 className="text-[10px] font-black text-foreground uppercase tracking-widest mb-4">Monthly Cost Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyCosts} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }} interval={0} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }} tickFormatter={(v: number) => formatCompact(v)} width={70} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number, name: string) => [formatRM(value), name === "total" ? "Total Cost" : name === "salary" ? "Salary" : "Allowances"]}
                />
                <Line type="monotone" dataKey="total" stroke={COLORS.emerald} strokeWidth={2.5} dot={{ fill: COLORS.emerald, r: 3 }} name="total" />
                <Line type="monotone" dataKey="salary" stroke={COLORS.blue} strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="salary" />
                <Line type="monotone" dataKey="allowances" stroke={COLORS.amber} strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="allowances" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: COLORS.emerald }} />
              <span className="text-[8px] font-bold text-muted-foreground uppercase">Total Cost</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: COLORS.blue }} />
              <span className="text-[8px] font-bold text-muted-foreground uppercase">Salary</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: COLORS.amber }} />
              <span className="text-[8px] font-bold text-muted-foreground uppercase">Allowances</span>
            </div>
          </div>
        </div>

        {/* CHARTS ROW 2: Client + Trade */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cost by Client - Pie */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-lg">
            <h3 className="text-[10px] font-black text-foreground uppercase tracking-widest mb-4">Cost by Client (Current Month)</h3>
            {costByClient.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No data for current month.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costByClient}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: { name: string; percent: number }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {costByClient.map((_, idx) => (
                        <Cell key={idx} fill={CLIENT_COLORS[idx % CLIENT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(value: number) => [formatRM(value), "Cost"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Cost by Trade - Bar */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-lg">
            <h3 className="text-[10px] font-black text-foreground uppercase tracking-widest mb-4">Cost by Trade (All Time)</h3>
            {costByTrade.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No data.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costByTrade} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }} tickFormatter={(v: number) => formatCompact(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} width={50} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(value: number) => [formatRM(value), "Total Cost"]}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {costByTrade.map((_, idx) => (
                        <Cell key={idx} fill={TRADE_COLORS[idx % TRADE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* GROUP SUMMARY TABLE: by Client & Trade */}
        <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-slate-900 rounded-t-2xl">
            <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Summary by Client & Trade (Current Month)</h3>
          </div>
          <div className="overflow-x-auto">
            <ClientTradeSummaryTable data={data} masterMap={masterMap} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// Sub-component: Client/Trade summary table for current month
function ClientTradeSummaryTable({ data, masterMap }: { data: PivotedCrewRow[]; masterMap: Map<string, CrewMasterRecord> }) {
  const now = new Date();
  const costs = calcCrewMonthCosts(data, masterMap, now.getFullYear(), now.getMonth() + 1);

  // Group by client -> trade
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, { count: number; salary: number; fixed: number; offshore: number; relief: number; standby: number; medevac: number; total: number }>>();
    for (const c of costs) {
      const client = c.client || "Unknown";
      const trade = shortenPost(c.post) || "Other";
      if (!map.has(client)) map.set(client, new Map());
      const tradeMap = map.get(client)!;
      if (!tradeMap.has(trade)) tradeMap.set(trade, { count: 0, salary: 0, fixed: 0, offshore: 0, relief: 0, standby: 0, medevac: 0, total: 0 });
      const entry = tradeMap.get(trade)!;
      entry.count += 1;
      entry.salary += c.salary;
      entry.fixed += c.fixedAllowance;
      entry.offshore += c.offshore;
      entry.relief += c.relief;
      entry.standby += c.standby;
      entry.medevac += c.medevac;
      entry.total += c.total;
    }
    return map;
  }, [costs]);

  const formatRM = (val: number) => {
    if (val === 0) return "-";
    return `RM ${val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const rows: { client: string; trade: string; count: number; salary: number; fixed: number; offshore: number; relief: number; standby: number; medevac: number; total: number }[] = [];
  for (const [client, tradeMap] of Array.from(grouped.entries()).sort()) {
    for (const [trade, vals] of Array.from(tradeMap.entries()).sort()) {
      rows.push({ client, trade, ...vals });
    }
  }

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  if (rows.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">No data for current month.</div>;
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-muted/50">
          <th className="px-4 py-2.5 text-left text-[9px] font-black text-muted-foreground uppercase tracking-widest">Client</th>
          <th className="px-3 py-2.5 text-left text-[9px] font-black text-muted-foreground uppercase tracking-widest">Trade</th>
          <th className="px-3 py-2.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-widest">Count</th>
          <th className="px-3 py-2.5 text-right text-[9px] font-black text-muted-foreground uppercase tracking-widest">Salary</th>
          <th className="px-3 py-2.5 text-right text-[9px] font-black text-muted-foreground uppercase tracking-widest">Fixed All.</th>
          <th className="px-3 py-2.5 text-right text-[9px] font-black text-muted-foreground uppercase tracking-widest">Offshore</th>
          <th className="px-3 py-2.5 text-right text-[9px] font-black text-muted-foreground uppercase tracking-widest">Relief</th>
          <th className="px-3 py-2.5 text-right text-[9px] font-black text-muted-foreground uppercase tracking-widest">Standby</th>
          <th className="px-3 py-2.5 text-right text-[9px] font-black text-muted-foreground uppercase tracking-widest">Medevac</th>
          <th className="px-4 py-2.5 text-right text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r, idx) => (
          <tr key={idx} className="hover:bg-muted/30 transition-colors">
            <td className="px-4 py-2 text-[10px] font-black text-foreground uppercase">{r.client}</td>
            <td className="px-3 py-2 text-[10px] font-bold text-foreground uppercase">{r.trade}</td>
            <td className="px-3 py-2 text-[10px] font-bold text-center text-foreground tabular-nums">{r.count}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-foreground tabular-nums">{formatRM(r.salary)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-foreground tabular-nums">{formatRM(r.fixed)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-emerald-600 tabular-nums">{formatRM(r.offshore)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-blue-600 tabular-nums">{formatRM(r.relief)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-blue-600 tabular-nums">{formatRM(r.standby)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-amber-600 tabular-nums">{formatRM(r.medevac)}</td>
            <td className="px-4 py-2 text-[10px] font-black text-right text-foreground tabular-nums">{formatRM(r.total)}</td>
          </tr>
        ))}
        <tr className="bg-slate-900 text-white font-black">
          <td className="px-4 py-2.5 text-[9px] uppercase tracking-widest" colSpan={2}>Grand Total</td>
          <td className="px-3 py-2.5 text-[9px] text-center tabular-nums">{rows.reduce((s, r) => s + r.count, 0)}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{formatRM(rows.reduce((s, r) => s + r.salary, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{formatRM(rows.reduce((s, r) => s + r.fixed, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{formatRM(rows.reduce((s, r) => s + r.offshore, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{formatRM(rows.reduce((s, r) => s + r.relief, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{formatRM(rows.reduce((s, r) => s + r.standby, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{formatRM(rows.reduce((s, r) => s + r.medevac, 0))}</td>
          <td className="px-4 py-2.5 text-[10px] text-right tabular-nums">{formatRM(grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}
