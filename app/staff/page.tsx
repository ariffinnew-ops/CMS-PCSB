"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppShell } from "@/components/app-shell";
import { getUser, ROLE_LEVELS, type AuthUser } from "@/lib/auth";
import {
  getCrewList,
  getCrewDetail,
  getCrewMatrix,
  getCrewRoster,
  updateCrewDetail,
  createCrewMember,
  listCrewDocuments,
} from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";

// ─── Types ───
interface CrewListItem { id: string; crew_name: string; post: string; client: string; location: string; status?: string }
interface MatrixRow { id: string; cert_type: string; cert_no: string | null; expiry_date: string | null; attended_date: string | null; plan_date: string | null }
interface DocItem { name: string; size: number; created_at: string }

// ─── Helpers ───
function roleLevel(u: AuthUser | null): number { return u ? (ROLE_LEVELS[u.role] ?? 99) : 99; }
function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return String(d); }
}
function fmtRM(v: unknown): string {
  const n = Number(v);
  if (!v || isNaN(n)) return "-";
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function certStatus(expiry: string | null): { label: string; cls: string } {
  if (!expiry) return { label: "N/A", cls: "bg-slate-100 text-slate-400 border-slate-200" };
  const diff = (new Date(expiry).getTime() - Date.now()) / 86400000;
  if (diff < 0) return { label: "EXPIRED", cls: "bg-red-50 text-red-600 border-red-200" };
  if (diff < 90) return { label: "EXPIRING", cls: "bg-amber-50 text-amber-600 border-amber-200" };
  return { label: "VALID", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" };
}
function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

// ─── Roster Strip (Section C) ───
function RosterStrip({ rosterRows }: { rosterRows: Record<string, unknown>[] }) {
  const entries = useMemo(() => {
    const result: { date: Date; type: "M" | "D" }[] = [];
    for (const row of rosterRows) {
      for (let i = 1; i <= 24; i++) {
        const mVal = row[`m${i}`] as string | null;
        const dVal = row[`d${i}`] as string | null;
        if (mVal) try { result.push({ date: new Date(mVal), type: "M" }); } catch {/* */}
        if (dVal) try { result.push({ date: new Date(dVal), type: "D" }); } catch {/* */}
      }
    }
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return result;
  }, [rosterRows]);

  const months = useMemo(() => {
    if (entries.length === 0) return [];
    const monthSet = new Map<string, { year: number; month: number }>();
    for (const e of entries) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}`;
      if (!monthSet.has(key)) monthSet.set(key, { year: e.date.getFullYear(), month: e.date.getMonth() });
    }
    return Array.from(monthSet.values()).sort((a, b) => a.year - b.year || a.month - b.month);
  }, [entries]);

  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  if (months.length === 0) return <p className="text-xs text-muted-foreground italic p-2">No roster data available.</p>;

  return (
    <div className="overflow-auto max-h-full">
      <table className="w-full border-collapse" style={{ fontSize: "10px" }}>
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-100">
            <th className="px-2 py-1 text-left font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-100 min-w-[72px] border-b border-r border-slate-200">Month</th>
            {Array.from({ length: 31 }, (_, i) => (
              <th key={i} className="px-0 py-1 text-center font-bold text-slate-400 min-w-[20px] border-b border-r border-slate-200">{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map(({ year, month }, mi) => {
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthEntries = entries.filter(e => e.date.getFullYear() === year && e.date.getMonth() === month);
            const dayMap = new Map<number, "M" | "D" | "W">();
            for (const e of monthEntries) dayMap.set(e.date.getDate(), e.type);
            let working = false;
            for (let day = 1; day <= daysInMonth; day++) {
              const ev = monthEntries.find(e => e.date.getDate() === day);
              if (ev?.type === "M") working = true;
              if (working && !dayMap.has(day)) dayMap.set(day, "W");
              if (ev?.type === "D") working = false;
            }
            return (
              <tr key={`${year}-${month}`} className={mi > 0 ? "border-t-4 border-slate-200" : ""}>
                <td className="px-2 py-1 font-bold text-slate-600 sticky left-0 bg-white border-b border-r border-slate-200 whitespace-nowrap">
                  {MO[month]} {year}
                </td>
                {Array.from({ length: 31 }, (_, i) => {
                  const day = i + 1;
                  if (day > daysInMonth) return <td key={day} className="bg-slate-50 border-b border-r border-slate-100" />;
                  const ev = dayMap.get(day);
                  let bg = "bg-white";
                  if (ev === "M" || ev === "D" || ev === "W") bg = "bg-blue-500";
                  return (
                    <td key={day} className={`${bg} border-b border-r border-slate-200`} style={{ height: "18px" }} />
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

// ─── Change Status Dialog ───
function ChangeStatusDialog({ currentStatus, onSave, onClose }: { currentStatus: string; onSave: (s: string) => void; onClose: () => void }) {
  const [selected, setSelected] = useState(currentStatus);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl w-full max-w-sm shadow-2xl">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Change Status</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg font-bold">&times;</button>
        </div>
        <div className="px-5 py-5 space-y-3">
          {["Active", "On Notice", "Resigned"].map((s) => (
            <label key={s} className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${selected === s ? "border-blue-500 bg-blue-50" : "border-border hover:bg-accent"}`}>
              <input type="radio" name="status" checked={selected === s} onChange={() => setSelected(s)} className="accent-blue-600" />
              <span className="text-sm font-bold text-foreground">{s}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="button" onClick={() => onSave(selected)} className="px-5 py-2 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500">Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── SEE DETAIL Overlay (covers Section B + C area) ───
function DetailOverlay({ detail, onClose }: { detail: Record<string, unknown>; onClose: () => void }) {
  const d = detail;
  const fields: { section: string; items: { label: string; key: string; fmt?: (v: unknown) => string }[] }[] = [
    {
      section: "Personal Information",
      items: [
        { label: "Full Name", key: "crew_name" },
        { label: "IC Number", key: "ic_no" },
        { label: "Passport No", key: "passport_no" },
        { label: "Passport Expiry", key: "passport_exp", fmt: (v) => fmtDate(v as string) },
        { label: "Date of Birth", key: "dob", fmt: (v) => fmtDate(v as string) },
        { label: "Nationality", key: "nationality" },
        { label: "Race", key: "race" },
        { label: "Religion", key: "religion" },
        { label: "Gender", key: "gender" },
      ],
    },
    {
      section: "Contact Information",
      items: [
        { label: "Phone", key: "phone" },
        { label: "Email 1", key: "email1" },
        { label: "Email 2", key: "email2" },
        { label: "Address", key: "address" },
      ],
    },
    {
      section: "Employment",
      items: [
        { label: "Trade / Post", key: "post" },
        { label: "Client", key: "client" },
        { label: "Location", key: "location" },
        { label: "Status", key: "status" },
        { label: "Hire Date", key: "hire_date", fmt: (v) => fmtDate(v as string) },
        { label: "Contract Expiry", key: "exp_date", fmt: (v) => fmtDate(v as string) },
        { label: "Roles EM", key: "roles_em" },
      ],
    },
    {
      section: "Next of Kin",
      items: [
        { label: "NOK Name", key: "nok_name" },
        { label: "NOK Relation", key: "nok_relation" },
        { label: "NOK Phone", key: "nok_phone" },
      ],
    },
    {
      section: "Financials (Restricted)",
      items: [
        { label: "Basic Salary", key: "basic", fmt: (v) => fmtRM(v) },
        { label: "OA Rate", key: "oa_rate", fmt: (v) => fmtRM(v) },
        { label: "Fixed Allowance", key: "fixed_all", fmt: (v) => fmtRM(v) },
        { label: "Bank Name", key: "bank_name" },
        { label: "Bank Account", key: "bank_acc" },
        { label: "EPF No", key: "epf_no" },
        { label: "SOCSO No", key: "socso_no" },
        { label: "Tax No", key: "tax_no" },
      ],
    },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm rounded-xl overflow-y-auto animate-in fade-in duration-200">
      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-black uppercase tracking-wider text-foreground">Full Staff Details</h3>
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-black uppercase bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">Close</button>
        </div>
        <div className="space-y-6">
          {fields.map((sec) => {
            const hasData = sec.items.some((it) => d[it.key] !== undefined && d[it.key] !== null && d[it.key] !== "");
            if (!hasData) return null;
            return (
              <div key={sec.section}>
                <h4 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-3 border-b border-border pb-2">{sec.section}</h4>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
                  {sec.items.map((it) => {
                    const val = d[it.key];
                    if (val === undefined || val === null || val === "") return null;
                    return (
                      <div key={it.key}>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{it.label}</p>
                        <p className="text-sm font-semibold text-foreground">{it.fmt ? it.fmt(val) : String(val)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Add New Staff</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg font-bold">&times;</button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Full Name *</label>
            <input value={form.crew_name} onChange={(e) => set("crew_name", e.target.value)} className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Trade</label>
              <select value={form.post} onChange={(e) => set("post", e.target.value)} className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
                <option>OM</option><option>EM</option><option>OHN</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Client</label>
              <select value={form.client} onChange={(e) => set("client", e.target.value)} className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
                <option>SBA</option><option>SKA</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Location</label>
            <input value={form.location} onChange={(e) => set("location", e.target.value)} className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || !form.crew_name.trim()} className="px-5 py-2 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40">
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
  const [showAutoComplete, setShowAutoComplete] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showDetailOverlay, setShowDetailOverlay] = useState(false);
  const [uploading, setUploading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const lvl = roleLevel(user);
  const isL1L2 = lvl <= 2;

  // Close autocomplete on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowAutoComplete(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  useEffect(() => { if (selectedId) { setShowDetailOverlay(false); loadDetail(selectedId); } }, [selectedId, loadDetail]);

  // Filtered crew
  const filteredCrew = useMemo(() => {
    if (!search.trim()) return crewList;
    const q = search.toLowerCase();
    return crewList.filter((c) => c.crew_name.toLowerCase().includes(q) || c.post.toLowerCase().includes(q));
  }, [crewList, search]);

  // Contract expiry
  const expDays = daysUntil(detail?.exp_date as string | null);

  // Status change
  const handleStatusSave = async (newStatus: string) => {
    if (!selectedId) return;
    setShowStatusDialog(false);
    const res = await updateCrewDetail(selectedId, { status: newStatus });
    if (res.success) {
      setDetail((prev) => prev ? { ...prev, status: newStatus } : prev);
      setCrewList((prev) => prev.map((c) => c.id === selectedId ? { ...c, status: newStatus } : c));
    }
  };

  // Upload Doc
  const handleUpload = async (file: File) => {
    if (!selectedId || !file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Max 5MB"); return; }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext || "")) { alert("Only PDF/JPG/PNG"); return; }
    setUploading(true);
    const supabase = createClient();
    const path = `${selectedId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("pcsb-doc").upload(path, file);
    setUploading(false);
    if (error) alert(error.message);
    else alert("Uploaded successfully!");
  };

  // Add staff
  const handleCreated = (id: string) => {
    setShowAdd(false);
    getCrewList().then((res) => {
      if (res.success && res.data) { setCrewList(res.data); setSelectedId(id); }
    });
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
        </div>
      </AppShell>
    );
  }

  const d = detail;
  const statusVal = String(d?.status || "Active");
  const statusColor = statusVal === "Resigned" ? "bg-red-100 text-red-700 border-red-200" : statusVal === "On Notice" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-emerald-100 text-emerald-700 border-emerald-200";

  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-[30%_1fr] gap-3 h-[calc(100vh-80px)] animate-in fade-in duration-500">

        {/* ═══ SECTION A: PROFILE SIDEBAR (30%) ═══ */}
        <div className="bg-background border border-border rounded-xl overflow-y-auto flex flex-col">

          {/* Search + Autocomplete */}
          <div className="p-3 border-b border-border" ref={searchRef}>
            <div className="relative">
              <input
                type="text"
                placeholder="Search staff..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowAutoComplete(true); }}
                onFocus={() => setShowAutoComplete(true)}
                className="w-full bg-gray-200 rounded-lg px-3 py-2 text-sm text-black font-semibold outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
              />
              {/* Autocomplete list */}
              {showAutoComplete && search.trim() && filteredCrew.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto z-50">
                  {filteredCrew.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setSelectedId(c.id); setSearch(""); setShowAutoComplete(false); }}
                      className="w-full text-left px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors border-b border-border last:border-0"
                    >
                      {c.crew_name} <span className="text-muted-foreground font-normal">- {c.post}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {d && (
            <>
              {/* Avatar + Status */}
              <div className="flex flex-col items-center pt-5 pb-3 px-4">
                {/* Silhouette avatar */}
                <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center shadow-md border-2 border-slate-300 overflow-hidden">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-slate-400">
                    <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" fill="currentColor" />
                  </svg>
                </div>
                <span className={`mt-2.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusColor}`}>
                  {statusVal}
                </span>
              </div>

              {/* Name & Trade */}
              <div className="px-4 pb-2 text-center">
                <h3 className="text-base font-black text-foreground uppercase leading-tight">{String(d.crew_name || "-")}</h3>
                <p className="text-sm font-bold text-blue-600 mt-0.5">{String(d.post || "-")}</p>
              </div>

              <div className="border-t border-border mx-4" />

              {/* Compact Core Info */}
              <div className="px-4 py-3 space-y-2.5 flex-1">
                <div>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Assignment</p>
                  <p className="text-sm font-semibold text-foreground">{String(d.client || "-")} / {String(d.location || "-")}</p>
                </div>

                {/* Contract Expiry */}
                {d.exp_date && (
                  <div>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Contract Expiry</p>
                    <p className="text-sm font-semibold text-foreground">{fmtDate(String(d.exp_date))}</p>
                    {expDays !== null && expDays >= 0 && expDays < 90 && (
                      <div className="mt-1 px-2 py-0.5 bg-red-100 border border-red-200 rounded-md inline-block">
                        <span className="text-[10px] font-black text-red-600 uppercase">Expiring in {expDays} days</span>
                      </div>
                    )}
                    {expDays !== null && expDays < 0 && (
                      <div className="mt-1 px-2 py-0.5 bg-red-100 border border-red-200 rounded-md inline-block">
                        <span className="text-[10px] font-black text-red-600 uppercase">Expired</span>
                      </div>
                    )}
                  </div>
                )}

                {d.phone && (
                  <div>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Phone</p>
                    <p className="text-xs font-semibold text-foreground">{String(d.phone)}</p>
                  </div>
                )}
                {d.email1 && (
                  <div>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Email</p>
                    <p className="text-xs font-semibold text-foreground break-all">{String(d.email1)}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-3 border-t border-border space-y-2">
                <button
                  type="button"
                  onClick={() => isL1L2 && setShowStatusDialog(true)}
                  disabled={!isL1L2}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-black uppercase transition-colors border ${
                    isL1L2 ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  }`}
                >
                  Change Status
                </button>
                <button
                  type="button"
                  onClick={() => setShowDetailOverlay(true)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                >
                  See Detail
                </button>
                <button
                  type="button"
                  onClick={() => isL1L2 && setShowAdd(true)}
                  disabled={!isL1L2}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-black uppercase transition-colors border ${
                    isL1L2 ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  }`}
                >
                  + Add Staff
                </button>
              </div>
            </>
          )}
        </div>

        {/* ═══ RIGHT PANEL (70%) - Section B + C ═══ */}
        <div className="flex flex-col gap-3 min-h-0 relative">

          {/* Detail Overlay (covers B+C) */}
          {showDetailOverlay && detail && (
            <DetailOverlay detail={detail} onClose={() => setShowDetailOverlay(false)} />
          )}

          {/* ═══ SECTION B: CERTIFICATES (Top) ═══ */}
          <div className="bg-background border border-border rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Certification List</h4>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-bold">{matrix.length} certs</span>
                {/* Upload Doc */}
                <label className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-colors ${
                  isL1L2 ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}>
                  {uploading ? "Uploading..." : "Upload Doc"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={!isL1L2 || uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
                  />
                </label>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {matrix.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No certifications found.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {matrix.map((cert) => {
                    const st = certStatus(cert.expiry_date);
                    return (
                      <div key={cert.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-accent/30 hover:bg-accent/60 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-foreground uppercase">{cert.cert_type}</p>
                          <p className="text-[10px] text-muted-foreground">Exp: {fmtDate(cert.expiry_date)}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ═══ SECTION C: MOVEMENT GRID (Bottom) ═══ */}
          <div className="bg-background border border-border rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Movement Grid</h4>
              <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-blue-500 inline-block" /> On Board</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <RosterStrip rosterRows={rosterRows} />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showStatusDialog && detail && (
        <ChangeStatusDialog currentStatus={statusVal} onSave={handleStatusSave} onClose={() => setShowStatusDialog(false)} />
      )}
      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
    </AppShell>
  );
}
