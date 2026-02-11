"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow } from "@/lib/types";
import { getPivotedRosterData, getCrewMasterData, getCrewList, type CrewMasterRecord } from "@/lib/actions";
import { safeParseDate, shortenPost } from "@/lib/logic";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Area, AreaChart, Legend,
} from "recharts";

// ─── Month Range ───
function generateMonthRange() {
  const now = new Date();
  const futureEnd = new Date(now);
  futureEnd.setMonth(futureEnd.getMonth() + 3);
  const months: { year: number; month: number; label: string; isFuture: boolean }[] = [];
  let y = 2025, m = 9;
  while (y < futureEnd.getFullYear() || (y === futureEnd.getFullYear() && m <= futureEnd.getMonth() + 1)) {
    const shortMonth = new Date(y, m - 1, 1).toLocaleString("en", { month: "short" }).toUpperCase();
    const isFuture = y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1);
    months.push({ year: y, month: m, label: `${shortMonth} ${String(y).slice(-2)}`, isFuture });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ─── Colors ───
const P = {
  basic: "#334155", fixedAll: "#6366f1", offshore: "#10b981",
  relief: "#8b5cf6", standby: "#f59e0b", medevac: "#ef4444",
  ska: "#0ea5e9", sba: "#f97316", primary: "#1e40af",
};
const LOC_COLORS = ["#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981"];
const CAT_COLORS = [P.basic, P.fixedAll, P.offshore, P.relief, P.standby, P.medevac];
const CLIENT_PIE_COLORS = ["#0ea5e9", "#f97316", "#10b981", "#ef4444", "#8b5cf6", "#f59e0b"];
const CLIENT_PIE_GRADIENTS = [
  { id: "cpg0", start: "#38bdf8", end: "#0284c7" },
  { id: "cpg1", start: "#fb923c", end: "#ea580c" },
  { id: "cpg2", start: "#34d399", end: "#059669" },
  { id: "cpg3", start: "#f87171", end: "#dc2626" },
  { id: "cpg4", start: "#a78bfa", end: "#7c3aed" },
  { id: "cpg5", start: "#fbbf24", end: "#d97706" },
];

// ─── Statement types ───
const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

// ─── Cost Calc ───
interface CrewMonthCost {
  crew_name: string; post: string; client: string; location: string;
  basic: number; fixedAll: number; offshore: number; relief: number; standby: number; medevac: number; total: number;
}

function calcMonthCosts(rosterData: PivotedCrewRow[], masterData: CrewMasterRecord[], masterMap: Map<string, CrewMasterRecord>, year: number, month: number): CrewMonthCost[] {
  // Use day-number arithmetic to avoid floating-point issues
  const monthStartDate = new Date(year, month - 1, 1);
  const monthEndDate = new Date(year, month, 0); // last day of month
  const monthStartDay = Math.round(monthStartDate.getTime() / 86400000);
  const monthEndDay = Math.round(monthEndDate.getTime() / 86400000);
  const monthStartTime = monthStartDate.getTime();
  const monthEndTime = monthEndDate.getTime();
  const oaRate = 200, medevacRate = 500;
  const basicCounted = new Set<string>();
  const results: CrewMonthCost[] = [];

  for (const crew of rosterData) {
    const isOM = (crew.post || "").toUpperCase().includes("OFFSHORE MEDIC");
    const isEM = (crew.post || "").toUpperCase().includes("ESCORT MEDIC");
    let offDays = 0, relief = 0, standby = 0, medevac = 0;
    for (const cycle of Object.values(crew.cycles)) {
      const signOn = safeParseDate(cycle.sign_on);
      const signOff = safeParseDate(cycle.sign_off);
      if (!signOn || !signOff) continue;
      // sign_off date not counted: last working day = signOff - 1
      const rotStartDay = Math.round(signOn.getTime() / 86400000);
      const rotEndDay = Math.round(signOff.getTime() / 86400000) - 1;
      if (rotStartDay > monthEndDay || rotEndDay < monthStartDay) continue;
      // Clamp to month: endOfMonth - startDate + 1
      const days = Math.min(rotEndDay, monthEndDay) - Math.max(rotStartDay, monthStartDay) + 1;
      if (days <= 0) continue;
      if (isOM && cycle.is_offshore !== false) offDays += days;
      relief += (cycle.day_relief ?? 0) * (cycle.relief_all ?? 0);
      standby += (cycle.day_standby ?? 0) * (cycle.standby_all ?? 0);
      medevac += (cycle.medevac_dates || []).filter(d => {
        const md = safeParseDate(d);
        return md && md.getTime() >= monthStartTime && md.getTime() <= monthEndTime;
      }).length;
    }
    const offshoreAmt = isOM ? offDays * oaRate : 0;
    const medevacAmt = isEM ? medevac * medevacRate : 0;
    let basicAmt = 0, fixedAllAmt = 0;
    if (crew.crew_id && !basicCounted.has(crew.crew_id)) {
      const master = masterMap.get((crew.crew_name || "").toUpperCase().trim());
      if (master) { basicAmt = master.basic || 0; fixedAllAmt = master.fixed_all || 0; }
      basicCounted.add(crew.crew_id);
    }
    const total = basicAmt + fixedAllAmt + offshoreAmt + relief + standby + medevacAmt;
    if (total === 0) continue;
    results.push({ crew_name: crew.crew_name, post: crew.post, client: crew.client, location: crew.location, basic: basicAmt, fixedAll: fixedAllAmt, offshore: offshoreAmt, relief, standby, medevac: medevacAmt, total });
  }
  for (const m of masterData) {
    if (basicCounted.has(m.id)) continue;
    const basicAmt = m.basic || 0;
    const fixedAllAmt = m.fixed_all || 0;
    if (basicAmt + fixedAllAmt === 0) continue;
    basicCounted.add(m.id);
    results.push({ crew_name: m.crew_name, post: m.post, client: m.client, location: m.location, basic: basicAmt, fixedAll: fixedAllAmt, offshore: 0, relief: 0, standby: 0, medevac: 0, total: basicAmt + fixedAllAmt });
  }
  return results;
}

const fmtRM = (v: number) => v === 0 ? "-" : `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v.toFixed(0)}`;
const fmtAmt = (val: number) => val === 0 ? "-" : val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Animated Counter ───
function useCounter(target: number, dur = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!target) { setV(0); return; }
    const s = performance.now();
    const f = (n: number) => { const p = Math.min((n - s) / dur, 1); setV(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }, [target, dur]);
  return v;
}

// ─── Tooltips ───
function TT({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900/95 backdrop-blur-sm p-2 shadow-2xl">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-px">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: e.color }} />
            <span className="text-[9px] font-bold text-slate-300">{e.name}</span>
          </div>
          <span className="text-[9px] font-black text-white tabular-nums">{fmtRM(e.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PTT({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  const e = payload[0];
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900/95 backdrop-blur-sm p-2 shadow-2xl">
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: e.payload.fill }} />
        <span className="text-[10px] font-black text-white">{e.name}</span>
      </div>
      <p className="text-[9px] font-bold text-slate-300 tabular-nums">{fmtRM(e.value)}</p>
    </div>
  );
}

// ─── 3D Bar Shapes ───
function Bar3D(props: Record<string, unknown>) {
  const { x, y, width, height, fill } = props as { x: number; y: number; width: number; height: number; fill: string };
  if (!height || height <= 0) return null;
  const d = 5;
  return (
    <g>
      <polygon points={`${x},${y} ${x + d},${y - d} ${x + width + d},${y - d} ${x + width},${y}`} fill={fill} opacity={0.65} />
      <polygon points={`${x + width},${y} ${x + width + d},${y - d} ${x + width + d},${y + height - d} ${x + width},${y + height}`} fill={fill} opacity={0.4} />
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={1} />
    </g>
  );
}

function HBar3D(props: Record<string, unknown>) {
  const { x, y, width, height, fill } = props as { x: number; y: number; width: number; height: number; fill: string };
  if (!width || width <= 0) return null;
  const d = 4;
  return (
    <g>
      <polygon points={`${x},${y} ${x + d},${y - d} ${x + width + d},${y - d} ${x + width},${y}`} fill={fill} opacity={0.55} />
      <polygon points={`${x + width},${y} ${x + width + d},${y - d} ${x + width + d},${y + height - d} ${x + width},${y + height}`} fill={fill} opacity={0.35} />
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />
    </g>
  );
}

// ─── Main Component ───
export default function FinancialDashboardPage() {
  const [data, setData] = useState<PivotedCrewRow[]>([]);
  const [masterData, setMasterData] = useState<CrewMasterRecord[]>([]);
  const [crewList, setCrewList] = useState<{ id: string; crew_name: string; clean_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs: Dashboard | Budgeting
  type TabType = "dashboard" | "budgeting";
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // Budgeting
  const [budgetBuffer, setBudgetBuffer] = useState(10);

  useEffect(() => {
    Promise.all([getPivotedRosterData(), getCrewMasterData(), getCrewList()]).then(([p, m, crewResult]) => {
      setData(p); setMasterData(m);
      if (crewResult.success && crewResult.data) setCrewList(crewResult.data);
      setLoading(false);
    });
  }, []);

  const masterMap = useMemo(() => {
    const map = new Map<string, CrewMasterRecord>();
    for (const m of masterData) map.set((m.crew_name || "").toUpperCase().trim(), m);
    return map;
  }, [masterData]);

  const crewNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const staff of crewList) map.set(staff.id, staff.clean_name || staff.crew_name);
    return map;
  }, [crewList]);

  const getDisplayName = (crewId: string, crewName: string) => {
    const masterName = crewNameMap.get(crewId);
    if (!masterName) return crewName;
    const suffixMatch = (crewName || "").match(/\s*(\([A-Z]\d*\))\s*$/);
    return suffixMatch ? `${masterName} ${suffixMatch[1]}` : masterName;
  };

  const monthRange = useMemo(() => generateMonthRange(), []);

  // ─── Dashboard Data ───
  const monthly = useMemo(() => {
    return monthRange.map(({ year, month, label, isFuture }) => {
      const costs = calcMonthCosts(data, masterData, masterMap, year, month);
      const basic = costs.reduce((s, c) => s + c.basic, 0);
      const fixedAll = costs.reduce((s, c) => s + c.fixedAll, 0);
      const offshore = costs.reduce((s, c) => s + c.offshore, 0);
      const relief = costs.reduce((s, c) => s + c.relief, 0);
      const standby = costs.reduce((s, c) => s + c.standby, 0);
      const medevac = costs.reduce((s, c) => s + c.medevac, 0);
      return { label, isFuture, basic, fixedAll, offshore, relief, standby, medevac, total: basic + fixedAll + offshore + relief + standby + medevac };
    });
  }, [data, masterData, masterMap, monthRange]);

  const actual = monthly.filter(m => !m.isFuture);
  const totalActual = actual.reduce((s, c) => s + c.total, 0);
  const totalBasic = actual.reduce((s, c) => s + c.basic, 0);
  const totalFixedAll = actual.reduce((s, c) => s + c.fixedAll, 0);
  const totalOffshore = actual.reduce((s, c) => s + c.offshore, 0);
  const totalRelief = actual.reduce((s, c) => s + c.relief, 0);
  const monthlyAvg = actual.length > 0 ? totalActual / actual.length : 0;

  const clientData = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthRange.filter(mr => !mr.isFuture)) {
      for (const c of calcMonthCosts(data, masterData, masterMap, m.year, m.month)) {
        map.set(c.client || "Unknown", (map.get(c.client || "Unknown") || 0) + c.total);
      }
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data, masterData, masterMap, monthRange]);

  const locData = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthRange.filter(mr => !mr.isFuture)) {
      for (const c of calcMonthCosts(data, masterData, masterMap, m.year, m.month)) {
        map.set(c.location || "Unknown", (map.get(c.location || "Unknown") || 0) + c.total);
      }
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [data, masterData, masterMap, monthRange]);

  const catData = useMemo(() => {
    let bas = 0, fix = 0, off = 0, rel = 0, stb = 0, med = 0;
    for (const m of actual) { bas += m.basic; fix += m.fixedAll; off += m.offshore; rel += m.relief; stb += m.standby; med += m.medevac; }
    return [
      { name: "Basic", value: bas }, { name: "Fixed All.", value: fix },
      { name: "Offshore", value: off }, { name: "Relief", value: rel },
      { name: "Standby", value: stb }, { name: "Medevac", value: med },
    ].filter(c => c.value > 0);
  }, [actual]);

  const trendData = monthly.map(d => ({ label: d.label, total: d.total, isFuture: d.isFuture }));

  const aTotal = useCounter(totalActual);
  const aAvg = useCounter(monthlyAvg);
  const aBas = useCounter(totalBasic);
  const aFix = useCounter(totalFixedAll);
  const aOff = useCounter(totalOffshore);
  const aRel = useCounter(totalRelief);

  // ─── Budgeting period state ───
  const [budgetPeriod, setBudgetPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // ─── Budgeting Data (1-month estimate) ───
  const budgetData = useMemo(() => {
    const [by, bm] = budgetPeriod.split("-").map(Number);
    const periodLabel = `${MONTH_NAMES[bm - 1]} ${by}`;
    const bufferMultiplier = 1 + budgetBuffer / 100;

    const clientMap = new Map<string, { client: string; fixed: number; variable: number; total: number }>();
    const tradeMap = new Map<string, { trade: string; fixed: number; variable: number; total: number }>();
    const costs = calcMonthCosts(data, masterData, masterMap, by, bm);

    for (const c of costs) {
      const fixedCost = c.basic + c.fixedAll;
      const variableCost = (c.offshore + c.relief + c.standby + c.medevac) * bufferMultiplier;
      const rowTotal = fixedCost + variableCost;

      // By Client
      const clientKey = c.client || "Unknown";
      if (!clientMap.has(clientKey)) clientMap.set(clientKey, { client: clientKey, fixed: 0, variable: 0, total: 0 });
      const ce = clientMap.get(clientKey)!;
      ce.fixed += fixedCost; ce.variable += variableCost; ce.total += rowTotal;

      // By Trade
      const tradeKey = shortenPost(c.post) as string;
      if (!tradeMap.has(tradeKey)) tradeMap.set(tradeKey, { trade: tradeKey, fixed: 0, variable: 0, total: 0 });
      const te = tradeMap.get(tradeKey)!;
      te.fixed += fixedCost; te.variable += variableCost; te.total += rowTotal;
    }

    return {
      periodLabel,
      byClient: Array.from(clientMap.values()).sort((a, b) => b.total - a.total),
      byTrade: Array.from(tradeMap.values()).sort((a, b) => b.total - a.total),
      grandFixed: Array.from(clientMap.values()).reduce((s, r) => s + r.fixed, 0),
      grandVariable: Array.from(clientMap.values()).reduce((s, r) => s + r.variable, 0),
      grandTotal: Array.from(clientMap.values()).reduce((s, r) => s + r.total, 0),
    };
  }, [data, masterData, masterMap, budgetBuffer, budgetPeriod]);

  // ─── SKA vs SBA category breakdown for Budgeting charts ───
  const budgetClientCategoryData = useMemo(() => {
    const [by, bm] = budgetPeriod.split("-").map(Number);
    const bufferMultiplier = 1 + budgetBuffer / 100;
    const costs = calcMonthCosts(data, masterData, masterMap, by, bm);

    const clientCats = new Map<string, { basic: number; fixedAll: number; offshore: number; relief: number; standby: number; medevac: number; total: number }>();
    for (const c of costs) {
      const key = c.client || "Unknown";
      if (!clientCats.has(key)) clientCats.set(key, { basic: 0, fixedAll: 0, offshore: 0, relief: 0, standby: 0, medevac: 0, total: 0 });
      const e = clientCats.get(key)!;
      e.basic += c.basic;
      e.fixedAll += c.fixedAll;
      e.offshore += c.offshore * bufferMultiplier;
      e.relief += c.relief * bufferMultiplier;
      e.standby += c.standby * bufferMultiplier;
      e.medevac += c.medevac * bufferMultiplier;
      e.total += c.basic + c.fixedAll + (c.offshore + c.relief + c.standby + c.medevac) * bufferMultiplier;
    }

    // Chart data: each category as a row with SKA / SBA values
    const ska = clientCats.get("SKA") || { basic: 0, fixedAll: 0, offshore: 0, relief: 0, standby: 0, medevac: 0, total: 0 };
    const sba = clientCats.get("SBA") || { basic: 0, fixedAll: 0, offshore: 0, relief: 0, standby: 0, medevac: 0, total: 0 };

    const barData = [
      { category: "Basic", SKA: ska.basic, SBA: sba.basic },
      { category: "Fixed All.", SKA: ska.fixedAll, SBA: sba.fixedAll },
      { category: "Offshore", SKA: ska.offshore, SBA: sba.offshore },
      { category: "Relief", SKA: ska.relief, SBA: sba.relief },
      { category: "Standby", SKA: ska.standby, SBA: sba.standby },
      { category: "Medevac", SKA: ska.medevac, SBA: sba.medevac },
    ].filter(d => d.SKA > 0 || d.SBA > 0);

    const grandTotal = ska.total + sba.total;
    const clientTotals = Array.from(clientCats.entries())
      .map(([name, vals]) => ({ name, total: vals.total, pct: grandTotal > 0 ? (vals.total / grandTotal) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    return { barData, clientTotals, grandTotal, ska, sba };
  }, [data, masterData, masterMap, budgetBuffer, budgetPeriod]);

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    </AppShell>
  );

  // ─── Tab definitions ───
  const tabs: { id: TabType; label: string; hidden?: boolean }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "budgeting", label: "Budgeting" },
  ];

  return (
    <AppShell>
      <div className="flex flex-col flex-1 min-h-0 gap-3 animate-in fade-in duration-500 mt-1">

        {/* Header + Tabs */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground uppercase tracking-tight leading-none">Financial Dashboard</h2>
            <p className="text-[9px] text-muted-foreground mt-0.5">Cost Breakdown | Sept 2025 onwards | Basic + Fixed + Offshore + Relief + Standby + Medevac</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab Buttons */}
            <div className="flex items-center bg-muted rounded-xl p-0.5 border border-border">
              {tabs.filter(t => !t.hidden).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {activeTab !== "dashboard" && (
              <button onClick={() => {
                const titles: Record<TabType, string> = { dashboard: "Financial_Report", budgeting: "Budget_Projection" };
                document.title = `${titles[activeTab]}_${new Date().toISOString().slice(0,10)}`;
                window.print();
              }} className="print-btn p-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-sm" title="Print">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* ═══════════════ DASHBOARD TAB ═══════════════ */}
        {activeTab === "dashboard" && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { label: "Total Actual", val: aTotal, color: P.primary },
                { label: "Monthly Avg", val: aAvg, color: P.primary },
                { label: "Basic Salary", val: aBas, color: P.basic },
                { label: "Fixed Allowance", val: aFix, color: P.fixedAll },
                { label: "Offshore Allow.", val: aOff, color: P.offshore },
                { label: "Relief Allow.", val: aRel, color: P.relief },
              ].map(c => (
                <div key={c.label} className="relative rounded-xl border border-border bg-card overflow-hidden group hover:scale-[1.02] transition-transform">
                  <div className="absolute top-0 left-0 w-full h-0.5" style={{ backgroundColor: c.color }} />
                  <div className="px-3 py-2.5">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">{c.label}</p>
                    <p className="text-lg font-black text-foreground tabular-nums mt-0.5">RM {fmtK(c.val)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Trend + Stacked Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 pt-3 pb-1"><h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Monthly Trend</h3></div>
                <div className="h-44 px-1 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 8, right: 12, left: 5, bottom: 3 }}>
                      <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.primary} stopOpacity={0.35} /><stop offset="100%" stopColor={P.primary} stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.2} />
                      <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 7, fontWeight: 700 }} interval={1} angle={-45} textAnchor="end" height={35} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 7, fontWeight: 700 }} tickFormatter={fmtK} width={40} />
                      <Tooltip content={<TT />} />
                      <Area type="monotone" dataKey="total" stroke={P.primary} strokeWidth={2} fill="url(#tg)" animationDuration={1200} dot={({ cx, cy, index }: { cx: number; cy: number; index: number }) => (
                        <circle key={index} cx={cx} cy={cy} r={2.5} fill={trendData[index]?.isFuture ? P.standby : P.primary} stroke="#0f172a" strokeWidth={1.5} />
                      )} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 pt-3 pb-1 flex items-center justify-between">
                  <h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Monthly Breakdown</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {[{ k: "Basic", c: P.basic }, { k: "Fixed All.", c: P.fixedAll }, { k: "Offshore", c: P.offshore }, { k: "Relief", c: P.relief }, { k: "Standby", c: P.standby }, { k: "Medevac", c: P.medevac }].map(l => (
                      <div key={l.k} className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.c }} /><span className="text-[7px] font-bold text-muted-foreground uppercase">{l.k}</span></div>
                    ))}
                  </div>
                </div>
                <div className="h-44 px-1 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly} margin={{ top: 12, right: 12, left: 5, bottom: 3 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.2} />
                      <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 7, fontWeight: 700 }} interval={0} angle={-45} textAnchor="end" height={35} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 7, fontWeight: 700 }} tickFormatter={fmtK} width={40} />
                      <Tooltip content={<TT />} />
                      <Bar dataKey="basic" stackId="c" name="Basic" fill={P.basic} shape={<Bar3D />} animationDuration={1000} />
                      <Bar dataKey="fixedAll" stackId="c" name="Fixed All." fill={P.fixedAll} shape={<Bar3D />} animationDuration={1000} />
                      <Bar dataKey="offshore" stackId="c" name="Offshore" fill={P.offshore} shape={<Bar3D />} animationDuration={1000} />
                      <Bar dataKey="relief" stackId="c" name="Relief" fill={P.relief} shape={<Bar3D />} animationDuration={1000} />
                      <Bar dataKey="standby" stackId="c" name="Standby" fill={P.standby} shape={<Bar3D />} animationDuration={1000} />
                      <Bar dataKey="medevac" stackId="c" name="Medevac" fill={P.medevac} shape={<Bar3D />} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Bottom row: Client Donut + Top Locations + Category Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 pt-3 pb-1"><h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Cost by Client</h3></div>
                {clientData.length === 0 ? <p className="text-xs text-muted-foreground text-center py-10">No data</p> : (
                  <>
                    <div className="h-40 flex items-center justify-center" style={{ perspective: "800px" }}>
                      <div style={{ transform: "rotateX(15deg) rotateZ(-2deg)" }} className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <defs>
                              {CLIENT_PIE_GRADIENTS.map(g => (
                                <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor={g.start} stopOpacity={1} />
                                  <stop offset="100%" stopColor={g.end} stopOpacity={0.85} />
                                </linearGradient>
                              ))}
                            </defs>
                            <Pie data={clientData} cx="50%" cy="50%" outerRadius={65} paddingAngle={5} dataKey="value" nameKey="name" animationDuration={1200} label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: "#64748b", strokeWidth: 1 }}>
                              {clientData.map((e, i) => <Cell key={e.name} fill={`url(#${CLIENT_PIE_GRADIENTS[i % CLIENT_PIE_GRADIENTS.length].id})`} stroke="#0f172a" strokeWidth={2} />)}
                            </Pie>
                            <Tooltip content={<PTT />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="px-3 pb-3 space-y-1">
                      {clientData.map((c, i) => (<div key={c.name} className="flex items-center justify-between"><div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CLIENT_PIE_COLORS[i % CLIENT_PIE_COLORS.length] }} /><span className="text-[9px] font-bold text-foreground">{c.name}</span></div><span className="text-[9px] font-black text-foreground tabular-nums">{fmtRM(c.value)}</span></div>))}
                    </div>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 pt-3 pb-1"><h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Top 5 Locations</h3></div>
                {locData.length === 0 ? <p className="text-xs text-muted-foreground text-center py-10">No data</p> : (
                  <div className="h-52 px-1 pb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={locData} layout="vertical" margin={{ top: 5, right: 15, left: 3, bottom: 3 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.2} horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 7, fontWeight: 700 }} tickFormatter={fmtK} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "#e2e8f0", fontSize: 8, fontWeight: 800 }} width={60} />
                        <Tooltip content={<TT />} />
                        <Bar dataKey="value" name="Total" shape={<HBar3D />} animationDuration={1000}>{locData.map((_, i) => <Cell key={i} fill={LOC_COLORS[i]} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 pt-3 pb-1"><h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Allowance Category Share</h3></div>
                {catData.length === 0 ? <p className="text-xs text-muted-foreground text-center py-10">No data</p> : (
                  <>
                    <div className="h-40 flex items-center justify-center" style={{ perspective: "600px" }}>
                      <div style={{ transform: "rotateX(10deg)" }} className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart><Pie data={catData} cx="50%" cy="50%" outerRadius={60} paddingAngle={3} dataKey="value" nameKey="name" animationDuration={1200} label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: "#64748b", strokeWidth: 1 }}>{catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i]} stroke="#0f172a" strokeWidth={2} />)}</Pie><Tooltip content={<PTT />} /></PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="px-3 pb-3 space-y-1">
                      {catData.map((c, i) => (<div key={c.name} className="flex items-center justify-between"><div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CAT_COLORS[i] }} /><span className="text-[9px] font-bold text-foreground">{c.name}</span></div><span className="text-[9px] font-black text-foreground tabular-nums">{fmtRM(c.value)}</span></div>))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══════════════ BUDGETING TAB ═══════════════ */}
        {activeTab === "budgeting" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Monthly Cost Estimate</h3>
                <p className="text-[9px] text-muted-foreground">Fixed costs from master data. Variable costs from roster cycles with buffer multiplier.</p>
              </div>
              <div className="flex items-center gap-3 bg-muted px-4 py-2 rounded-xl border border-border" data-no-print>
                <div className="flex flex-col">
                  <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Period</label>
                  <select value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value)} className="bg-transparent text-[11px] font-black uppercase outline-none cursor-pointer">
                    {(() => {
                      const now = new Date();
                      const curYear = now.getFullYear();
                      const curMonth = now.getMonth() + 1;
                      const opts: { value: string; label: string }[] = [];
                      for (let y = curYear; y <= 2026; y++) { const startM = y === curYear ? curMonth : 1; for (let m = startM; m <= 12; m++) { const val = `${y}-${String(m).padStart(2, "0")}`; opts.push({ value: val, label: `${MONTH_NAMES[m - 1]} ${y}` }); } }
                      return opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>);
                    })()}
                  </select>
                </div>
                <div className="flex items-center gap-2 border-l border-border pl-3">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Buffer</label>
                  <input type="range" min={0} max={50} value={budgetBuffer} onChange={(e) => setBudgetBuffer(parseInt(e.target.value))} className="w-24 h-1.5 bg-blue-200 rounded-full appearance-none cursor-pointer" />
                  <span className="text-[11px] font-black text-foreground tabular-nums w-8 text-right">{budgetBuffer}%</span>
                </div>
              </div>
            </div>

            {/* ─── SKA vs SBA Comparison Section ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              {/* Stacked 3D Bar Chart: cost breakdown by category */}
              <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 pt-3 pb-1 flex items-center justify-between">
                  <h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">SKA vs SBA - Cost by Category</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: P.ska }} /><span className="text-[8px] font-bold text-muted-foreground uppercase">SKA</span></div>
                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: P.sba }} /><span className="text-[8px] font-bold text-muted-foreground uppercase">SBA</span></div>
                  </div>
                </div>
                <div className="h-52 px-1 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={budgetClientCategoryData.barData} margin={{ top: 12, right: 12, left: 5, bottom: 3 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.2} />
                      <XAxis dataKey="category" tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 700 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 7, fontWeight: 700 }} tickFormatter={fmtK} width={45} />
                      <Tooltip content={<TT />} />
                      <Bar dataKey="SKA" stackId="comp" name="SKA" fill={P.ska} shape={<Bar3D />} animationDuration={1000} />
                      <Bar dataKey="SBA" stackId="comp" name="SBA" fill={P.sba} shape={<Bar3D />} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Proportional Bar: each client's total + percentage */}
              <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 pt-3 pb-1">
                  <h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Client Share - {budgetData.periodLabel}</h3>
                </div>
                <div className="px-3 py-3 space-y-3">
                  {/* Grand total card */}
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Grand Total</p>
                    <p className="text-lg font-black text-foreground tabular-nums mt-0.5">{fmtRM(budgetClientCategoryData.grandTotal)}</p>
                  </div>
                  {/* Proportional stacked bar */}
                  <div className="rounded-lg overflow-hidden h-6 flex" style={{ minWidth: 0 }}>
                    {budgetClientCategoryData.clientTotals.map((ct, i) => (
                      <div
                        key={ct.name}
                        className="h-full flex items-center justify-center transition-all duration-700"
                        style={{ width: `${ct.pct}%`, backgroundColor: i === 0 ? P.ska : P.sba, minWidth: ct.pct > 0 ? "30px" : 0 }}
                      >
                        {ct.pct > 10 && <span className="text-[9px] font-black text-white">{ct.pct.toFixed(0)}%</span>}
                      </div>
                    ))}
                  </div>
                  {/* Client breakdown list */}
                  {budgetClientCategoryData.clientTotals.map((ct, i) => (
                    <div key={ct.name} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: i === 0 ? P.ska : P.sba }} />
                        <span className="text-[10px] font-black text-foreground uppercase">{ct.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-muted-foreground tabular-nums">{ct.pct.toFixed(1)}%</span>
                        <span className="text-[10px] font-black text-foreground tabular-nums">{fmtRM(ct.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Split by Client & Trade - equal height grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" style={{ gridAutoRows: "1fr" }}>
              <div className="rounded-xl overflow-hidden flex flex-col shadow-lg border border-slate-200 dark:border-border">
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-white uppercase tracking-wider">By Client</h4>
                      <p className="text-[8px] font-bold text-blue-200 uppercase">{budgetData.periodLabel}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-bold text-blue-200 uppercase">Grand Total</p>
                    <p className="text-[13px] font-black text-white tabular-nums">{fmtAmt(budgetData.grandTotal)}</p>
                  </div>
                </div>
                <div className="flex-1 flex flex-col bg-card">
                  <table className="w-full border-collapse text-[11px] flex-1">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-muted/50 border-b-2 border-slate-200 dark:border-border">
                        <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground text-[9px]">Client</th>
                        <th className="px-4 py-2.5 text-right font-bold uppercase tracking-widest text-slate-500 dark:text-muted-foreground text-[9px]">Fixed</th>
                        <th className="px-4 py-2.5 text-right font-bold uppercase tracking-widest text-slate-500 dark:text-muted-foreground text-[9px]">Variable</th>
                        <th className="px-4 py-2.5 text-right font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground text-[9px]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetData.byClient.map((r, i) => (
                        <tr key={r.client} className={`transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/20 border-b border-slate-100 dark:border-border/40 ${i % 2 === 1 ? "bg-slate-50/70 dark:bg-muted/10" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: i === 0 ? P.ska : P.sba }} />
                              <span className="font-black text-foreground uppercase text-[11px]">{r.client}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-600 dark:text-foreground">{fmtAmt(r.fixed)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-600 dark:text-foreground">{fmtAmt(r.variable)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-black text-foreground">{fmtAmt(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="text-white font-black" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)" }}>
                        <td className="px-4 py-3 uppercase tracking-widest text-[10px]">Total</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[11px]">{fmtAmt(budgetData.grandFixed)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[11px]">{fmtAmt(budgetData.grandVariable)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[12px]">{fmtAmt(budgetData.grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Split by Trade */}
              <div className="rounded-xl overflow-hidden flex flex-col shadow-lg border border-slate-200 dark:border-border">
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-white uppercase tracking-wider">By Trade</h4>
                      <p className="text-[8px] font-bold text-blue-200 uppercase">{budgetData.periodLabel}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-bold text-blue-200 uppercase">Grand Total</p>
                    <p className="text-[13px] font-black text-white tabular-nums">{fmtAmt(budgetData.grandTotal)}</p>
                  </div>
                </div>
                <div className="flex-1 flex flex-col bg-card">
                  <table className="w-full border-collapse text-[11px] flex-1">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-muted/50 border-b-2 border-slate-200 dark:border-border">
                        <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground text-[9px]">Trade</th>
                        <th className="px-4 py-2.5 text-right font-bold uppercase tracking-widest text-slate-500 dark:text-muted-foreground text-[9px]">Fixed</th>
                        <th className="px-4 py-2.5 text-right font-bold uppercase tracking-widest text-slate-500 dark:text-muted-foreground text-[9px]">Variable</th>
                        <th className="px-4 py-2.5 text-right font-black uppercase tracking-widest text-slate-500 dark:text-muted-foreground text-[9px]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetData.byTrade.map((r, i) => {
                        const tradeColors = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9"];
                        return (
                          <tr key={r.trade} className={`transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/20 border-b border-slate-100 dark:border-border/40 ${i % 2 === 1 ? "bg-slate-50/70 dark:bg-muted/10" : ""}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tradeColors[i % tradeColors.length] }} />
                                <span className="font-black text-foreground uppercase text-[11px]">{r.trade}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-600 dark:text-foreground">{fmtAmt(r.fixed)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-600 dark:text-foreground">{fmtAmt(r.variable)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-black text-foreground">{fmtAmt(r.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="text-white font-black" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)" }}>
                        <td className="px-4 py-3 uppercase tracking-widest text-[10px]">Total</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[11px]">{fmtAmt(budgetData.grandFixed)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[11px]">{fmtAmt(budgetData.grandVariable)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[12px]">{fmtAmt(budgetData.grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
