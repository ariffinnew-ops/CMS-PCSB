"use client";

import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { getMatrixData, updateMatrixCell, createMatrixRecord } from "@/lib/actions";
import { getUser } from "@/lib/auth";
import type { MatrixRecord } from "@/lib/types";
import type { AuthUser } from "@/lib/auth";
import { X } from "lucide-react";

// ─── Course Configuration ───
// Each course has: name, colType, colCount, headerBg (distinct per course)
// colType: "apc" | "standard" | "medical" | "single"
interface CourseConfig {
  name: string;
  colType: "apc" | "standard" | "medical" | "single";
  colCount: number; // total sub-columns
  headerBg: string; // distinct bg color for header group
  headerText: string;
}

const COURSE_CONFIG: CourseConfig[] = [
  { name: "APC",     colType: "apc",      colCount: 3, headerBg: "bg-indigo-600",  headerText: "text-white" },
  { name: "BLS",     colType: "standard",  colCount: 3, headerBg: "bg-sky-600",     headerText: "text-white" },
  { name: "ACLS",    colType: "standard",  colCount: 3, headerBg: "bg-violet-600",  headerText: "text-white" },
  { name: "ATLS",    colType: "standard",  colCount: 3, headerBg: "bg-pink-600",    headerText: "text-white" },
  { name: "AMRO",    colType: "standard",  colCount: 3, headerBg: "bg-amber-600",   headerText: "text-white" },
  { name: "BOSIET",  colType: "standard",  colCount: 3, headerBg: "bg-teal-600",    headerText: "text-white" },
  { name: "ACCPH2",  colType: "standard",  colCount: 3, headerBg: "bg-cyan-600",    headerText: "text-white" },
  { name: "SMC",     colType: "standard",  colCount: 3, headerBg: "bg-orange-600",  headerText: "text-white" },
  { name: "MEDICAL", colType: "medical",   colCount: 2, headerBg: "bg-red-600",     headerText: "text-white" },
  { name: "CCC",     colType: "single",    colCount: 1, headerBg: "bg-purple-600",  headerText: "text-white" },
  { name: "OSP",     colType: "single",    colCount: 1, headerBg: "bg-emerald-700", headerText: "text-white" },
];

const ALL_COURSE_NAMES = COURSE_CONFIG.map((c) => c.name);
const FIXED_COLS = 4; // #, Name, Trade, Client

// Light bg tints per course for body cells
const COURSE_BODY_BG: Record<string, string> = {
  APC:     "bg-indigo-50/60",
  BLS:     "bg-sky-50/60",
  ACLS:    "bg-violet-50/60",
  ATLS:    "bg-pink-50/60",
  AMRO:    "bg-amber-50/60",
  BOSIET:  "bg-teal-50/60",
  ACCPH2:  "bg-cyan-50/60",
  SMC:     "bg-orange-50/60",
  MEDICAL: "bg-red-50/60",
  CCC:     "bg-purple-50/60",
  OSP:     "bg-emerald-50/60",
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

// Status styling for expiry cells
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

// ─── Text Cell (for APC Number - non-date) ───
function TextCell({ value, className }: { value: string | null; className: string }) {
  return (
    <td className={`px-1 py-1.5 text-[11px] text-center tabular-nums border-r border-slate-200 font-semibold text-slate-800 ${className}`}>
      {value || "-"}
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

  // Filter
  const filtered = useMemo(() => {
    return personnel.filter((p) => {
      if (clientFilter !== "ALL" && p.client !== clientFilter) return false;
      if (tradeFilter !== "ALL" && shortTrade(p.post) !== tradeFilter) return false;
      if (statusFilter !== "ALL") {
        const has = ALL_COURSE_NAMES.some((c) => getStatus(p.certs[c]?.expiry_date || null, today) === statusFilter);
        if (!has) return false;
      }
      if (search && !p.crew_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [personnel, clientFilter, tradeFilter, statusFilter, search, today]);

  // Per-course stats for headers
  const courseStats = useMemo(() => {
    const stats: Record<string, { valid: number; expiring: number; expired: number; total: number }> = {};
    for (const cc of COURSE_CONFIG) {
      const st = { valid: 0, expiring: 0, expired: 0, total: personnel.length };
      for (const p of personnel) {
        const s = getStatus(p.certs[cc.name]?.expiry_date || null, today);
        if (s === "valid") st.valid++;
        else if (s === "expiring") st.expiring++;
        else if (s === "expired") st.expired++;
      }
      stats[cc.name] = st;
    }
    return stats;
  }, [personnel, today]);

  // Total sub-columns count
  const totalSubCols = COURSE_CONFIG.reduce((acc, c) => acc + c.colCount, 0);
  const totalCols = FIXED_COLS + totalSubCols;

  return (
    <AppShell>
      <div className="space-y-3 animate-in fade-in duration-500">
        {/* Title Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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
          <span className="text-[10px] text-muted-foreground font-bold">
            Showing <span className="text-foreground font-black">{filtered.length}</span> of {personnel.length} records
          </span>
          {/* Name Search far right with clear button */}
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Name</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold outline-none w-48 placeholder:text-slate-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-slate-600 hover:bg-slate-500 rounded p-0.5 transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-50">
                  {/* Row 1: Course Name Headers with per-course stats */}
                  <tr>
                    <th rowSpan={3} className="px-2 py-2 border-r border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 sticky left-0 z-50 w-[36px] text-center">#</th>
                    <th rowSpan={3} className="px-2 py-2 border-r border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 sticky left-[36px] z-50 min-w-[170px]">Name / Location</th>
                    <th rowSpan={3} className="px-2 py-2 border-r border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 text-center w-[48px]">Trade</th>
                    <th rowSpan={3} className="px-2 py-2 border-r border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 text-center w-[48px]">Client</th>
                    {COURSE_CONFIG.map((cc) => (
                      <th
                        key={cc.name}
                        colSpan={cc.colCount}
                        className={`px-1 py-1.5 border-r border-b border-slate-300 text-center ${cc.headerBg} ${cc.headerText}`}
                      >
                        <div className="text-[11px] font-black uppercase tracking-widest leading-none">{cc.name}</div>
                      </th>
                    ))}
                  </tr>
                  {/* Row 2: Per-course mini stats (% valid bar) */}
                  <tr>
                    {COURSE_CONFIG.map((cc) => {
                      const st = courseStats[cc.name] || { valid: 0, expiring: 0, expired: 0, total: 1 };
                      const pctValid = st.total > 0 ? Math.round((st.valid / st.total) * 100) : 0;
                      const pctExpiring = st.total > 0 ? Math.round((st.expiring / st.total) * 100) : 0;
                      const pctExpired = st.total > 0 ? Math.round((st.expired / st.total) * 100) : 0;
                      return (
                        <th
                          key={cc.name}
                          colSpan={cc.colCount}
                          className="px-1 py-1 border-r border-b border-slate-300 bg-slate-50"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <div className="flex h-2 w-full max-w-[80px] rounded-full overflow-hidden bg-slate-200">
                              <div className="bg-emerald-500 h-full" style={{ width: `${pctValid}%` }} />
                              <div className="bg-amber-400 h-full" style={{ width: `${pctExpiring}%` }} />
                              <div className="bg-red-500 h-full" style={{ width: `${pctExpired}%` }} />
                            </div>
                            <span className="text-[8px] font-bold text-slate-500 tabular-nums">{pctValid}%</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                  {/* Row 3: Sub-column headers */}
                  <tr className="bg-slate-200">
                    {COURSE_CONFIG.map((cc) => {
                      if (cc.colType === "apc") {
                        return (
                          <Fragment key={cc.name}>
                            <th className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">APC No.</th>
                            <th className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">Expiry</th>
                            <th className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">Plan</th>
                          </Fragment>
                        );
                      }
                      if (cc.colType === "standard") {
                        return (
                          <Fragment key={cc.name}>
                            <th className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">Attended</th>
                            <th className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">Expiry</th>
                            <th className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">Plan</th>
                          </Fragment>
                        );
                      }
                      if (cc.colType === "medical") {
                        return (
                          <Fragment key={cc.name}>
                            <th className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">Attended</th>
                            <th className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">Expiry</th>
                          </Fragment>
                        );
                      }
                      // single
                      return (
                        <th key={cc.name} className="px-1 py-1 text-[8px] font-bold text-slate-600 uppercase text-center border-r border-slate-300 min-w-[72px]">Expiry</th>
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
                            <td colSpan={totalCols} className="px-3 py-1.5 sticky left-0 bg-slate-200">
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
                          <td className="px-2 py-1.5 border-r border-slate-200 sticky left-[36px] bg-white group-hover:bg-blue-50/50 z-10">
                            <div className="text-[11px] font-bold text-slate-900 uppercase truncate max-w-[160px]">{person.crew_name}</div>
                            <div className="text-[9px] text-slate-400 truncate">{person.location || "-"}</div>
                          </td>
                          <td className="px-1 py-1.5 border-r border-slate-200 text-center">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              shortTrade(person.post) === "OM" ? "bg-blue-100 text-blue-700"
                                : shortTrade(person.post) === "EM" ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>{shortTrade(person.post)}</span>
                          </td>
                          <td className="px-1 py-1.5 border-r border-slate-200 text-center">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              person.client === "SKA" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                            }`}>{person.client}</span>
                          </td>
                          {/* Render cells for each course */}
                          {COURSE_CONFIG.map((cc) => {
                            const cert = person.certs[cc.name];
                            const status = getStatus(cert?.expiry_date || null, today);
                            const expStyle = EXPIRY_CELL[status];
                            const baseBg = COURSE_BODY_BG[cc.name] || "";

                            if (cc.colType === "apc") {
                              return (
                                <Fragment key={cc.name}>
                                  <TextCell value={cert?.cert_no || null} className={baseBg} />
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
                                    className={`${baseBg} text-slate-600 font-medium`}
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
                                    className={`${baseBg} text-slate-700 font-medium`}
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
                                    className={`${baseBg} text-slate-600 font-medium`}
                                    onSaved={loadData}
                                  />
                                </Fragment>
                              );
                            }

                            if (cc.colType === "medical") {
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
                                    className={`${baseBg} text-slate-700 font-medium`}
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
                                </Fragment>
                              );
                            }

                            // single column (CCC, OSP) - expiry only
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
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 px-4 py-2 bg-card rounded-xl border border-border w-fit text-[10px] font-bold uppercase text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-emerald-100 rounded border border-emerald-400" />
            <span className="text-emerald-600">{"Valid (> 90d)"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-amber-100 rounded border border-amber-400" />
            <span className="text-amber-600">{"Expiring (< 90d)"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-red-100 rounded border border-red-400" />
            <span className="text-red-600">Expired</span>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 ml-4 border-l border-slate-600 pl-4">
              <span className="text-blue-400">Double-click a date cell to edit</span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
