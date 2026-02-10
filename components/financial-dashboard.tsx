"use client";

import { Fragment, useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow } from "@/lib/types";
import { getPivotedRosterData, getCrewMasterData, getCrewList, type CrewMasterRecord } from "@/lib/actions";
import { safeParseDate, shortenPost, getTradeRank, formatDate } from "@/lib/logic";
import { getUser } from "@/lib/auth";
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
  basic: "#334155", fixedAll: "#6366f1", offshore: "#10b981",
  relief: "#8b5cf6", standby: "#f59e0b", medevac: "#ef4444",
  ska: "#0ea5e9", sba: "#f97316", primary: "#1e40af",
};
const LOC_COLORS = ["#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981"];
const CAT_COLORS = [P.basic, P.fixedAll, P.offshore, P.relief, P.standby, P.medevac];

// ─── Statement types ───
const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

interface StatementRow {
  crew_id: string; crew_name: string; post: string; client: string; location: string; displayLocation: string;
  offshoreDays: number; offshoreTotal: number;
  reliefDays: number; reliefRate: number; reliefTotal: number;
  standbyDays: number; standbyRate: number; standbyTotal: number;
  medevacDays: number; medevacTotal: number; grandTotal: number;
  cycles: { cycleNum: number; sign_on: string | null; sign_off: string | null; days: number; is_offshore: boolean; day_relief: number; relief_rate: number; day_standby: number; standby_rate: number; medevac_dates: string[]; notes: string | null; }[];
}

// ─── Cost Calc ───
interface CrewMonthCost {
  crew_name: string; post: string; client: string; location: string;
  basic: number; fixedAll: number; offshore: number; relief: number; standby: number; medevac: number; total: number;
}

function calcMonthCosts(rosterData: PivotedCrewRow[], masterData: CrewMasterRecord[], masterMap: Map<string, CrewMasterRecord>, year: number, month: number): CrewMonthCost[] {
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const monthStartTime = monthStart.getTime();
  const monthEndTime = monthEnd.getTime();
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
const fmtNum = (val: number) => (val === 0 ? "-" : String(val));
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

  // Tabs: Dashboard | Statement | Budgeting
  type TabType = "dashboard" | "statement" | "budgeting";
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // Statement filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [stmtTradeFilter, setStmtTradeFilter] = useState<"ALL" | "OM" | "EM" | "IMP/OHN">("ALL");
  const [stmtClientFilter, setStmtClientFilter] = useState<"ALL" | "SBA" | "SKA">("ALL");
  const [stmtSearch, setStmtSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Approval system
  const [approvalModal, setApprovalModal] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [approval, setApproval] = useState<{ name: string; date: string; role: string } | null>(null);

  // Budgeting
  const [budgetBuffer, setBudgetBuffer] = useState(10);

  // Check user role for statement visibility
  const user = typeof window !== "undefined" ? getUser() : null;
  const canSeeStatement = user?.role === "admin" || user?.role === "datalogger";

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

  // ─── Statement Data ───
  const [selectedYear, selectedMonthNum] = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return [y, m];
  }, [selectedMonth]);

  const statementRows = useMemo(() => {
    const monthStart = new Date(selectedYear, selectedMonthNum - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(selectedYear, selectedMonthNum, 0, 23, 59, 59, 999);
    const monthStartTime = monthStart.getTime();
    const monthEndTime = monthEnd.getTime();
    const OA_RATE = 200, MEDEVAC_RATE = 500;
    const rows: StatementRow[] = [];

    for (const crew of data) {
      const isOM = (crew.post || "").toUpperCase().includes("OFFSHORE MEDIC");
      const isEM = (crew.post || "").toUpperCase().includes("ESCORT MEDIC");
      const hasR = (crew.crew_name || "").includes("(R)");
      const master = masterMap.get((crew.crew_name || "").toUpperCase().trim());
      const displayLocation = hasR ? (master?.location || crew.location || "") : (crew.location || "");

      const cycleDetails: StatementRow["cycles"] = [];
      let totalOffshoreDays = 0, totalReliefDays = 0, totalReliefAmount = 0, totalStandbyDays = 0, totalStandbyAmount = 0, totalMedevacDays = 0;

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
          return md && md.getTime() >= monthStartTime && md.getTime() <= monthEndTime;
        });
        totalMedevacDays += cycleMedevacDates.length;
        cycleDetails.push({ cycleNum: parseInt(cycleNumStr), sign_on: cycle.sign_on, sign_off: cycle.sign_off, days: daysInMonth, is_offshore: isOffshore, day_relief: cycleReliefDays, relief_rate: cycleReliefRate, day_standby: cycleStandbyDays, standby_rate: cycleStandbyRate, medevac_dates: cycleMedevacDates, notes: cycle.notes });
      }
      if (cycleDetails.length === 0) continue;
      const offshoreTotal = isOM ? totalOffshoreDays * OA_RATE : 0;
      const medevacTotal = isEM ? totalMedevacDays * MEDEVAC_RATE : 0;
      const grandTotal = offshoreTotal + totalReliefAmount + totalStandbyAmount + medevacTotal;
      rows.push({
        crew_id: crew.crew_id, crew_name: crew.crew_name, post: crew.post, client: crew.client, location: crew.location, displayLocation,
        offshoreDays: isOM ? totalOffshoreDays : 0, offshoreTotal,
        reliefDays: totalReliefDays, reliefRate: totalReliefAmount > 0 && totalReliefDays > 0 ? totalReliefAmount / totalReliefDays : 0, reliefTotal: totalReliefAmount,
        standbyDays: totalStandbyDays, standbyRate: totalStandbyAmount > 0 && totalStandbyDays > 0 ? totalStandbyAmount / totalStandbyDays : 0, standbyTotal: totalStandbyAmount,
        medevacDays: isEM ? totalMedevacDays : 0, medevacTotal, grandTotal,
        cycles: cycleDetails.sort((a, b) => a.cycleNum - b.cycleNum),
      });
    }
    const clientRank = (c: string) => { const u = (c || "").toUpperCase().trim(); if (u.includes("SKA")) return 1; if (u.includes("SBA")) return 2; return 3; };
    return rows.sort((a, b) => {
      const tradeA = getTradeRank(a.post), tradeB = getTradeRank(b.post);
      if (tradeA !== tradeB) return tradeA - tradeB;
      const locCmp = (a.displayLocation || "").localeCompare(b.displayLocation || "");
      if (locCmp !== 0) return locCmp;
      return clientRank(a.client) - clientRank(b.client) || a.crew_name.localeCompare(b.crew_name);
    });
  }, [data, masterMap, selectedYear, selectedMonthNum]);

  const filteredStmtRows = useMemo(() => {
    return statementRows.filter((row) => {
      if (row.grandTotal === 0) return false;
      const displayName = getDisplayName(row.crew_id, row.crew_name);
      const matchesSearch = !stmtSearch.trim() || displayName.toLowerCase().includes(stmtSearch.toLowerCase());
      const matchesTrade = stmtTradeFilter === "ALL" || (stmtTradeFilter === "OM" && row.post?.includes("OFFSHORE MEDIC")) || (stmtTradeFilter === "EM" && row.post?.includes("ESCORT MEDIC")) || (stmtTradeFilter === "IMP/OHN" && (row.post?.includes("IM") || row.post?.includes("OHN")));
      const matchesClient = stmtClientFilter === "ALL" || row.client === stmtClientFilter;
      return matchesSearch && matchesTrade && matchesClient;
    });
  }, [statementRows, stmtSearch, stmtTradeFilter, stmtClientFilter]);

  const stmtTotals = useMemo(() => filteredStmtRows.reduce((acc, row) => ({ offshore: acc.offshore + row.offshoreTotal, relief: acc.relief + row.reliefTotal, standby: acc.standby + row.standbyTotal, medevac: acc.medevac + row.medevacTotal, grand: acc.grand + row.grandTotal }), { offshore: 0, relief: 0, standby: 0, medevac: 0, grand: 0 }), [filteredStmtRows]);

  // ─── Budgeting Data ───
  const budgetData = useMemo(() => {
    const now = new Date();
    const months: { label: string; year: number; month: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({ label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    const bufferMultiplier = 1 + budgetBuffer / 100;
    const clientTradeMap = new Map<string, { client: string; trade: string; months: number[] }>();

    for (const mo of months) {
      const costs = calcMonthCosts(data, masterData, masterMap, mo.year, mo.month);
      for (const c of costs) {
        const key = `${c.client}::${shortenPost(c.post)}`;
        if (!clientTradeMap.has(key)) clientTradeMap.set(key, { client: c.client, trade: shortenPost(c.post) as string, months: [0, 0, 0] });
        const entry = clientTradeMap.get(key)!;
        const idx = months.indexOf(mo);
        // Fixed costs stay as-is, variable costs get buffer
        const fixedCost = c.basic + c.fixedAll;
        const variableCost = (c.offshore + c.relief + c.standby + c.medevac) * bufferMultiplier;
        entry.months[idx] += fixedCost + variableCost;
      }
    }
    return { months, rows: Array.from(clientTradeMap.values()).sort((a, b) => a.client.localeCompare(b.client) || a.trade.localeCompare(b.trade)) };
  }, [data, masterData, masterMap, budgetBuffer]);

  // ─── Approval handler ───
  const handleApprove = () => {
    if (!approverName.trim()) return;
    setApproval({ name: approverName.trim(), date: new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }), role: "Project Manager" });
    setApprovalModal(false);
    setApproverName("");
  };

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
    { id: "statement", label: "Statement", hidden: !canSeeStatement },
    { id: "budgeting", label: "Budgeting" },
  ];

  return (
    <AppShell>
      <div className="space-y-3 animate-in fade-in duration-500 mt-1">

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
            <button onClick={() => {
              const titles: Record<TabType, string> = { dashboard: "Financial_Report", statement: "Statement", budgeting: "Budget_Projection" };
              document.title = `${titles[activeTab]}_${new Date().toISOString().slice(0,10)}`;
              window.print();
            }} className="print-btn p-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-sm" title="Print">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            </button>
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
                    <div className="h-40 flex items-center justify-center" style={{ perspective: "600px" }}>
                      <div style={{ transform: "rotateX(12deg)" }} className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart><Pie data={clientData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={4} dataKey="value" nameKey="name" animationDuration={1200} label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: "#64748b", strokeWidth: 1 }}>{clientData.map((e, i) => <Cell key={e.name} fill={i === 0 ? P.ska : P.sba} stroke="#0f172a" strokeWidth={2} />)}</Pie><Tooltip content={<PTT />} /></PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="px-3 pb-3 space-y-1">
                      {clientData.map((c, i) => (<div key={c.name} className="flex items-center justify-between"><div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: i === 0 ? P.ska : P.sba }} /><span className="text-[9px] font-bold text-foreground">{c.name}</span></div><span className="text-[9px] font-black text-foreground tabular-nums">{fmtRM(c.value)}</span></div>))}
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

        {/* ═══════════════ STATEMENT TAB ═══════════════ */}
        {activeTab === "statement" && canSeeStatement && (
          <div className="space-y-3">
            {/* Print header */}
            <div className="print-header hidden items-center justify-between px-2 py-2 border-b border-slate-300 mb-2">
              <div>
                <span className="text-sm font-black uppercase tracking-wider">Monthly Allowance Statement</span>
                <span className="text-xs font-bold text-slate-600 ml-3">{MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}</span>
              </div>
              <div className="flex items-center gap-3 text-[9px] font-bold text-slate-500 uppercase">
                <span>{filteredStmtRows.length} staff</span>
              </div>
            </div>

            {/* Filters */}
            <div className="no-print-header flex flex-wrap items-end gap-2" data-no-print>
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Period</label>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-blue-500/40">
                  {(() => {
                    const options: { value: string; label: string }[] = [];
                    for (let y = 2025; y <= 2026; y++) { const startM = y === 2025 ? 9 : 1; for (let m = startM; m <= 12; m++) { const val = `${y}-${String(m).padStart(2, "0")}`; options.push({ value: val, label: `${MONTH_NAMES[m - 1]} ${y}` }); } }
                    return options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
                  })()}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Client</label>
                <select value={stmtClientFilter} onChange={(e) => setStmtClientFilter(e.target.value as "ALL" | "SBA" | "SKA")} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-blue-500/40">
                  <option value="ALL">All</option><option value="SBA">SBA</option><option value="SKA">SKA</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Grade</label>
                <select value={stmtTradeFilter} onChange={(e) => setStmtTradeFilter(e.target.value as "ALL" | "OM" | "EM" | "IMP/OHN")} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-blue-500/40">
                  <option value="ALL">All</option><option value="OM">OM</option><option value="EM">EM</option><option value="IMP/OHN">OHN</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Search</label>
                <input type="text" placeholder="Name..." value={stmtSearch} onChange={(e) => setStmtSearch(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/40 w-32" />
              </div>
              {/* PM Approval Button */}
              {!approval ? (
                <button type="button" onClick={() => setApprovalModal(true)} className="self-end px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-sm">
                  Approve
                </button>
              ) : (
                <button type="button" onClick={() => setApproval(null)} className="self-end px-2 py-1 rounded-lg bg-red-500/10 text-red-500 text-[9px] font-bold uppercase tracking-wider transition-all border border-red-500/20 hover:bg-red-500/20" title="Revoke approval">
                  Revoke
                </button>
              )}
            </div>

            {/* Approval Stamp */}
            {approval && (
              <div className="approval-stamp flex items-center gap-3 px-4 py-3 bg-emerald-50 border-2 border-emerald-500 rounded-xl">
                <div className="flex items-center justify-center w-10 h-10 bg-emerald-600 rounded-full shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
                </div>
                <div>
                  <p className="text-[12px] font-black text-emerald-800 uppercase tracking-wider">Certified & Approved for Payment</p>
                  <p className="text-[10px] font-bold text-emerald-700">{approval.name} -- {approval.role} -- {approval.date}</p>
                </div>
              </div>
            )}

            {/* Statement Table */}
            {filteredStmtRows.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <p className="text-muted-foreground text-sm font-medium">No active rotations found for {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-auto max-h-[calc(100vh-320px)]">
                  <table className="w-full text-[12px] font-sans border-collapse" style={{ minWidth: "1000px" }}>
                    <thead className="sticky top-0 z-10">
                      <tr className="text-white" style={{ backgroundColor: "#1e3a8a" }}>
                        <th rowSpan={2} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-left border-r border-blue-700/50 whitespace-nowrap" style={{ minWidth: "240px" }}>Name / Client / Trade / Location</th>
                        <th colSpan={2} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-center border-r border-b border-blue-700/50">Offshore</th>
                        <th colSpan={3} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-center border-r border-b border-blue-700/50">Relief</th>
                        <th colSpan={3} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-center border-r border-b border-blue-700/50">Standby</th>
                        <th colSpan={2} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-center border-r border-b border-blue-700/50">Medevac</th>
                        <th rowSpan={2} className="px-3 py-1.5 text-center whitespace-nowrap" style={{ minWidth: "100px" }}>
                          <div className="text-[10px] font-black uppercase tracking-wide">Grand Total</div>
                          <div className="text-[11px] font-black tabular-nums mt-0.5">{fmtAmt(stmtTotals.grand)}</div>
                        </th>
                      </tr>
                      <tr className="text-blue-100" style={{ backgroundColor: "#1e3a8a" }}>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "50px" }}>Days</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "80px" }}>Total</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "50px" }}>Days</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "60px" }}>Rate</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "80px" }}>Total</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "50px" }}>Days</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "60px" }}>Rate</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "80px" }}>Total</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "60px" }}>No of Days</th>
                        <th className="px-2 py-1 text-[9px] font-semibold text-center border-r border-blue-700/50" style={{ width: "80px" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStmtRows.map((row, idx) => {
                        const isExpanded = expandedRow === `${row.crew_id}::${row.crew_name}`;
                        return (
                          <Fragment key={`${row.crew_id}::${row.crew_name}::${idx}`}>
                            <tr onClick={() => setExpandedRow(isExpanded ? null : `${row.crew_id}::${row.crew_name}`)} className={`cursor-pointer transition-colors border-b border-border ${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} hover:bg-blue-500/5`}>
                              <td className="px-3 py-1 border-r border-border">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground font-bold tabular-nums w-4">{idx + 1}</span>
                                  <div>
                                    <div className="text-[11px] font-bold text-foreground uppercase leading-tight whitespace-nowrap">{getDisplayName(row.crew_id, row.crew_name)}</div>
                                    <div className="text-[9px] text-muted-foreground">{row.client} / {shortenPost(row.post)} / {row.displayLocation}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums"><span className={row.offshoreDays > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.offshoreDays)}</span></td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums"><span className={row.offshoreTotal > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.offshoreTotal)}</span></td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums"><span className={row.reliefDays > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.reliefDays)}</span></td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums text-muted-foreground text-[11px]">{row.reliefRate > 0 ? fmtAmt(row.reliefRate) : "-"}</td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums"><span className={row.reliefTotal > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.reliefTotal)}</span></td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums"><span className={row.standbyDays > 0 ? "text-violet-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.standbyDays)}</span></td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums text-muted-foreground text-[11px]">{row.standbyRate > 0 ? fmtAmt(row.standbyRate) : "-"}</td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums"><span className={row.standbyTotal > 0 ? "text-violet-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.standbyTotal)}</span></td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums"><span className={row.medevacDays > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.medevacDays)}</span></td>
                              <td className="px-2 py-1 text-center border-r border-border tabular-nums"><span className={row.medevacTotal > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.medevacTotal)}</span></td>
                              <td className="px-3 py-1 text-center tabular-nums"><span className="text-[12px] font-black text-foreground">{fmtAmt(row.grandTotal)}</span></td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-muted/20">
                                <td colSpan={12} className="px-5 py-2 border-b border-border">
                                  <div className="text-[10px] space-y-1">
                                    {row.cycles.map((c) => (
                                      <div key={c.cycleNum} className="flex flex-wrap items-center gap-4 py-0.5 border-b border-border/30 last:border-0">
                                        <span className="font-bold text-foreground w-14">Cycle {c.cycleNum}</span>
                                        <span className="text-muted-foreground">{formatDate(c.sign_on)} - {formatDate(c.sign_off)}</span>
                                        <span className="text-muted-foreground">{c.days}d</span>
                                        {c.is_offshore && <span className="text-emerald-600 font-semibold">Offshore</span>}
                                        {c.day_relief > 0 && <span className="text-blue-600 font-semibold">Relief: {c.day_relief}d x {fmtAmt(c.relief_rate)}</span>}
                                        {c.day_standby > 0 && <span className="text-violet-600 font-semibold">Standby: {c.day_standby}d x {fmtAmt(c.standby_rate)}</span>}
                                        {c.medevac_dates.length > 0 && <span className="text-amber-600 font-semibold">Medevac: {c.medevac_dates.map(d => formatDate(d)).join(", ")}</span>}
                                        {c.notes && <span className="text-muted-foreground italic">{c.notes}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="text-white font-bold" style={{ backgroundColor: "#1e3a8a" }}>
                        <td className="px-3 py-2 text-left border-r border-blue-700/50"><span className="text-[10px] font-bold uppercase tracking-wider">Total ({filteredStmtRows.length} crew)</span></td>
                        <td className="px-2 py-2 border-r border-blue-700/50" />
                        <td className="px-2 py-2 text-center border-r border-blue-700/50 tabular-nums text-[11px]">{fmtAmt(stmtTotals.offshore)}</td>
                        <td className="px-2 py-2 border-r border-blue-700/50" /><td className="px-2 py-2 border-r border-blue-700/50" />
                        <td className="px-2 py-2 text-center border-r border-blue-700/50 tabular-nums text-[11px]">{fmtAmt(stmtTotals.relief)}</td>
                        <td className="px-2 py-2 border-r border-blue-700/50" /><td className="px-2 py-2 border-r border-blue-700/50" />
                        <td className="px-2 py-2 text-center border-r border-blue-700/50 tabular-nums text-[11px]">{fmtAmt(stmtTotals.standby)}</td>
                        <td className="px-2 py-2 border-r border-blue-700/50" />
                        <td className="px-2 py-2 text-center border-r border-blue-700/50 tabular-nums text-[11px]">{fmtAmt(stmtTotals.medevac)}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-[12px] font-black">{fmtAmt(stmtTotals.grand)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ BUDGETING TAB ═══════════════ */}
        {activeTab === "budgeting" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-tight">3-Month Cost Projection</h3>
                <p className="text-[9px] text-muted-foreground">Fixed costs (Basic + Fixed All.) from master data. Variable costs from roster cycles with adjustable buffer.</p>
              </div>
              <div className="flex items-center gap-3 bg-muted px-4 py-2 rounded-xl border border-border" data-no-print>
                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Buffer</label>
                <input type="range" min={0} max={50} value={budgetBuffer} onChange={(e) => setBudgetBuffer(parseInt(e.target.value))} className="w-32 h-1.5 bg-blue-200 rounded-full appearance-none cursor-pointer" />
                <span className="text-[11px] font-black text-foreground tabular-nums w-8 text-right">{budgetBuffer}%</span>
              </div>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr style={{ backgroundColor: "#1e3a8a" }} className="text-white">
                      <th className="px-3 py-2 text-left font-black uppercase tracking-widest border-r border-blue-700/50">Client</th>
                      <th className="px-2 py-2 text-left font-black uppercase tracking-widest border-r border-blue-700/50">Trade</th>
                      {budgetData.months.map(m => (
                        <th key={m.label} className="px-3 py-2 text-right font-black uppercase tracking-widest border-r border-blue-700/50">{m.label}</th>
                      ))}
                      <th className="px-3 py-2 text-right font-black uppercase tracking-widest">3-Month Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {budgetData.rows.map((r, i) => {
                      const rowTotal = r.months.reduce((s, v) => s + v, 0);
                      return (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-1.5 font-black text-foreground uppercase">{r.client}</td>
                          <td className="px-2 py-1.5 font-bold text-foreground uppercase">{r.trade}</td>
                          {r.months.map((v, mi) => (
                            <td key={mi} className="px-3 py-1.5 text-right font-bold tabular-nums text-foreground">{fmtAmt(v)}</td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-black tabular-nums text-foreground">{fmtAmt(rowTotal)}</td>
                        </tr>
                      );
                    })}
                    <tr className="text-white font-black" style={{ backgroundColor: "#1e3a8a" }}>
                      <td className="px-3 py-2 uppercase tracking-widest" colSpan={2}>Grand Total</td>
                      {budgetData.months.map((m, mi) => {
                        const colTotal = budgetData.rows.reduce((s, r) => s + r.months[mi], 0);
                        return <td key={m.label} className="px-3 py-2 text-right tabular-nums">{fmtAmt(colTotal)}</td>;
                      })}
                      <td className="px-3 py-2 text-right tabular-nums">{fmtAmt(budgetData.rows.reduce((s, r) => s + r.months.reduce((a, b) => a + b, 0), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Approval Modal */}
        {approvalModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border">
              <div className="px-5 py-3 border-b border-border bg-emerald-600 rounded-t-2xl">
                <h3 className="text-xs font-black uppercase tracking-wider text-white">Project Manager Approval</h3>
                <p className="text-[9px] font-bold text-emerald-100">Enter your name to certify this statement for payment</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Full Name</label>
                  <input
                    type="text"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    placeholder="Enter your full name..."
                    autoFocus
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 rounded-b-2xl">
                <button type="button" onClick={() => { setApprovalModal(false); setApproverName(""); }} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold text-[10px] uppercase tracking-wider transition-all border border-border">Cancel</button>
                <button type="button" onClick={handleApprove} disabled={!approverName.trim()} className={`px-5 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${approverName.trim() ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg" : "bg-muted text-muted-foreground cursor-not-allowed"}`}>
                  Certify & Approve
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
