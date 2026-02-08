"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow } from "@/lib/types";
import { getPivotedRosterData, getCrewMasterData, type CrewMasterRecord } from "@/lib/actions";
import { safeParseDate, shortenPost } from "@/lib/logic";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  CartesianGrid, Area, AreaChart,
} from "recharts";

// ─── Month Range from Sept 2025 to Current + 3 Future ───
function generateMonthRange(): { year: number; month: number; label: string; isFuture: boolean }[] {
  const now = new Date();
  const endMonth = now.getMonth() + 1;
  const endYear = now.getFullYear();
  const futureEnd = new Date(now);
  futureEnd.setMonth(futureEnd.getMonth() + 3);

  const months: { year: number; month: number; label: string; isFuture: boolean }[] = [];
  let y = 2025, m = 9;
  while (y < futureEnd.getFullYear() || (y === futureEnd.getFullYear() && m <= futureEnd.getMonth() + 1)) {
    const shortMonth = new Date(y, m - 1, 1).toLocaleString("en", { month: "short" }).toUpperCase();
    const isFuture = y > endYear || (y === endYear && m > endMonth);
    months.push({ year: y, month: m, label: `${shortMonth} ${String(y).slice(-2)}`, isFuture });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ─── Colors ───
const PALETTE = {
  fixed: "#3b82f6",      // Blue
  offshore: "#10b981",   // Emerald
  relief: "#8b5cf6",     // Violet
  standby: "#f59e0b",    // Amber
  medevac: "#ef4444",    // Red
  ska: "#0ea5e9",        // Sky
  sba: "#f97316",        // Orange
};

const LOCATION_COLORS = ["#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#3b82f6"];
const CATEGORY_COLORS = [PALETTE.offshore, PALETTE.relief, PALETTE.standby, PALETTE.medevac];

// ─── Cost Calculation ───
interface CrewMonthCost {
  crew_name: string;
  post: string;
  client: string;
  location: string;
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
    const oaRate = 200;
    const medevacRate = 500;

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
      location: crew.location || "",
      salary, fixedAllowance, offshore,
      relief: totalRelief, standby: totalStandby, medevac, total,
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

// ─── Animated Counter Hook ───
function useAnimatedCounter(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);
  return val;
}

function AnimatedCard({ label, subtitle, value, accent }: { label: string; subtitle: string; value: number; accent: string }) {
  const animated = useAnimatedCounter(value);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl group hover:scale-[1.02] transition-transform duration-300">
      <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl" style={{ backgroundColor: accent }} />
      <div className="p-5">
        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-0.5">{label}</p>
        <p className="text-[8px] text-muted-foreground mb-3">{subtitle}</p>
        <p className="text-3xl font-black text-foreground tabular-nums tracking-tight">
          {formatCompact(animated)}
        </p>
      </div>
    </div>
  );
}

// ─── Custom 3D Tooltip ───
function Custom3DTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-900/95 backdrop-blur-sm p-3 shadow-2xl">
      <p className="text-[10px] font-black text-slate-300 uppercase tracking-wider mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-6 py-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-[10px] font-bold text-slate-300 capitalize">{entry.name}</span>
          </div>
          <span className="text-[10px] font-black text-white tabular-nums">{formatRM(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { name: string; fill: string } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-900/95 backdrop-blur-sm p-3 shadow-2xl">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: entry.payload.fill }} />
        <span className="text-[11px] font-black text-white">{entry.name}</span>
      </div>
      <p className="text-[10px] font-bold text-slate-300 tabular-nums">{formatRM(entry.value)}</p>
    </div>
  );
}

// ─── 3D-Effect Custom Bar Shape ───
function Bar3DShape(props: Record<string, unknown>) {
  const { x, y, width, height, fill } = props as { x: number; y: number; width: number; height: number; fill: string };
  if (!height || height <= 0) return null;
  const depth = 6;
  return (
    <g>
      {/* Top face - lighter */}
      <polygon
        points={`${x},${y} ${x + depth},${y - depth} ${x + width + depth},${y - depth} ${x + width},${y}`}
        fill={fill}
        opacity={0.7}
      />
      {/* Right face - darker */}
      <polygon
        points={`${x + width},${y} ${x + width + depth},${y - depth} ${x + width + depth},${y + height - depth} ${x + width},${y + height}`}
        fill={fill}
        opacity={0.45}
      />
      {/* Front face */}
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={1} />
    </g>
  );
}

// ─── 3D Horizontal Bar Shape ───
function HBar3DShape(props: Record<string, unknown>) {
  const { x, y, width, height, fill } = props as { x: number; y: number; width: number; height: number; fill: string };
  if (!width || width <= 0) return null;
  const depth = 5;
  return (
    <g>
      {/* Top face */}
      <polygon
        points={`${x},${y} ${x + depth},${y - depth} ${x + width + depth},${y - depth} ${x + width},${y}`}
        fill={fill}
        opacity={0.6}
      />
      {/* Right face */}
      <polygon
        points={`${x + width},${y} ${x + width + depth},${y - depth} ${x + width + depth},${y + height - depth} ${x + width},${y + height}`}
        fill={fill}
        opacity={0.4}
      />
      {/* Front */}
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
    Promise.all([getPivotedRosterData(), getCrewMasterData()]).then(([pivoted, master]) => {
      setData(pivoted);
      setMasterData(master);
      setLoading(false);
    });
  }, []);

  const masterMap = useMemo(() => {
    const map = new Map<string, CrewMasterRecord>();
    for (const m of masterData) map.set((m.crew_name || "").toUpperCase().trim(), m);
    return map;
  }, [masterData]);

  const monthRange = useMemo(() => generateMonthRange(), []);

  // ─── Stacked Bar Data: Monthly Spending Breakdown ───
  const stackedBarData = useMemo(() => {
    return monthRange.map(({ year, month, label, isFuture }) => {
      const costs = calcCrewMonthCosts(data, masterMap, year, month);
      const fixed = costs.reduce((s, c) => s + c.salary + c.fixedAllowance, 0);
      const offshore = costs.reduce((s, c) => s + c.offshore, 0);
      const relief = costs.reduce((s, c) => s + c.relief, 0);
      const standby = costs.reduce((s, c) => s + c.standby, 0);
      const medevac = costs.reduce((s, c) => s + c.medevac, 0);
      return { label, isFuture, fixed, offshore, relief, standby, medevac, total: fixed + offshore + relief + standby + medevac };
    });
  }, [data, masterMap, monthRange]);

  const actualCosts = stackedBarData.filter((m) => !m.isFuture);
  const estimatedCosts = stackedBarData.filter((m) => m.isFuture);
  const totalActual = actualCosts.reduce((s, c) => s + c.total, 0);
  const monthlyAvg = actualCosts.length > 0 ? totalActual / actualCosts.length : 0;
  const totalEstimated = estimatedCosts.reduce((s, c) => s + c.total, 0);

  // ─── Donut Chart: Cost by Client (All Actual Months) ───
  const costByClient = useMemo(() => {
    const clientMap = new Map<string, number>();
    for (const m of monthRange.filter(mr => !mr.isFuture)) {
      const costs = calcCrewMonthCosts(data, masterMap, m.year, m.month);
      for (const c of costs) {
        const client = c.client || "Unknown";
        clientMap.set(client, (clientMap.get(client) || 0) + c.total);
      }
    }
    return Array.from(clientMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data, masterMap, monthRange]);

  // ─── Top 5 Locations by Cost ───
  const topLocations = useMemo(() => {
    const locMap = new Map<string, number>();
    for (const m of monthRange.filter(mr => !mr.isFuture)) {
      const costs = calcCrewMonthCosts(data, masterMap, m.year, m.month);
      for (const c of costs) {
        const loc = c.location || "Unknown";
        locMap.set(loc, (locMap.get(loc) || 0) + c.total);
      }
    }
    return Array.from(locMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [data, masterMap, monthRange]);

  // ─── Allowance Category Share (Pie) ───
  const categoryShare = useMemo(() => {
    let offshore = 0, relief = 0, standby = 0, medevac = 0;
    for (const m of actualCosts) {
      offshore += m.offshore;
      relief += m.relief;
      standby += m.standby;
      medevac += m.medevac;
    }
    return [
      { name: "Offshore Allowance", value: offshore },
      { name: "Relief", value: relief },
      { name: "Standby", value: standby },
      { name: "Medevac", value: medevac },
    ].filter(c => c.value > 0);
  }, [actualCosts]);

  // ─── Monthly Trend Area ───
  const trendData = useMemo(() => {
    return stackedBarData.map(d => ({
      label: d.label,
      total: d.total,
      isFuture: d.isFuture,
    }));
  }, [stackedBarData]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5 animate-in fade-in duration-700 mt-2">

        {/* ─── HEADER ─── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none">
              Financial Dashboard
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mt-1">
              Pecahan Kos &middot; Sept 2025 onwards &middot; Actual + Estimated
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg hover:shadow-blue-500/25"
          >
            Print Report
          </button>
        </div>

        {/* ─── SUMMARY CARDS ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <AnimatedCard label="Total Actual Cost" subtitle="Sept 2025 to current month" value={totalActual} accent={PALETTE.offshore} />
          <AnimatedCard label="Monthly Average" subtitle={`${actualCosts.length} months averaged`} value={monthlyAvg} accent={PALETTE.fixed} />
          <AnimatedCard label="Estimated (Next 3 Months)" subtitle="Based on scheduled roster" value={totalEstimated} accent={PALETTE.standby} />
        </div>

        {/* ─── TREND LINE ─── */}
        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="px-5 pt-5 pb-2">
            <h3 className="text-[10px] font-black text-foreground uppercase tracking-[0.15em]">Monthly Cost Trend</h3>
            <p className="text-[8px] text-muted-foreground mt-0.5">Smooth area with actual vs estimated</p>
          </div>
          <div className="h-56 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE.fixed} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={PALETTE.fixed} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }} interval={0} angle={-45} textAnchor="end" height={45} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }} tickFormatter={(v: number) => formatCompact(v)} width={65} />
                <Tooltip content={<Custom3DTooltip />} />
                <Area type="monotone" dataKey="total" stroke={PALETTE.fixed} strokeWidth={2.5} fill="url(#trendGradient)" animationDuration={1500} animationEasing="ease-out" dot={({ cx, cy, index }: { cx: number; cy: number; index: number }) => (
                  <circle key={index} cx={cx} cy={cy} r={3.5} fill={trendData[index]?.isFuture ? PALETTE.standby : PALETTE.fixed} stroke="#0f172a" strokeWidth={2} />
                )} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 px-5 pb-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PALETTE.fixed }} />
              <span className="text-[8px] font-bold text-muted-foreground uppercase">Actual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PALETTE.standby }} />
              <span className="text-[8px] font-bold text-muted-foreground uppercase">Estimated</span>
            </div>
          </div>
        </div>

        {/* ─── ROW: Stacked Bar (2/3) + Donut (1/3) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Stacked Bar Chart - Monthly Breakdown */}
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-[10px] font-black text-foreground uppercase tracking-[0.15em]">Monthly Spending Breakdown</h3>
              <p className="text-[8px] text-muted-foreground mt-0.5">Stacked by category: Fixed, Offshore, Relief, Standby, Medevac</p>
            </div>
            <div className="h-80 px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackedBarData} margin={{ top: 15, right: 15, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 700 }} interval={0} angle={-45} textAnchor="end" height={45} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }} tickFormatter={(v: number) => formatCompact(v)} width={65} />
                  <Tooltip content={<Custom3DTooltip />} />
                  <Bar dataKey="fixed" stackId="cost" name="Fixed" fill={PALETTE.fixed} shape={<Bar3DShape />} animationDuration={1200} animationEasing="ease-out" />
                  <Bar dataKey="offshore" stackId="cost" name="Offshore" fill={PALETTE.offshore} shape={<Bar3DShape />} animationDuration={1200} animationEasing="ease-out" />
                  <Bar dataKey="relief" stackId="cost" name="Relief" fill={PALETTE.relief} shape={<Bar3DShape />} animationDuration={1200} animationEasing="ease-out" />
                  <Bar dataKey="standby" stackId="cost" name="Standby" fill={PALETTE.standby} shape={<Bar3DShape />} animationDuration={1200} animationEasing="ease-out" />
                  <Bar dataKey="medevac" stackId="cost" name="Medevac" fill={PALETTE.medevac} shape={<Bar3DShape />} animationDuration={1200} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
              {[
                { key: "Fixed (Salary+All.)", color: PALETTE.fixed },
                { key: "Offshore", color: PALETTE.offshore },
                { key: "Relief", color: PALETTE.relief },
                { key: "Standby", color: PALETTE.standby },
                { key: "Medevac", color: PALETTE.medevac },
              ].map(l => (
                <div key={l.key} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                  <span className="text-[8px] font-bold text-muted-foreground uppercase">{l.key}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Donut Chart - Cost by Client */}
          <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-[10px] font-black text-foreground uppercase tracking-[0.15em]">Cost by Client</h3>
              <p className="text-[8px] text-muted-foreground mt-0.5">Total cost ratio SKA vs SBA</p>
            </div>
            {costByClient.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No data available.</p>
            ) : (
              <div className="h-72 flex items-center justify-center" style={{ perspective: "800px" }}>
                <div style={{ transform: "rotateX(12deg)" }} className="w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={costByClient}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="name"
                        animationDuration={1500}
                        animationEasing="ease-out"
                        label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: "#64748b", strokeWidth: 1 }}
                      >
                        {costByClient.map((entry, idx) => (
                          <Cell key={entry.name} fill={idx === 0 ? PALETTE.ska : PALETTE.sba} stroke="#0f172a" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {/* Client legend with amounts */}
            <div className="px-5 pb-4 space-y-1.5">
              {costByClient.map((c, idx) => (
                <div key={c.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: idx === 0 ? PALETTE.ska : PALETTE.sba }} />
                    <span className="text-[10px] font-bold text-foreground">{c.name}</span>
                  </div>
                  <span className="text-[10px] font-black text-foreground tabular-nums">{formatRM(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── ROW: Top Locations (1/2) + Allowance Share Pie (1/2) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top 5 Locations - Horizontal Bar */}
          <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-[10px] font-black text-foreground uppercase tracking-[0.15em]">Top 5 Locations by Cost</h3>
              <p className="text-[8px] text-muted-foreground mt-0.5">Ranked by total allowance spending</p>
            </div>
            {topLocations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No location data.</p>
            ) : (
              <div className="h-72 px-2 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topLocations} layout="vertical" margin={{ top: 10, right: 25, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }} tickFormatter={(v: number) => formatCompact(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#e2e8f0", fontSize: 10, fontWeight: 800 }} width={75} />
                    <Tooltip content={<Custom3DTooltip />} />
                    <Bar dataKey="value" name="Total Cost" shape={<HBar3DShape />} animationDuration={1200} animationEasing="ease-out">
                      {topLocations.map((_, idx) => (
                        <Cell key={idx} fill={LOCATION_COLORS[idx % LOCATION_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Allowance Category Share - Pie */}
          <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-[10px] font-black text-foreground uppercase tracking-[0.15em]">Allowance Category Share</h3>
              <p className="text-[8px] text-muted-foreground mt-0.5">Offshore Allowance vs Relief vs Standby vs Medevac</p>
            </div>
            {categoryShare.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No allowance data.</p>
            ) : (
              <div className="h-64 flex items-center justify-center" style={{ perspective: "800px" }}>
                <div style={{ transform: "rotateX(10deg)" }} className="w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryShare}
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="name"
                        animationDuration={1500}
                        animationEasing="ease-out"
                        label={({ name, percent }: { name: string; percent: number }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: "#64748b", strokeWidth: 1 }}
                      >
                        {categoryShare.map((_, idx) => (
                          <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} stroke="#0f172a" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {/* Category legend */}
            <div className="px-5 pb-4 space-y-1.5">
              {categoryShare.map((c, idx) => (
                <div key={c.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} />
                    <span className="text-[10px] font-bold text-foreground">{c.name}</span>
                  </div>
                  <span className="text-[10px] font-black text-foreground tabular-nums">{formatRM(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── SUMMARY TABLE: Client & Trade ─── */}
        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border" style={{ backgroundColor: "#1e3a8a" }}>
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Summary by Client & Trade (Current Month)</h3>
          </div>
          <div className="overflow-x-auto">
            <ClientTradeSummaryTable data={data} masterMap={masterMap} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Sub-component: Client/Trade Summary ───
function ClientTradeSummaryTable({ data, masterMap }: { data: PivotedCrewRow[]; masterMap: Map<string, CrewMasterRecord> }) {
  const now = new Date();
  const costs = calcCrewMonthCosts(data, masterMap, now.getFullYear(), now.getMonth() + 1);

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

  const fmt = (val: number) => {
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
          <th className="px-3 py-2.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-widest">HC</th>
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
            <td className="px-3 py-2 text-[9px] font-bold text-right text-foreground tabular-nums">{fmt(r.salary)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-foreground tabular-nums">{fmt(r.fixed)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-emerald-500 tabular-nums">{fmt(r.offshore)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-violet-500 tabular-nums">{fmt(r.relief)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-amber-500 tabular-nums">{fmt(r.standby)}</td>
            <td className="px-3 py-2 text-[9px] font-bold text-right text-red-500 tabular-nums">{fmt(r.medevac)}</td>
            <td className="px-4 py-2 text-[10px] font-black text-right text-foreground tabular-nums">{fmt(r.total)}</td>
          </tr>
        ))}
        <tr className="text-white font-black" style={{ backgroundColor: "#1e3a8a" }}>
          <td className="px-4 py-2.5 text-[9px] uppercase tracking-widest" colSpan={2}>Grand Total</td>
          <td className="px-3 py-2.5 text-[9px] text-center tabular-nums">{rows.reduce((s, r) => s + r.count, 0)}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.salary, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.fixed, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.offshore, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.relief, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.standby, 0))}</td>
          <td className="px-3 py-2.5 text-[9px] text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.medevac, 0))}</td>
          <td className="px-4 py-2.5 text-[10px] text-right tabular-nums">{fmt(grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}
