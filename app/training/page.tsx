"use client";

import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { getMatrixData, updateMatrixCell, createMatrixRecord } from "@/lib/actions";
import { getUser } from "@/lib/auth";
import type { MatrixRecord } from "@/lib/types";
import type { AuthUser } from "@/lib/auth";
import { X } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";

// ─── Course Configuration ───
interface CourseConfig {
  name: string;
  colType: "apc" | "standard" | "single";
  colCount: number;
  headerBg: string;
}

const COURSE_CONFIG: CourseConfig[] = [
  { name: "APC",    colType: "apc",      colCount: 3, headerBg: "#4f46e5" }, // indigo
  { name: "BLS",    colType: "standard",  colCount: 3, headerBg: "#0284c7" }, // sky
  { name: "ACLS",   colType: "standard",  colCount: 3, headerBg: "#7c3aed" }, // violet
  { name: "ATLS",   colType: "standard",  colCount: 3, headerBg: "#db2777" }, // pink
  { name: "AMRO",   colType: "standard",  colCount: 3, headerBg: "#d97706" }, // amber
  { name: "BOSIET", colType: "standard",  colCount: 3, headerBg: "#0d9488" }, // teal
  { name: "HACCP",  colType: "standard",  colCount: 3, headerBg: "#0891b2" }, // cyan
  { name: "H2S",    colType: "standard",  colCount: 3, headerBg: "#ea580c" }, // orange
  { name: "MCM",    colType: "standard",  colCount: 3, headerBg: "#65a30d" }, // lime
  { name: "MED",    colType: "single",    colCount: 1, headerBg: "#dc2626" }, // red
  { name: "OSP",    colType: "single",    colCount: 1, headerBg: "#059669" }, // emerald
  { name: "CCC",    colType: "single",    colCount: 1, headerBg: "#9333ea" }, // purple
];

const ALL_COURSE_NAMES = COURSE_CONFIG.map((c) => c.name);
const FIXED_COLS = 2; // #, Name (Trade/Client shown in separator)

// Pie chart colors: Green, Yellow, Orange (NO RED per spec)
const PIE_GREEN = "#22c55e";
const PIE_YELLOW = "#eab308";
const PIE_ORANGE = "#f97316";

// ─── Status helpers (3-tier: green >6m, yellow 3-6m, orange <3m/expired) ───
function getStatusTier(expiryStr: string | null, today: Date): "green" | "yellow" | "orange" | "no-data" {
  if (!expiryStr) return "no-data";
  const expiry = new Date(expiryStr);
  if (isNaN(expiry.getTime())) return "no-data";
  const diff = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 90) return "orange";   // <3 months or expired
  if (diff < 180) return "yellow";  // 3-6 months
  return "green";                    // >6 months
}

// For cell styling we still use valid/expiring/expired
function getCellStatus(expiryStr: string | null, today: Date): "valid" | "expiring" | "expired" | "no-data" {
  if (!expiryStr) return "no-data";
  const expiry = new Date(expiryStr);
  if (isNaN(expiry.getTime())) return "no-data";
  const diff = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "expired";
  if (diff <= 90) return "expiring";
  return "valid";
}

function fmtDate(d: string | null): string {
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;
}

function toInputDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

const EXPIRY_CELL: Record<string, { bg: string; text: string }> = {
  valid:    { bg: "bg-emerald-100", text: "text-emerald-900 font-bold" },
  expiring: { bg: "bg-amber-100",   text: "text-amber-900 font-bold" },
  expired:  { bg: "bg-red-100",     text: "text-red-900 font-bold" },
  "no-data": { bg: "",              text: "text-slate-400" },
};

// ─── Trade helpers ───
function shortTrade(post: string): string {
  if (post?.includes("OFFSHORE")) return "OM";
  if (post?.includes("ESCORT")) return "EM";
  if (post?.includes("IM") || post?.includes("OHN")) return "OHN";
  return post || "-";
}

function fullTrade(post: string): string {
  if (post?.includes("OFFSHORE")) return "Offshore Medic";
  if (post?.includes("ESCORT")) return "Escort Medic";
  if (post?.includes("IM") || post?.includes("OHN")) return "IMP / OHN";
  return post || "-";
}

function tradeRank(post: string): number {
  if (post?.includes("OFFSHORE")) return 1;
  if (post?.includes("ESCORT")) return 2;
  return 3;
}

// ─── Per-person data structure ───
interface CertEntry {
  matrix_id: string | null;
  cert_no: string | null;
  attended_date: string | null;
  expiry_date: string | null;
  plan_date: string | null;
}

interface PersonMatrix {
  crew_id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  certs: Record<string, CertEntry>;
}

// ─── 3D Pie Chart for header (bigger, with shadow/gradient effect) ───
function CoursePieChart({ green, yellow, orange, planCount }: { green: number; yellow: number; orange: number; planCount: number }) {
  const data = [
    { name: "Safe", value: green },
    { name: "Warning", value: yellow },
    { name: "Critical", value: orange },
  ].filter((d) => d.value > 0);

  const total = green + yellow + orange;
  const size = 80;
  const cx = size / 2;
  const cy = size / 2;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="rounded-full bg-slate-200 flex items-center justify-center" style={{ width: size, height: size }}>
          <span className="text-xs text-slate-400 font-bold">N/A</span>
        </div>
        {planCount > 0 && (
          <span className="text-[8px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full leading-none">PLAN: {planCount}</span>
        )}
      </div>
    );
  }

  const COLORS = [PIE_GREEN, PIE_YELLOW, PIE_ORANGE];
  const DARK_COLORS = ["#16a34a", "#ca8a04", "#ea580c"];
  const pctGreen = total > 0 ? Math.round((green / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        {/* 3D shadow layer - offset beneath */}
        <div className="absolute" style={{ top: 3, left: 0 }}>
          <PieChart width={size} height={size}>
            <Pie data={data} cx={cx} cy={cy} innerRadius={18} outerRadius={36} paddingAngle={2} dataKey="value" stroke="none">
              {data.map((entry, i) => (
                <Cell key={i} fill={DARK_COLORS[["Safe", "Warning", "Critical"].indexOf(entry.name)]} opacity={0.4} />
              ))}
            </Pie>
          </PieChart>
        </div>
        {/* Main pie layer */}
        <div className="absolute top-0 left-0">
          <PieChart width={size} height={size}>
            <Pie data={data} cx={cx} cy={cy} innerRadius={18} outerRadius={36} paddingAngle={2} dataKey="value" stroke="rgba(255,255,255,0.5)" strokeWidth={1}>
              {data.map((entry, i) => (
                <Cell key={i} fill={COLORS[["Safe", "Warning", "Critical"].indexOf(entry.name)]} />
              ))}
            </Pie>
          </PieChart>
        </div>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black text-slate-800 tabular-nums leading-none">{total}</span>
          <span className="text-[7px] font-bold text-emerald-600 leading-none">{pctGreen}%</span>
        </div>
      </div>
      {planCount > 0 && (
        <span className="text-[8px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full leading-none shadow-sm">PLAN: {planCount}</span>
      )}
    </div>
  );
}

// ─── Editable Cell ───
function EditableCell({
  value,
  displayValue,
  matrixId,
  crewId,
  certType,
  field,
  canEdit,
  className,
  onSaved,
}: {
  value: string | null;
  displayValue: string;
  matrixId: string | null;
  crewId: string;
  certType: string;
  field: "attended_date" | "expiry_date" | "plan_date";
  canEdit: boolean;
  className: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChange = async (newVal: string) => {
    setEditing(false);
    if (!newVal && !value) return;
    if (newVal === toInputDate(value)) return;
    setSaving(true);
    try {
      if (matrixId) {
        await updateMatrixCell(matrixId, field as "attended_date" | "expiry_date", newVal || null);
      } else if (newVal) {
        await createMatrixRecord(crewId, certType, field as "attended_date" | "expiry_date", newVal);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (editing && canEdit) {
    return (
      <td className="px-0.5 py-0.5 text-center border-r border-slate-200">
        <input
          type="date"
          defaultValue={toInputDate(value)}
          autoFocus
          onBlur={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleChange((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="bg-white text-slate-900 text-[11px] font-bold border-2 border-blue-500 rounded px-1 py-0.5 w-[108px] outline-none shadow-lg"
        />
      </td>
    );
  }

  return (
    <td
      className={`px-1 py-1.5 text-[11px] text-center tabular-nums border-r border-slate-200 ${className} ${
        canEdit ? "cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-inset" : ""
      } ${saving ? "opacity-50" : ""}`}
      onDoubleClick={() => canEdit && setEditing(true)}
      title={canEdit ? "Double-click to edit" : undefined}
    >
      {saving ? "..." : displayValue}
    </td>
  );
}

function TextCell({ value, className }: { value: string | null; className: string }) {
  return (
    <td className={`px-1 py-1.5 text-[11px] text-center tabular-nums border-r border-slate-200 font-semibold text-slate-800 ${className}`}>
      {value || "-"}
    </td>
  );
}

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════
export default function TrainingMatrixPage() {
  const [rawData, setRawData] = useState<MatrixRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState("ALL");
  const [tradeFilter, setTradeFilter] = useState("ALL");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [courseFilter, setCourseFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const today = useMemo(() => new Date(), []);

  const canEdit = user?.role === "admin" || user?.role === "datalogger";

  const loadData = useCallback(async () => {
    const result = await getMatrixData();
    if (result.success && result.data) setRawData(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    setUser(getUser());
    loadData();
  }, [loadData]);

  // Group raw records by person
  const personnel = useMemo(() => {
    const map = new Map<string, PersonMatrix>();
    for (const row of rawData) {
      if (!map.has(row.crew_id)) {
        map.set(row.crew_id, {
          crew_id: row.crew_id,
          crew_name: row.crew_name,
          post: row.post,
          client: row.client,
          location: row.location,
          certs: {},
        });
      }
      const p = map.get(row.crew_id)!;
      const key = (row.cert_type || "").toUpperCase().trim();
      if (key) {
        p.certs[key] = {
          matrix_id: row.id,
          cert_no: row.cert_no || null,
          attended_date: row.attended_date,
          expiry_date: row.expiry_date,
          plan_date: row.plan_date || null,
        };
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const c = a.client.localeCompare(b.client);
      if (c !== 0) return c;
      return tradeRank(a.post) - tradeRank(b.post);
    });
  }, [rawData]);

  // Get unique locations for filter
  const locations = useMemo(() => {
    const locs = [...new Set(personnel.map((p) => p.location).filter(Boolean))];
    return locs.sort();
  }, [personnel]);

  // Visible courses based on courseFilter
  const visibleCourses = useMemo(() => {
    if (courseFilter === "ALL") return COURSE_CONFIG;
    return COURSE_CONFIG.filter((c) => c.name === courseFilter);
  }, [courseFilter]);

  // Filter
  const filtered = useMemo(() => {
    return personnel.filter((p) => {
      if (clientFilter !== "ALL" && p.client !== clientFilter) return false;
      if (tradeFilter !== "ALL" && shortTrade(p.post) !== tradeFilter) return false;
      if (locationFilter !== "ALL" && p.location !== locationFilter) return false;
      if (search && !p.crew_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "ALL") {
        // Check if person has ANY cert matching the status filter
        const hasMatch = ALL_COURSE_NAMES.some((cn) => {
          const st = getCellStatus(p.certs[cn]?.expiry_date || null, today);
          return st === statusFilter;
        });
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [personnel, clientFilter, tradeFilter, locationFilter, search, statusFilter, today]);

  // Per-course stats for PIE CHARTS (3-tier: green >6m, yellow 3-6m, orange <3m)
  const courseStats = useMemo(() => {
    const stats: Record<string, { green: number; yellow: number; orange: number; planCount: number }> = {};
    for (const cc of COURSE_CONFIG) {
      const st = { green: 0, yellow: 0, orange: 0, planCount: 0 };
      for (const p of personnel) {
        const tier = getStatusTier(p.certs[cc.name]?.expiry_date || null, today);
        if (tier === "green") st.green++;
        else if (tier === "yellow") st.yellow++;
        else if (tier === "orange") st.orange++;
        if (p.certs[cc.name]?.plan_date) st.planCount++;
      }
      stats[cc.name] = st;
    }
    return stats;
  }, [personnel, today]);

  const totalSubCols = visibleCourses.reduce((acc, c) => acc + c.colCount, 0);
  const totalCols = FIXED_COLS + totalSubCols;

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-80px)] animate-in fade-in duration-500">
        {/* Title + Filters */}
        <div className="flex-shrink-0 space-y-2 pb-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-black text-foreground uppercase tracking-tight">Training Matrix</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                IMS Personnel Competency & Certification Tracker
                {canEdit && <span className="ml-2 text-blue-400">(Double-click cells to edit)</span>}
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl px-3 py-2">
            {/* Client */}
            <div className="flex items-center gap-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Client</label>
              <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none cursor-pointer">
                <option value="ALL">All</option>
                <option value="SKA">SKA</option>
                <option value="SBA">SBA</option>
              </select>
            </div>
            {/* Trade */}
            <div className="flex items-center gap-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Trade</label>
              <select value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none cursor-pointer">
                <option value="ALL">All</option>
                <option value="OM">OM</option>
                <option value="EM">EM</option>
                <option value="OHN">OHN</option>
              </select>
            </div>
            {/* Location */}
            <div className="flex items-center gap-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Location</label>
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none cursor-pointer min-w-[100px]">
                <option value="ALL">All</option>
                {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            </div>
            {/* Course */}
            <div className="flex items-center gap-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Course</label>
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none cursor-pointer">
                <option value="ALL">All Courses</option>
                {ALL_COURSE_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Status */}
            <div className="flex items-center gap-1.5">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none cursor-pointer">
                <option value="ALL">All Status</option>
                <option value="valid">Valid</option>
                <option value="expiring">Expiring</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            {/* Record count */}
            <span className="text-[10px] text-muted-foreground font-bold">
              Showing <span className="text-foreground font-black">{filtered.length}</span> of {personnel.length}
            </span>
            {/* Name search - far right */}
            <div className="flex items-center gap-1.5 ml-auto">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Name</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold outline-none w-44 placeholder:text-slate-500"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-slate-600 hover:bg-slate-500 rounded p-0.5 transition-colors">
                    <X className="w-3 h-3 text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 text-[9px] font-bold uppercase text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_GREEN }} />
              <span>{"Safe (>6 months)"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_YELLOW }} />
              <span>{"Warning (3-6 months)"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_ORANGE }} />
              <span>{"Critical (<3 months)"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Plan scheduled</span>
            </div>
            {canEdit && (
              <span className="ml-3 text-blue-400 normal-case">Double-click a cell to edit</span>
            )}
          </div>
        </div>

        {/* Table Container: fills remaining height, scrolls both ways */}
        <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-300 shadow-sm overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="sticky top-0 z-50">
                {/* Row 1: Course Name Headers with PIE CHARTS */}
                <tr>
                  <th rowSpan={2} className="px-2 py-2 border-r border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700 bg-white sticky left-0 z-[60] w-[36px] text-center">#</th>
                    <th rowSpan={2} className="px-2 py-2 border-r border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700 bg-white sticky left-[36px] z-[60] min-w-[170px]">Name</th>
                    {visibleCourses.map((cc) => {
                    const st = courseStats[cc.name] || { green: 0, yellow: 0, orange: 0, planCount: 0 };
                    return (
                      <th
                        key={cc.name}
                        colSpan={cc.colCount}
                        className="px-1 py-1.5 border-r border-b border-slate-300 text-center bg-white"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white px-2 py-0.5 rounded" style={{ backgroundColor: cc.headerBg }}>
                            {cc.name}
                          </span>
                          <CoursePieChart green={st.green} yellow={st.yellow} orange={st.orange} planCount={st.planCount} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
                {/* Row 2: Sub-column headers */}
                <tr className="bg-slate-100">
                  {visibleCourses.map((cc) => {
                    if (cc.colType === "apc") {
                      return (
                        <Fragment key={cc.name}>
                          <th className="px-1 py-1.5 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-b border-slate-300 min-w-[72px]">APC No.</th>
                          <th className="px-1 py-1.5 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-b border-slate-300 min-w-[72px]">Expiry</th>
                          <th className="px-1 py-1.5 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-b border-slate-300 min-w-[72px]">Plan</th>
                        </Fragment>
                      );
                    }
                    if (cc.colType === "standard") {
                      return (
                        <Fragment key={cc.name}>
                          <th className="px-1 py-1.5 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-b border-slate-300 min-w-[72px]">Attended</th>
                          <th className="px-1 py-1.5 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-b border-slate-300 min-w-[72px]">Expiry</th>
                          <th className="px-1 py-1.5 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-b border-slate-300 min-w-[72px]">Plan</th>
                        </Fragment>
                      );
                    }
                    // single
                    return (
                      <th key={cc.name} className="px-1 py-1.5 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-b border-slate-300 min-w-[72px]">Expiry</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((person, idx) => {
                  const prev = filtered[idx - 1];
                  const showSep = !prev || prev.client !== person.client || tradeRank(prev.post) !== tradeRank(person.post);

                  return (
                    <Fragment key={person.crew_id}>
                      {showSep && (
                        <tr className="bg-slate-200">
                          <td colSpan={totalCols} className="px-3 py-1.5 sticky left-0 bg-slate-200 z-10">
                            <span className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider ${
                              person.client === "SKA" ? "text-blue-700" : "text-orange-700"
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${person.client === "SKA" ? "bg-blue-600" : "bg-orange-600"}`} />
                              {person.client} - {fullTrade(person.post)}
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-blue-50/50 transition-colors group">
                        <td className="px-2 py-1.5 border-r border-slate-200 sticky left-0 bg-white group-hover:bg-blue-50/50 z-10 text-[11px] text-slate-500 font-bold tabular-nums text-center">{idx + 1}</td>
                        <td className="px-2 py-1.5 border-r border-slate-200 sticky left-[36px] bg-white group-hover:bg-blue-50/50 z-10 overflow-hidden">
                          <div className="text-[11px] font-bold text-slate-900 uppercase truncate w-[155px]">{person.crew_name}</div>
                        </td>
                        {/* Render cells for each course */}
                        {visibleCourses.map((cc) => {
                          const cert = person.certs[cc.name];
                          const status = getCellStatus(cert?.expiry_date || null, today);
                          const expStyle = EXPIRY_CELL[status];

                          if (cc.colType === "apc") {
                            return (
                              <Fragment key={cc.name}>
                                <TextCell value={cert?.cert_no || null} className="" />
                                <EditableCell
                                  value={cert?.expiry_date || null}
                                  displayValue={fmtDate(cert?.expiry_date || null)}
                                  matrixId={cert?.matrix_id || null}
                                  crewId={person.crew_id}
                                  certType={cc.name}
                                  field="expiry_date"
                                  canEdit={!!canEdit}
                                  className={`${expStyle.bg} ${expStyle.text}`}
                                  onSaved={loadData}
                                />
                                <EditableCell
                                  value={cert?.plan_date || null}
                                  displayValue={fmtDate(cert?.plan_date || null)}
                                  matrixId={cert?.matrix_id || null}
                                  crewId={person.crew_id}
                                  certType={cc.name}
                                  field="plan_date"
                                  canEdit={!!canEdit}
                                  className="text-blue-700 font-medium"
                                  onSaved={loadData}
                                />
                              </Fragment>
                            );
                          }

                          if (cc.colType === "standard") {
                            return (
                              <Fragment key={cc.name}>
                                <EditableCell
                                  value={cert?.attended_date || null}
                                  displayValue={fmtDate(cert?.attended_date || null)}
                                  matrixId={cert?.matrix_id || null}
                                  crewId={person.crew_id}
                                  certType={cc.name}
                                  field="attended_date"
                                  canEdit={!!canEdit}
                                  className="text-slate-700 font-medium"
                                  onSaved={loadData}
                                />
                                <EditableCell
                                  value={cert?.expiry_date || null}
                                  displayValue={fmtDate(cert?.expiry_date || null)}
                                  matrixId={cert?.matrix_id || null}
                                  crewId={person.crew_id}
                                  certType={cc.name}
                                  field="expiry_date"
                                  canEdit={!!canEdit}
                                  className={`${expStyle.bg} ${expStyle.text}`}
                                  onSaved={loadData}
                                />
                                <EditableCell
                                  value={cert?.plan_date || null}
                                  displayValue={fmtDate(cert?.plan_date || null)}
                                  matrixId={cert?.matrix_id || null}
                                  crewId={person.crew_id}
                                  certType={cc.name}
                                  field="plan_date"
                                  canEdit={!!canEdit}
                                  className="text-blue-700 font-medium"
                                  onSaved={loadData}
                                />
                              </Fragment>
                            );
                          }

                          // single column - expiry only
                          return (
                            <EditableCell
                              key={cc.name}
                              value={cert?.expiry_date || null}
                              displayValue={fmtDate(cert?.expiry_date || null)}
                              matrixId={cert?.matrix_id || null}
                              crewId={person.crew_id}
                              certType={cc.name}
                              field="expiry_date"
                              canEdit={!!canEdit}
                              className={`${expStyle.bg} ${expStyle.text}`}
                              onSaved={loadData}
                            />
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={totalCols} className="px-4 py-16 text-center">
                      <p className="text-sm text-slate-500">
                        {personnel.length === 0 ? "No training data found. Ensure pcsb_crew_detail and pcsb_matrix tables have data." : "No personnel match the selected filters."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
