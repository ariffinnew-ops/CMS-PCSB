"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow } from "@/lib/types";
import { getPivotedRosterData, getCrewMasterData, type CrewMasterRecord } from "@/lib/actions";
import { safeParseDate, shortenPost } from "@/lib/logic";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Area, AreaChart,
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
  basic: "#334155",
  fixedAll: "#6366f1",
  offshore: "#10b981",
  relief: "#8b5cf6",
  standby: "#f59e0b",
  medevac: "#ef4444",
  ska: "#0ea5e9",
  sba: "#f97316",
  primary: "#1e40af",
};
const LOC_COLORS = ["#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981"];
const CAT_COLORS = [P.basic, P.fixedAll, P.offshore, P.relief, P.standby, P.medevac];

// ─── Cost Calc: Basic + Fixed + Offshore + Relief + Standby + Medevac ───
interface CrewMonthCost {
  crew_name: string; post: string; client: string; location: string;
  basic: number; fixedAll: number;
  offshore: number; relief: number; standby: number; medevac: number; total: number;
}

function calcMonthCosts(
  rosterData: PivotedCrewRow[],
  masterData: CrewMasterRecord[],
  masterMap: Map<string, CrewMasterRecord>,
  year: number, month: number,
): CrewMonthCost[] {
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const monthStartTime = monthStart.getTime();
  const monthEndTime = monthEnd.getTime();
  const oaRate = 200;
  const medevacRate = 500;

  // Track which crew_ids we already accounted basic/fixed_all for (avoid duplicates from multiple roster entries)
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
      const rotEnd = signOff.getTime() - 86400000;
      if (signOn.getTime() > monthEndTime || rotEnd < monthStartTime) continue;
      const days = Math.ceil((Math.min(rotEnd, monthEndTime) - Math.max(signOn.getTime(), monthStartTime)) / 864e5) + 1;
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

    // Monthly basic + fixed_all from master (count once per unique crew_id)
    let basicAmt = 0, fixedAllAmt = 0;
    if (crew.crew_id && !basicCounted.has(crew.crew_id)) {
      const master = masterMap.get((crew.crew_name || "").toUpperCase().trim());
      if (master) {
        basicAmt = master.basic || 0;
        fixedAllAmt = master.fixed_all || 0;
      }
      basicCounted.add(crew.crew_id);
    }

    const total = basicAmt + fixedAllAmt + offshoreAmt + relief + standby + medevacAmt;
    if (total === 0) continue;
    results.push({
      crew_name: crew.crew_name, post: crew.post, client: crew.client, location: crew.location,
      basic: basicAmt, fixedAll: fixedAllAmt,
      offshore: offshoreAmt, relief, standby, medevac: medevacAmt, total,
    });
  }

  // Also include master staff with basic/fixed_all who may not be in rosterData
  for (const m of masterData) {
    if (basicCounted.has(m.id)) continue;
    const basicAmt = m.basic || 0;
    const fixedAllAmt = m.fixed_all || 0;
    if (basicAmt + fixedAllAmt === 0) continue;
    basicCounted.add(m.id);
    results.push({
      crew_name: m.crew_name, post: m.post, client: m.client, location: m.location,
      basic: basicAmt, fixedAll: fixedAllAmt,
      offshore: 0, relief: 0, standby: 0, medevac: 0, total: basicAmt + fixedAllAmt,
    });
  }

  return results;
}

const fmtRM = (v: number) => v === 0 ? "-" : `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v.toFixed(0)}`;

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPivotedRosterData(), getCrewMasterData()]).then(([p, m]) => {
      setData(p); setMasterData(m); setLoading(false);
    });
  }, []);

  const masterMap = useMemo(() => {
    const map = new Map<string, CrewMasterRecord>();
    for (const m of masterData) map.set((m.crew_name || "").toUpperCase().trim(), m);
    return map;
  }, [masterData]);

  const monthRange = useMemo(() => generateMonthRange(), []);

  // Monthly stacked data
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
  const estimated = monthly.filter(m => m.isFuture);
  const totalActual = actual.reduce((s, c) => s + c.total, 0);
  const totalBasic = actual.reduce((s, c) => s + c.basic, 0);
  const totalFixedAll = actual.reduce((s, c) => s + c.fixedAll, 0);
  const totalOffshore = actual.reduce((s, c) => s + c.offshore, 0);
  const totalRelief = actual.reduce((s, c) => s + c.relief, 0);
  const totalStandby = actual.reduce((s, c) => s + c.standby, 0);
  const totalMedevac = actual.reduce((s, c) => s + c.medevac, 0);
  const monthlyAvg = actual.length > 0 ? totalActual / actual.length : 0;
  const totalEst = estimated.reduce((s, c) => s + c.total, 0);

  // Client donut
  const clientData = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthRange.filter(mr => !mr.isFuture)) {
      for (const c of calcMonthCosts(data, masterData, masterMap, m.year, m.month)) {
        map.set(c.client || "Unknown", (map.get(c.client || "Unknown") || 0) + c.total);
      }
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data, masterData, masterMap, monthRange]);

  // Top 5 locations
  const locData = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthRange.filter(mr => !mr.isFuture)) {
      for (const c of calcMonthCosts(data, masterData, masterMap, m.year, m.month)) {
        map.set(c.location || "Unknown", (map.get(c.location || "Unknown") || 0) + c.total);
      }
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [data, masterData, masterMap, monthRange]);

  // Category share
  const catData = useMemo(() => {
    let bas = 0, fix = 0, off = 0, rel = 0, stb = 0, med = 0;
    for (const m of actual) { bas += m.basic; fix += m.fixedAll; off += m.offshore; rel += m.relief; stb += m.standby; med += m.medevac; }
    return [
      { name: "Basic", value: bas },
      { name: "Fixed All.", value: fix },
      { name: "Offshore", value: off },
      { name: "Relief", value: rel },
      { name: "Standby", value: stb },
      { name: "Medevac", value: med },
    ].filter(c => c.value > 0);
  }, [actual]);

  // Trend
  const trendData = monthly.map(d => ({ label: d.label, total: d.total, isFuture: d.isFuture }));

  const aTotal = useCounter(totalActual);
  const aAvg = useCounter(monthlyAvg);
  const aBas = useCounter(totalBasic);
  const aFix = useCounter(totalFixedAll);
  const aOff = useCounter(totalOffshore);
  const aRel = useCounter(totalRelief);

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="space-y-3 animate-in fade-in duration-500 mt-1">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground uppercase tracking-tight leading-none">Financial Dashboard</h2>
            <p className="text-[9px] text-muted-foreground mt-0.5">Cost Breakdown | Sept 2025 onwards | Basic + Fixed + Offshore + Relief + Standby + Medevac</p>
          </div>
          <button onClick={() => { document.title = `Financial_Report_${new Date().toISOString().slice(0,10)}`; window.print(); }} className="print-btn p-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-sm" title="Print Report">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          </button>
        </div>

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

        {/* Trend + Stacked Bar side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {/* Trend Area - 2/5 */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 pt-3 pb-1">
              <h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Monthly Trend</h3>
            </div>
            <div className="h-44 px-1 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 12, left: 5, bottom: 3 }}>
                  <defs>
                    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={P.primary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={P.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
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

          {/* Stacked Bar - 3/5 */}
          <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
              <h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Monthly Breakdown</h3>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { k: "Basic", c: P.basic }, { k: "Fixed All.", c: P.fixedAll },
                  { k: "Offshore", c: P.offshore }, { k: "Relief", c: P.relief },
                  { k: "Standby", c: P.standby }, { k: "Medevac", c: P.medevac },
                ].map(l => (
                  <div key={l.k} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.c }} />
                    <span className="text-[7px] font-bold text-muted-foreground uppercase">{l.k}</span>
                  </div>
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
          {/* Client Donut */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 pt-3 pb-1">
              <h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Cost by Client</h3>
            </div>
            {clientData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No data</p>
            ) : (
              <>
                <div className="h-40 flex items-center justify-center" style={{ perspective: "600px" }}>
                  <div style={{ transform: "rotateX(12deg)" }} className="w-full h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={clientData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={4} dataKey="value" nameKey="name" animationDuration={1200}
                          label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ stroke: "#64748b", strokeWidth: 1 }}
                        >
                          {clientData.map((e, i) => <Cell key={e.name} fill={i === 0 ? P.ska : P.sba} stroke="#0f172a" strokeWidth={2} />)}
                        </Pie>
                        <Tooltip content={<PTT />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="px-3 pb-3 space-y-1">
                  {clientData.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: i === 0 ? P.ska : P.sba }} />
                        <span className="text-[9px] font-bold text-foreground">{c.name}</span>
                      </div>
                      <span className="text-[9px] font-black text-foreground tabular-nums">{fmtRM(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Top 5 Locations */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 pt-3 pb-1">
              <h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Top 5 Locations</h3>
            </div>
            {locData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No data</p>
            ) : (
              <div className="h-52 px-1 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={locData} layout="vertical" margin={{ top: 5, right: 15, left: 3, bottom: 3 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.2} horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 7, fontWeight: 700 }} tickFormatter={fmtK} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#e2e8f0", fontSize: 8, fontWeight: 800 }} width={60} />
                    <Tooltip content={<TT />} />
                    <Bar dataKey="value" name="Total" shape={<HBar3D />} animationDuration={1000}>
                      {locData.map((_, i) => <Cell key={i} fill={LOC_COLORS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Category Share Pie */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 pt-3 pb-1">
              <h3 className="text-[9px] font-black text-foreground uppercase tracking-wider">Allowance Category Share</h3>
            </div>
            {catData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No data</p>
            ) : (
              <>
                <div className="h-40 flex items-center justify-center" style={{ perspective: "600px" }}>
                  <div style={{ transform: "rotateX(10deg)" }} className="w-full h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={catData} cx="50%" cy="50%" outerRadius={60} paddingAngle={3} dataKey="value" nameKey="name" animationDuration={1200}
                          label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ stroke: "#64748b", strokeWidth: 1 }}
                        >
                          {catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i]} stroke="#0f172a" strokeWidth={2} />)}
                        </Pie>
                        <Tooltip content={<PTT />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="px-3 pb-3 space-y-1">
                  {catData.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CAT_COLORS[i] }} />
                        <span className="text-[9px] font-bold text-foreground">{c.name}</span>
                      </div>
                      <span className="text-[9px] font-black text-foreground tabular-nums">{fmtRM(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Summary Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border" style={{ backgroundColor: "#1e3a8a" }}>
            <h3 className="text-[9px] font-black text-white uppercase tracking-wider">Summary by Client & Trade (Current Month)</h3>
          </div>
          <SummaryTable data={data} masterData={masterData} masterMap={masterMap} />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Summary Table ───
function SummaryTable({ data, masterData, masterMap }: { data: PivotedCrewRow[]; masterData: CrewMasterRecord[]; masterMap: Map<string, CrewMasterRecord> }) {
  const now = new Date();
  const costs = calcMonthCosts(data, masterData, masterMap, now.getFullYear(), now.getMonth() + 1);

  const rows = useMemo(() => {
    const map = new Map<string, Map<string, { count: number; offshore: number; relief: number; standby: number; medevac: number; total: number }>>();
    for (const c of costs) {
      const client = c.client || "Unknown";
      const trade = shortenPost(c.post) || "Other";
      if (!map.has(client)) map.set(client, new Map());
      const tm = map.get(client)!;
      if (!tm.has(trade)) tm.set(trade, { count: 0, offshore: 0, relief: 0, standby: 0, medevac: 0, total: 0 });
      const e = tm.get(trade)!;
      e.count++; e.offshore += c.offshore; e.relief += c.relief; e.standby += c.standby; e.medevac += c.medevac; e.total += c.total;
    }
    const out: { client: string; trade: string; count: number; offshore: number; relief: number; standby: number; medevac: number; total: number }[] = [];
    for (const [client, tm] of Array.from(map.entries()).sort()) {
      for (const [trade, v] of Array.from(tm.entries()).sort()) out.push({ client, trade, ...v });
    }
    return out;
  }, [costs]);

  const f = (v: number) => v === 0 ? "-" : `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const grand = rows.reduce((s, r) => s + r.total, 0);

  if (!rows.length) return <div className="p-6 text-center text-xs text-muted-foreground">No data for current month.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-3 py-2 text-left font-black text-muted-foreground uppercase tracking-widest">Client</th>
            <th className="px-2 py-2 text-left font-black text-muted-foreground uppercase tracking-widest">Trade</th>
            <th className="px-2 py-2 text-center font-black text-muted-foreground uppercase tracking-widest">HC</th>
            <th className="px-2 py-2 text-right font-black text-muted-foreground uppercase tracking-widest">Offshore</th>
            <th className="px-2 py-2 text-right font-black text-muted-foreground uppercase tracking-widest">Relief</th>
            <th className="px-2 py-2 text-right font-black text-muted-foreground uppercase tracking-widest">Standby</th>
            <th className="px-2 py-2 text-right font-black text-muted-foreground uppercase tracking-widest">Medevac</th>
            <th className="px-3 py-2 text-right font-black text-muted-foreground uppercase tracking-widest">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-1.5 font-black text-foreground uppercase">{r.client}</td>
              <td className="px-2 py-1.5 font-bold text-foreground uppercase">{r.trade}</td>
              <td className="px-2 py-1.5 font-bold text-center text-foreground tabular-nums">{r.count}</td>
              <td className="px-2 py-1.5 font-bold text-right text-emerald-500 tabular-nums">{f(r.offshore)}</td>
              <td className="px-2 py-1.5 font-bold text-right text-violet-500 tabular-nums">{f(r.relief)}</td>
              <td className="px-2 py-1.5 font-bold text-right text-amber-500 tabular-nums">{f(r.standby)}</td>
              <td className="px-2 py-1.5 font-bold text-right text-red-500 tabular-nums">{f(r.medevac)}</td>
              <td className="px-3 py-1.5 font-black text-right text-foreground tabular-nums">{f(r.total)}</td>
            </tr>
          ))}
          <tr className="text-white font-black" style={{ backgroundColor: "#1e3a8a" }}>
            <td className="px-3 py-2 uppercase tracking-widest" colSpan={2}>Grand Total</td>
            <td className="px-2 py-2 text-center tabular-nums">{rows.reduce((s, r) => s + r.count, 0)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{f(rows.reduce((s, r) => s + r.offshore, 0))}</td>
            <td className="px-2 py-2 text-right tabular-nums">{f(rows.reduce((s, r) => s + r.relief, 0))}</td>
            <td className="px-2 py-2 text-right tabular-nums">{f(rows.reduce((s, r) => s + r.standby, 0))}</td>
            <td className="px-2 py-2 text-right tabular-nums">{f(rows.reduce((s, r) => s + r.medevac, 0))}</td>
            <td className="px-3 py-2 text-right tabular-nums">{f(grand)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
