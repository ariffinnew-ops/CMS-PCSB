"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { getUser, ROLE_LEVELS, type AuthUser } from "@/lib/auth";
import {
  getCrewList,
  getCrewDetail,
  getCrewMatrix,
  getCrewRoster,
  updateCrewDetail,
  createCrewMember,
} from "@/lib/actions";

// ─── Types ───
interface CrewListItem {
  id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  status?: string;
}
interface MatrixRow {
  id: string;
  cert_type: string;
  cert_no: string | null;
  expiry_date: string | null;
  attended_date: string | null;
  plan_date: string | null;
}

// ─── Helpers ───
function roleLevel(u: AuthUser | null): number {
  if (!u) return 99;
  return ROLE_LEVELS[u.role] ?? 99;
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
}
function fmtRM(v: unknown): string {
  const n = Number(v);
  if (!v || isNaN(n)) return "-";
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function certColor(expiry: string | null): { label: string; text: string; bg: string; border: string } {
  if (!expiry) return { label: "N/A", text: "text-slate-400", bg: "bg-slate-800/50", border: "border-slate-700" };
  const diff = (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return { label: "EXPIRED", text: "text-red-400", bg: "bg-red-950/40", border: "border-red-800/60" };
  if (diff < 90) return { label: "EXPIRING", text: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-800/60" };
  if (diff < 180) return { label: "< 6 MO", text: "text-yellow-400", bg: "bg-yellow-950/40", border: "border-yellow-800/60" };
  return { label: "VALID", text: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-800/60" };
}
function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Gantt-style Roster Grid ───
function RosterGantt({ rosterRows }: { rosterRows: Record<string, unknown>[] }) {
  // Parse all mob/demob dates into a set of { year, month, day, type } entries
  const entries = useMemo(() => {
    const result: { date: Date; type: "M" | "D" }[] = [];
    for (const row of rosterRows) {
      for (let i = 1; i <= 24; i++) {
        const mVal = row[`m${i}`] as string | null;
        const dVal = row[`d${i}`] as string | null;
        if (mVal) { try { result.push({ date: new Date(mVal), type: "M" }); } catch {/* skip */} }
        if (dVal) { try { result.push({ date: new Date(dVal), type: "D" }); } catch {/* skip */} }
      }
    }
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return result;
  }, [rosterRows]);

  // Build month/year list from entries
  const months = useMemo(() => {
    if (entries.length === 0) return [];
    const monthSet = new Map<string, { year: number; month: number }>();
    for (const e of entries) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}`;
      if (!monthSet.has(key)) monthSet.set(key, { year: e.date.getFullYear(), month: e.date.getMonth() });
    }
    return Array.from(monthSet.values()).sort((a, b) => a.year - b.year || a.month - b.month);
  }, [entries]);

  // For each month, build day cells
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  if (months.length === 0) {
    return <p className="text-xs text-slate-500 italic px-1">No roster data available.</p>;
  }

  return (
    <div className="overflow-auto max-h-full">
      <table className="w-full text-[10px] border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800">
            <th className="px-2 py-1.5 text-left text-slate-400 font-bold uppercase tracking-wider sticky left-0 bg-slate-800 min-w-[80px]">Month</th>
            {Array.from({ length: 31 }, (_, i) => (
              <th key={i} className="px-0 py-1.5 text-center text-slate-500 font-bold w-6 min-w-[24px]">{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map(({ year, month }) => {
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            // Gather events for this month
            const dayMap = new Map<number, "M" | "D" | "W">();
            // Find mob/demob ranges
            const monthEntries = entries.filter(e => e.date.getFullYear() === year && e.date.getMonth() === month);
            for (const e of monthEntries) {
              dayMap.set(e.date.getDate(), e.type);
            }
            // Mark days between mob and demob as "Work"
            const allSorted = entries.filter(e => e.date.getFullYear() === year && e.date.getMonth() === month)
              .sort((a, b) => a.date.getDate() - b.date.getDate());
            let working = false;
            for (let day = 1; day <= daysInMonth; day++) {
              const ev = allSorted.find(e => e.date.getDate() === day);
              if (ev?.type === "M") working = true;
              if (working && !dayMap.has(day)) dayMap.set(day, "W");
              if (ev?.type === "D") working = false;
            }

            return (
              <tr key={`${year}-${month}`} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                <td className="px-2 py-1 font-bold text-slate-300 sticky left-0 bg-slate-900/95">
                  {MONTH_NAMES[month]} {year}
                </td>
                {Array.from({ length: 31 }, (_, i) => {
                  const day = i + 1;
                  if (day > daysInMonth) return <td key={day} className="bg-slate-900/30" />;
                  const ev = dayMap.get(day);
                  let cellClass = "bg-slate-900/20";
                  let cellContent = "";
                  if (ev === "M") { cellClass = "bg-emerald-600"; cellContent = "M"; }
                  else if (ev === "D") { cellClass = "bg-red-600"; cellContent = "D"; }
                  else if (ev === "W") { cellClass = "bg-blue-600/40"; }
                  return (
                    <td key={day} className={`text-center font-bold text-white ${cellClass} border-r border-slate-800/30`} style={{ fontSize: "8px" }}>
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Add Staff Modal ───
function AddStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ crew_name: "", post: "OM", client: "SBA", location: "", status: "Active" });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.crew_name.trim()) return;
    setSaving(true);
    const res = await createCrewMember(form);
    setSaving(false);
    if (res.success && res.id) onCreated(res.id);
    else alert(res.error || "Failed to create");
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Add New Staff</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white text-lg font-bold">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Full Name *</label>
            <input value={form.crew_name} onChange={(e) => set("crew_name", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Trade</label>
              <select value={form.post} onChange={(e) => set("post", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                <option>OM</option><option>EM</option><option>OHN</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Client</label>
              <select value={form.client} onChange={(e) => set("client", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                <option>SBA</option><option>SKA</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Location</label>
            <input value={form.location} onChange={(e) => set("location", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || !form.crew_name.trim()} className="px-5 py-2 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors">
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// ─── MAIN PAGE ───
// ═══════════════════════════════════════
export default function StaffDetailPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [crewList, setCrewList] = useState<CrewListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [rosterRows, setRosterRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);

  const lvl = roleLevel(user);
  const isL1L2 = lvl <= 2;

  // Init
  useEffect(() => {
    const u = getUser();
    setUser(u);
    getCrewList().then((res) => {
      if (res.success && res.data) {
        setCrewList(res.data);
        if (res.data.length > 0) setSelectedId(res.data[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Load detail
  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    const [detRes, matRes, rosRes] = await Promise.all([
      getCrewDetail(id),
      getCrewMatrix(id),
      getCrewRoster(id),
    ]);
    if (detRes.success && detRes.data) setDetail(detRes.data);
    if (matRes.success && matRes.data) setMatrix(matRes.data);
    if (rosRes.success && rosRes.data) setRosterRows(rosRes.data as Record<string, unknown>[]);
  }, []);

  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  // Filtered crew list
  const filteredCrew = useMemo(() => {
    if (!search.trim()) return crewList;
    const q = search.toLowerCase();
    return crewList.filter((c) => c.crew_name.toLowerCase().includes(q) || c.post.toLowerCase().includes(q));
  }, [crewList, search]);

  // Contract expiry warning
  const expDays = daysUntil(detail?.exp_date as string | null);

  // Status toggle handler
  const handleStatusToggle = async () => {
    if (!detail || !selectedId) return;
    const current = String(detail.status || "Active");
    const newStatus = current === "Active" ? "Resigned" : "Active";
    setEditingStatus(true);
    const res = await updateCrewDetail(selectedId, { status: newStatus });
    if (res.success) {
      setDetail((prev) => prev ? { ...prev, status: newStatus } : prev);
      setCrewList((prev) => prev.map((c) => c.id === selectedId ? { ...c, status: newStatus } : c));
    }
    setEditingStatus(false);
  };

  // Add staff callback
  const handleCreated = (id: string) => {
    setShowAdd(false);
    getCrewList().then((res) => {
      if (res.success && res.data) {
        setCrewList(res.data);
        setSelectedId(id);
      }
    });
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
        </div>
      </AppShell>
    );
  }

  if (crewList.length === 0) {
    return (
      <AppShell>
        <div className="space-y-4">
          <h2 className="text-xl font-black text-foreground tracking-tight uppercase">Staff Detail</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-xl py-10 text-center">
            <p className="text-sm text-slate-500 font-semibold">No staff records found.</p>
            {isL1L2 && (
              <button type="button" onClick={() => setShowAdd(true)} className="mt-3 px-4 py-2 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500">
                Add Staff
              </button>
            )}
          </div>
          {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
        </div>
      </AppShell>
    );
  }

  const d = detail;
  const statusVal = String(d?.status || "Active");
  const isResigned = statusVal === "Resigned";

  return (
    <AppShell>
      {/* ═══ 3-PANE GRID ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-80px)] animate-in fade-in duration-500">

        {/* ═══════════════════════════════════════ */}
        {/* SECTION A: LEFT SIDEBAR (30%) */}
        {/* ═══════════════════════════════════════ */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-y-auto flex flex-col">

          {/* Search Crew Combobox */}
          <div className="p-3 border-b border-slate-800">
            <input
              type="text"
              placeholder="Search crew..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 placeholder:text-slate-500"
            />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer"
            >
              {filteredCrew.map((c) => (
                <option key={c.id} value={c.id}>{c.crew_name} ({c.post})</option>
              ))}
            </select>
          </div>

          {d && (
            <>
              {/* Avatar + Status Badge */}
              <div className="flex flex-col items-center pt-6 pb-4 px-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-4xl font-black text-slate-300 shadow-lg border-4 border-slate-800">
                  {String(d.crew_name || "").charAt(0)}
                </div>
                <span className={`mt-3 px-4 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                  isResigned ? "bg-red-600/20 text-red-400 border border-red-700/50" : "bg-emerald-600/20 text-emerald-400 border border-emerald-700/50"
                }`}>
                  {statusVal}
                </span>
              </div>

              {/* Name & Trade */}
              <div className="px-5 pb-3 text-center">
                <h3 className="text-lg font-black text-white uppercase leading-tight">{String(d.crew_name || "-")}</h3>
                <p className="text-sm font-bold text-blue-400 mt-0.5">{String(d.post || "-")}</p>
              </div>

              <div className="border-t border-slate-800 mx-4" />

              {/* Core Details */}
              <div className="px-5 py-4 space-y-3 flex-1">
                {/* Assignment */}
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Assignment</p>
                  <p className="text-sm font-bold text-slate-200">{String(d.location || "-")}</p>
                </div>
                {/* Client */}
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Client</p>
                  <p className="text-sm font-bold text-slate-200">{String(d.client || "-")}</p>
                </div>
                {/* Contract Expiry */}
                {d.exp_date && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Contract Expiry</p>
                    <p className="text-sm font-bold text-slate-200">{fmtDate(String(d.exp_date))}</p>
                    {expDays !== null && expDays < 90 && expDays >= 0 && (
                      <div className="mt-1 px-2.5 py-1 bg-red-600/20 border border-red-700/50 rounded-lg">
                        <span className="text-[10px] font-black text-red-400 uppercase">EXPIRING IN {expDays} DAYS</span>
                      </div>
                    )}
                    {expDays !== null && expDays < 0 && (
                      <div className="mt-1 px-2.5 py-1 bg-red-600/20 border border-red-700/50 rounded-lg">
                        <span className="text-[10px] font-black text-red-400 uppercase">EXPIRED</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Contact Info */}
                {(d.phone || d.email1) && <div className="border-t border-slate-800 pt-3" />}
                {d.phone && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Phone</p>
                    <p className="text-xs font-semibold text-slate-300">{String(d.phone)}</p>
                  </div>
                )}
                {d.email1 && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Email</p>
                    <p className="text-xs font-semibold text-slate-300 break-all">{String(d.email1)}</p>
                  </div>
                )}
                {d.ic_no && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">IC No</p>
                    <p className="text-xs font-semibold text-slate-300">{String(d.ic_no)}</p>
                  </div>
                )}
                {d.passport_no && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Passport</p>
                    <p className="text-xs font-semibold text-slate-300">{String(d.passport_no)}</p>
                  </div>
                )}
                {d.hire_date && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Hire Date</p>
                    <p className="text-xs font-semibold text-slate-300">{fmtDate(String(d.hire_date))}</p>
                  </div>
                )}

                {/* NOK */}
                {d.nok_name && (
                  <>
                    <div className="border-t border-slate-800 pt-3" />
                    <div>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Next of Kin</p>
                      <p className="text-xs font-semibold text-slate-300">{String(d.nok_name)}</p>
                      {d.nok_relation && <p className="text-[10px] text-slate-500">{String(d.nok_relation)}</p>}
                      {d.nok_phone && <p className="text-[10px] text-slate-500">{String(d.nok_phone)}</p>}
                    </div>
                  </>
                )}

                {/* ─── L1/L2 RESTRICTED: Financials ─── */}
                {isL1L2 && (
                  <>
                    <div className="border-t border-red-900/50 pt-3" />
                    <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Restricted - Financials</p>
                    {d.basic !== undefined && d.basic !== null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Basic</span>
                        <span className="font-bold text-slate-300">{fmtRM(d.basic)}</span>
                      </div>
                    )}
                    {d.oa_rate !== undefined && d.oa_rate !== null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">OA Rate</span>
                        <span className="font-bold text-slate-300">{fmtRM(d.oa_rate)}</span>
                      </div>
                    )}
                    {d.fixed_all !== undefined && d.fixed_all !== null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Fixed Allowance</span>
                        <span className="font-bold text-slate-300">{fmtRM(d.fixed_all)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ─── L1/L2 ACTIONS ─── */}
              {isL1L2 && (
                <div className="p-4 border-t border-slate-800 space-y-2">
                  <button
                    type="button"
                    onClick={handleStatusToggle}
                    disabled={editingStatus}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-black uppercase transition-colors ${
                      isResigned
                        ? "bg-emerald-600/20 text-emerald-400 border border-emerald-700/50 hover:bg-emerald-600/30"
                        : "bg-red-600/20 text-red-400 border border-red-700/50 hover:bg-red-600/30"
                    }`}
                  >
                    {editingStatus ? "Updating..." : isResigned ? "Set Active" : "Set Resigned"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="w-full px-3 py-2 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    + Add Staff
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════ */}
        {/* RIGHT PANEL (70%) - Split Top/Bottom */}
        {/* ═══════════════════════════════════════ */}
        <div className="flex flex-col gap-4 min-h-0">

          {/* ═══ SECTION B: COMPETENCY MATRIX (Top 50%) ═══ */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Competency Matrix</h4>
              <span className="text-[10px] text-slate-500 font-bold">{matrix.length} certificates</span>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {matrix.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No certifications found.</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-800">
                      <th className="text-left px-3 py-2 text-slate-400 font-bold uppercase tracking-wider">Cert Type</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-bold uppercase tracking-wider">Cert No</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-bold uppercase tracking-wider">Expiry</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((cert) => {
                      const st = certColor(cert.expiry_date);
                      return (
                        <tr key={cert.id} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="px-3 py-2 font-bold text-slate-200 uppercase">{cert.cert_type}</td>
                          <td className="px-3 py-2 text-slate-400">{cert.cert_no || "-"}</td>
                          <td className="px-3 py-2 text-slate-300 font-semibold">{fmtDate(cert.expiry_date)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black ${st.text} ${st.bg} border ${st.border}`}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ═══ SECTION C: MOVEMENT / ROSTER (Bottom 50%) ═══ */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Movement / Roster</h4>
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" /> MOB</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-600 inline-block" /> DEMOB</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-600/40 inline-block" /> ON BOARD</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <RosterGantt rosterRows={rosterRows} />
            </div>
          </div>

        </div>
      </div>

      {/* Add Staff Modal */}
      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
    </AppShell>
  );
}
