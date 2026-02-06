"use client";

import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { getMatrixData, updateMatrixCell, createMatrixRecord } from "@/lib/actions";
import { getUser } from "@/lib/auth";
import type { MatrixRecord } from "@/lib/types";
import type { AuthUser } from "@/lib/auth";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

// ─── Course definitions from the PDF reference ───
// Main courses: have both Attended and Expiry date columns
const MAIN_COURSES = ["BLS", "ACLS", "ATLS", "AMRO", "BOSIET", "ACCPH2", "SMC", "MEDICAL"];
// Expiry-only courses: only have an Expiry date column (from PDF last columns)
const EXPIRY_ONLY_COURSES = ["OSPCCC", "MLC"];
const ALL_COURSES = [...MAIN_COURSES, ...EXPIRY_ONLY_COURSES];

const COURSE_COLORS: Record<string, string> = {
  BLS: "#3b82f6", ACLS: "#8b5cf6", ATLS: "#ec4899", AMRO: "#f59e0b",
  BOSIET: "#10b981", ACCPH2: "#06b6d4", SMC: "#f97316", MEDICAL: "#ef4444",
  OSPCCC: "#6366f1", MLC: "#a855f7",
};

// ─── Status helpers ───
function getStatus(expiryStr: string | null, today: Date): "valid" | "expiring" | "expired" | "no-data" {
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

const STATUS_BG: Record<string, string> = {
  valid: "bg-emerald-500/10",
  expiring: "bg-amber-500/10",
  expired: "bg-red-500/10",
  "no-data": "",
};

const STATUS_TEXT: Record<string, string> = {
  valid: "text-emerald-400",
  expiring: "text-amber-400",
  expired: "text-red-400",
  "no-data": "text-slate-600",
};

const STATUS_EXPIRY_BG: Record<string, string> = {
  valid: "bg-emerald-500/15 border-l border-emerald-500/30",
  expiring: "bg-amber-500/15 border-l border-amber-500/30",
  expired: "bg-red-500/15 border-l border-red-500/30",
  "no-data": "",
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

// ─── Grouped person type ───
interface CertEntry {
  matrix_id: string | null;
  attended_date: string | null;
  expiry_date: string | null;
}

interface PersonMatrix {
  crew_id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  certs: Record<string, CertEntry>;
}

// ─── Custom Tooltip for charts ───
function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs font-bold text-white mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-bold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Editable Date Cell ───
function DateCell({
  value,
  matrixId,
  crewId,
  certType,
  field,
  canEdit,
  status,
  isExpiry,
  onSaved,
}: {
  value: string | null;
  matrixId: string | null;
  crewId: string;
  certType: string;
  field: "attended_date" | "expiry_date";
  canEdit: boolean;
  status: string;
  isExpiry: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const bgClass = isExpiry ? STATUS_EXPIRY_BG[status] : STATUS_BG[status];
  const textClass = STATUS_TEXT[status];

  const handleChange = async (newVal: string) => {
    setEditing(false);
    if (!newVal && !value) return;
    if (newVal === toInputDate(value)) return;

    setSaving(true);
    try {
      if (matrixId) {
        await updateMatrixCell(matrixId, field, newVal || null);
      } else if (newVal) {
        await createMatrixRecord(crewId, certType, field, newVal);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (editing && canEdit) {
    return (
      <td className={`px-0.5 py-0.5 text-center border-r border-slate-700/30 ${bgClass}`}>
        <input
          type="date"
          defaultValue={toInputDate(value)}
          autoFocus
          onBlur={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleChange((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="bg-slate-800 text-white text-[9px] border border-blue-500 rounded px-1 py-0.5 w-[90px] outline-none"
        />
      </td>
    );
  }

  return (
    <td
      className={`px-1 py-2 text-[9px] text-center tabular-nums border-r border-slate-700/30 ${bgClass} ${textClass} ${
        canEdit ? "cursor-pointer hover:ring-1 hover:ring-blue-500/50 hover:ring-inset" : ""
      } ${saving ? "opacity-50" : ""} ${isExpiry ? "font-bold" : ""}`}
      onDoubleClick={() => canEdit && setEditing(true)}
      title={canEdit ? "Double-click to edit" : undefined}
    >
      {saving ? "..." : fmtDate(value)}
    </td>
  );
}

export default function TrainingMatrixPage() {
  const [rawData, setRawData] = useState<MatrixRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState("ALL");
  const [tradeFilter, setTradeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
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
        p.certs[key] = { matrix_id: row.id, attended_date: row.attended_date, expiry_date: row.expiry_date };
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const c = a.client.localeCompare(b.client);
      if (c !== 0) return c;
      return tradeRank(a.post) - tradeRank(b.post);
    });
  }, [rawData]);

  // Filter
  const filtered = useMemo(() => {
    return personnel.filter((p) => {
      if (clientFilter !== "ALL" && p.client !== clientFilter) return false;
      if (tradeFilter !== "ALL" && shortTrade(p.post) !== tradeFilter) return false;
      if (statusFilter !== "ALL") {
        const has = ALL_COURSES.some((c) => getStatus(p.certs[c]?.expiry_date || null, today) === statusFilter);
        if (!has) return false;
      }
      if (search && !p.crew_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [personnel, clientFilter, tradeFilter, statusFilter, search, today]);

  // Filtered courses based on courseSearch
  const visibleMainCourses = useMemo(() => {
    if (!courseSearch) return MAIN_COURSES;
    return MAIN_COURSES.filter((c) => c.toLowerCase().includes(courseSearch.toLowerCase()));
  }, [courseSearch]);

  const visibleExpiryCourses = useMemo(() => {
    if (!courseSearch) return EXPIRY_ONLY_COURSES;
    return EXPIRY_ONLY_COURSES.filter((c) => c.toLowerCase().includes(courseSearch.toLowerCase()));
  }, [courseSearch]);

  // ─── Chart Data ───
  const { barData, pieData, stats } = useMemo(() => {
    const counts: Record<string, { valid: number; expiring: number; expired: number }> = {};
    for (const c of ALL_COURSES) counts[c] = { valid: 0, expiring: 0, expired: 0 };
    let tValid = 0, tExpiring = 0, tExpired = 0, tNone = 0;

    for (const p of personnel) {
      for (const c of ALL_COURSES) {
        const s = getStatus(p.certs[c]?.expiry_date || null, today);
        if (s === "valid") { counts[c].valid++; tValid++; }
        else if (s === "expiring") { counts[c].expiring++; tExpiring++; }
        else if (s === "expired") { counts[c].expired++; tExpired++; }
        else tNone++;
      }
    }

    return {
      barData: ALL_COURSES.map((c) => ({ course: c, Valid: counts[c].valid, Expiring: counts[c].expiring, Expired: counts[c].expired })),
      pieData: [
        { name: "Valid", value: tValid, color: "#10b981" },
        { name: "Expiring", value: tExpiring, color: "#f59e0b" },
        { name: "Expired", value: tExpired, color: "#ef4444" },
        { name: "No Data", value: tNone, color: "#475569" },
      ].filter((d) => d.value > 0),
      stats: { total: personnel.length, valid: tValid, expiring: tExpiring, expired: tExpired },
    };
  }, [personnel, today]);

  // Compute column count for colSpan
  const totalCols = 4 + visibleMainCourses.length * 2 + visibleExpiryCourses.length;

  return (
    <AppShell>
      <div className="space-y-4 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Training Matrix</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              IMS Personnel Competency & Certification Tracker
              {canEdit && <span className="ml-2 text-blue-400">(Double-click cells to edit)</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {[
              { label: "Valid", count: stats.valid, dot: "bg-emerald-500", text: "text-emerald-400" },
              { label: "Expiring", count: stats.expiring, dot: "bg-amber-500", text: "text-amber-400" },
              { label: "Expired", count: stats.expired, dot: "bg-red-500", text: "text-red-400" },
              { label: "Personnel", count: stats.total, dot: "bg-slate-400", text: "text-foreground" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl">
                <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{s.label}</div>
                  <div className={`text-lg font-black tabular-nums leading-none ${s.text}`}>{s.count}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Certification Status by Course</h3>
            {loading ? (
              <div className="flex items-center justify-center h-[200px]">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="course" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <Bar dataKey="Valid" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Expiring" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Expired" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Overall Compliance</h3>
            {loading ? (
              <div className="flex items-center justify-center h-[200px]">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent" />)}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-3">
          {[
            { label: "Client", value: clientFilter, set: setClientFilter, opts: [["ALL", "All"], ["SKA", "SKA"], ["SBA", "SBA"]] },
            { label: "Trade", value: tradeFilter, set: setTradeFilter, opts: [["ALL", "All"], ["OM", "OM"], ["EM", "EM"], ["OHN", "OHN"]] },
            { label: "Status", value: statusFilter, set: setStatusFilter, opts: [["ALL", "All Status"], ["valid", "Valid"], ["expiring", "Expiring"], ["expired", "Expired"]] },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{f.label}</label>
              <select
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-bold outline-none cursor-pointer"
              >
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Name</label>
            <input
              type="text"
              placeholder="Search name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold outline-none w-40 placeholder:text-slate-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Course</label>
            <input
              type="text"
              placeholder="Search course..."
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold outline-none w-40 placeholder:text-slate-500"
            />
          </div>
          <span className="ml-auto text-[10px] text-muted-foreground font-bold">
            Showing <span className="text-foreground">{filtered.length}</span> of {personnel.length}
          </span>
        </div>

        {/* Matrix Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20">
                  {/* Course name row */}
                  <tr className="bg-slate-900 text-white">
                    <th rowSpan={2} className="px-2 py-2.5 border-r border-slate-700 text-[10px] font-black uppercase tracking-wider sticky left-0 bg-slate-900 z-30 w-[36px]">#</th>
                    <th rowSpan={2} className="px-2 py-2.5 border-r border-slate-700 text-[10px] font-black uppercase tracking-wider sticky left-[36px] bg-slate-900 z-30 min-w-[160px]">Name</th>
                    <th rowSpan={2} className="px-2 py-2.5 border-r border-slate-700 text-[10px] font-black uppercase tracking-wider text-center w-[48px]">Trade</th>
                    <th rowSpan={2} className="px-2 py-2.5 border-r border-slate-700 text-[10px] font-black uppercase tracking-wider text-center w-[48px]">Client</th>
                    {visibleMainCourses.map((c) => (
                      <th key={c} colSpan={2} className="px-1 py-2 border-r border-slate-700 text-center border-b border-slate-600">
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COURSE_COLORS[c] }} />
                          <span className="text-[9px] font-black uppercase tracking-widest">{c}</span>
                        </div>
                      </th>
                    ))}
                    {visibleExpiryCourses.map((c) => (
                      <th key={c} className="px-1 py-2 border-r border-slate-700 text-center border-b border-slate-600">
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COURSE_COLORS[c] }} />
                          <span className="text-[9px] font-black uppercase tracking-widest">{c}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                  {/* Sub-header row */}
                  <tr className="bg-slate-800 text-[8px] font-bold text-slate-400 uppercase">
                    {visibleMainCourses.map((c) => (
                      <Fragment key={c}>
                        <th className="px-1 py-1 text-center border-r border-slate-700/50 min-w-[68px]">Attended</th>
                        <th className="px-1 py-1 text-center border-r border-slate-700 min-w-[68px]">Expiry</th>
                      </Fragment>
                    ))}
                    {visibleExpiryCourses.map((c) => (
                      <th key={c} className="px-1 py-1 text-center border-r border-slate-700 min-w-[68px]">Expiry</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filtered.map((person, idx) => {
                    const prev = filtered[idx - 1];
                    const showSep = !prev || prev.client !== person.client || tradeRank(prev.post) !== tradeRank(person.post);

                    return (
                      <Fragment key={person.crew_id}>
                        {showSep && (
                          <tr className="bg-slate-800/40">
                            <td colSpan={totalCols} className="px-3 py-2 sticky left-0">
                              <span className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider ${
                                person.client === "SKA" ? "text-blue-400" : "text-orange-400"
                              }`}>
                                <span className={`w-2.5 h-2.5 rounded-full ${person.client === "SKA" ? "bg-blue-500" : "bg-orange-500"}`} />
                                {person.client} - {fullTrade(person.post)}
                              </span>
                            </td>
                          </tr>
                        )}
                        <tr className="hover:bg-slate-800/30 transition-colors group">
                          <td className="px-2 py-1.5 border-r border-slate-800/50 sticky left-0 bg-card group-hover:bg-slate-800/30 z-10 text-[10px] text-slate-500 font-bold tabular-nums">{idx + 1}</td>
                          <td className="px-2 py-1.5 border-r border-slate-800/50 sticky left-[36px] bg-card group-hover:bg-slate-800/30 z-10">
                            <div className="text-[11px] font-bold text-white uppercase truncate">{person.crew_name}</div>
                            <div className="text-[9px] text-slate-500 truncate">{person.location || "-"}</div>
                          </td>
                          <td className="px-1 py-1.5 border-r border-slate-800/50 text-center">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold ${
                              shortTrade(person.post) === "OM" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                                : shortTrade(person.post) === "EM" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            }`}>{shortTrade(person.post)}</span>
                          </td>
                          <td className="px-1 py-1.5 border-r border-slate-800/50 text-center">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold ${
                              person.client === "SKA" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" : "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                            }`}>{person.client}</span>
                          </td>
                          {/* Main courses: Attended + Expiry */}
                          {visibleMainCourses.map((course) => {
                            const cert = person.certs[course];
                            const status = getStatus(cert?.expiry_date || null, today);
                            return (
                              <Fragment key={course}>
                                <DateCell
                                  value={cert?.attended_date || null}
                                  matrixId={cert?.matrix_id || null}
                                  crewId={person.crew_id}
                                  certType={course}
                                  field="attended_date"
                                  canEdit={!!canEdit}
                                  status={status}
                                  isExpiry={false}
                                  onSaved={loadData}
                                />
                                <DateCell
                                  value={cert?.expiry_date || null}
                                  matrixId={cert?.matrix_id || null}
                                  crewId={person.crew_id}
                                  certType={course}
                                  field="expiry_date"
                                  canEdit={!!canEdit}
                                  status={status}
                                  isExpiry={true}
                                  onSaved={loadData}
                                />
                              </Fragment>
                            );
                          })}
                          {/* Expiry-only courses */}
                          {visibleExpiryCourses.map((course) => {
                            const cert = person.certs[course];
                            const status = getStatus(cert?.expiry_date || null, today);
                            return (
                              <DateCell
                                key={course}
                                value={cert?.expiry_date || null}
                                matrixId={cert?.matrix_id || null}
                                crewId={person.crew_id}
                                certType={course}
                                field="expiry_date"
                                canEdit={!!canEdit}
                                status={status}
                                isExpiry={true}
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
                        <p className="text-sm text-muted-foreground">
                          {personnel.length === 0 ? "No training data found. Ensure pcsb_crew_detail and pcsb_matrix tables have data." : "No personnel match the selected filters"}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 px-4 py-2.5 bg-card rounded-xl border border-border w-fit text-[10px] font-bold uppercase text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500/15 rounded border border-emerald-500/30" />
            <span className="text-emerald-400">{"Valid (> 90 days)"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500/15 rounded border border-amber-500/30" />
            <span className="text-amber-400">{"Expiring (< 90 days)"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500/15 rounded border border-red-500/30" />
            <span className="text-red-400">Expired</span>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 ml-4 border-l border-slate-700 pl-4">
              <span className="text-blue-400">Double-click a date cell to edit</span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
