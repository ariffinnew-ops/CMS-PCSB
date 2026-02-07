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
import { getClients, getPostsForClient, getLocationsForClientPost } from "@/lib/client-location-map";

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

// ─── SEE DETAIL Overlay (covers Section B + C area) with inline editing ───
function DetailOverlay({ detail, onClose, canEdit, onSave }: { detail: Record<string, unknown>; onClose: () => void; canEdit: boolean; onSave: (fields: Record<string, string>) => Promise<void> }) {
  const d = detail;
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  const startEdit = () => {
    const form: Record<string, string> = {};
    const keys = ["crew_name", "nric_passport", "address", "phone", "email1", "email2", "post", "client", "location", "hire_date", "resign_date", "exp_date", "status", "nok_name", "nok_relation", "nok_phone"];
    for (const k of keys) form[k] = d[k] !== undefined && d[k] !== null ? String(d[k]) : "";
    setEditForm(form);
    setEditing(true);
  };

  const handleConfirmSave = async () => {
    setConfirmSave(false);
    setSaving(true);
    await onSave(editForm);
    setSaving(false);
    setEditing(false);
  };

  const set = (k: string, v: string) => setEditForm((p) => ({ ...p, [k]: v }));
  const inputCls = "w-full bg-accent border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-blue-500";

  const fields: { section: string; items: { label: string; key: string; fmt?: (v: unknown) => string; type?: string }[] }[] = [
    {
      section: "Personal & Contact",
      items: [
        { label: "Full Name", key: "crew_name" },
        { label: "NRIC / Passport Number", key: "nric_passport" },
        { label: "Address", key: "address" },
        { label: "Phone", key: "phone" },
        { label: "Email 1", key: "email1" },
        { label: "Email 2", key: "email2" },
      ],
    },
    {
      section: "Employment Info",
      items: [
        { label: "Client", key: "client" },
        { label: "Trade / Post", key: "post" },
        { label: "Location", key: "location" },
        { label: "Hire Date", key: "hire_date", fmt: (v) => fmtDate(v as string), type: "date" },
        { label: "Resign Date", key: "resign_date", fmt: (v) => fmtDate(v as string), type: "date" },
        { label: "Contract Expiry Date", key: "exp_date", fmt: (v) => fmtDate(v as string), type: "date" },
        { label: "Status", key: "status" },
      ],
    },
    {
      section: "Next of Kin (Emergency)",
      items: [
        { label: "NOK Name", key: "nok_name" },
        { label: "NOK Relation", key: "nok_relation" },
        { label: "NOK Phone", key: "nok_phone" },
      ],
    },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-background border border-border rounded-xl overflow-y-auto animate-in fade-in duration-200 shadow-xl">
      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-black uppercase tracking-wider text-foreground">Full Staff Details</h3>
          <div className="flex items-center gap-2">
            {canEdit && !editing && (
              <button type="button" onClick={startEdit} className="px-4 py-1.5 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500 transition-colors">
                Edit
              </button>
            )}
            {editing && (
              <>
                <button type="button" onClick={() => setEditing(false)} className="px-4 py-1.5 rounded-lg text-xs font-black uppercase bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">Cancel</button>
                <button type="button" onClick={() => setConfirmSave(true)} disabled={saving} className="px-4 py-1.5 rounded-lg text-xs font-black uppercase bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors">
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-black uppercase bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">Close</button>
          </div>
        </div>
        <div className="space-y-6">
          {fields.map((sec) => (
            <div key={sec.section}>
              <h4 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-3 border-b border-border pb-2">{sec.section}</h4>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                {sec.items.map((it) => {
                  const val = d[it.key];
                  const display = (val !== undefined && val !== null && val !== "") ? (it.fmt ? it.fmt(val) : String(val)) : "-";
                  return (
                    <div key={it.key}>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{it.label}</p>
                      {editing ? (
                        it.key === "status" ? (
                          <select value={editForm[it.key] || ""} onChange={(e) => set(it.key, e.target.value)} className={inputCls}>
                            <option>Active</option><option>On Notice</option><option>Resigned</option>
                          </select>
                        ) : it.key === "client" ? (
                          <select value={editForm[it.key] || ""} onChange={(e) => { set("client", e.target.value); set("post", ""); set("location", ""); }} className={inputCls}>
                            <option value="">-- Select --</option>
                            {getClients().map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        ) : it.key === "post" ? (
                          <select value={editForm[it.key] || ""} onChange={(e) => { set("post", e.target.value); set("location", ""); }} disabled={!editForm.client} className={inputCls}>
                            <option value="">-- Select --</option>
                            {getPostsForClient(editForm.client || "").map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        ) : it.key === "location" ? (
                          <select value={editForm[it.key] || ""} onChange={(e) => set("location", e.target.value)} disabled={!editForm.post} className={inputCls}>
                            <option value="">-- Select --</option>
                            {getLocationsForClientPost(editForm.client || "", editForm.post || "").map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        ) : (
                          <input
                            type={it.type || "text"}
                            value={it.type === "date" ? (editForm[it.key]?.split("T")[0] || "") : (editForm[it.key] || "")}
                            onChange={(e) => set(it.key, e.target.value)}
                            className={inputCls}
                          />
                        )
                      ) : (
                        <p className="text-sm font-semibold text-foreground">{display}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm Save Dialog */}
      {confirmSave && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-xl w-full max-w-sm shadow-2xl p-6 text-center">
            <h4 className="text-sm font-black uppercase tracking-wider text-foreground mb-3">Save Changes?</h4>
            <p className="text-xs text-muted-foreground mb-5">Are you sure you want to save the updated staff details?</p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={() => setConfirmSave(false)} className="px-5 py-2 rounded-lg text-xs font-black uppercase bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">No</button>
              <button type="button" onClick={handleConfirmSave} className="px-5 py-2 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500 transition-colors">Yes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Staff Overlay (covers Section B + C area) ───
function AddStaffOverlay({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState<Record<string, string>>({
    crew_name: "", nric_passport: "", address: "", phone: "", email1: "", email2: "",
    post: "", client: "", location: "", hire_date: "", resign_date: "", exp_date: "", status: "Active",
    nok_name: "", nok_relation: "", nok_phone: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const handleSave = async () => {
    if (!form.crew_name.trim()) return;
    setSaving(true);
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) { if (v.trim()) payload[k] = v.trim(); }
    const res = await createCrewMember(payload);
    setSaving(false);
    if (res.success && res.id) onCreated(res.id);
    else alert(res.error || "Failed to create");
  };

  const inputCls = "w-full bg-accent border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-blue-500";
  const labelCls = "text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5";

  return (
    <div className="absolute inset-0 z-50 bg-background border border-border rounded-xl overflow-y-auto animate-in fade-in duration-200 shadow-xl flex flex-col">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
        <h3 className="text-base font-black uppercase tracking-wider text-foreground">Add New Staff</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-black uppercase bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || !form.crew_name.trim()} className="px-5 py-1.5 rounded-lg text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors">
            {saving ? "Saving..." : "Create Staff"}
          </button>
        </div>
      </div>
      <div className="px-5 py-5 space-y-6 flex-1 overflow-y-auto">
        {/* Personal & Contact */}
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-3 border-b border-border pb-2">Personal & Contact</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <div><label className={labelCls}>Full Name *</label><input value={form.crew_name} onChange={(e) => set("crew_name", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>NRIC / Passport Number</label><input value={form.nric_passport} onChange={(e) => set("nric_passport", e.target.value)} className={inputCls} /></div>
            <div className="col-span-2 lg:col-span-3"><label className={labelCls}>Address</label><input value={form.address} onChange={(e) => set("address", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Phone</label><input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Email 1</label><input value={form.email1} onChange={(e) => set("email1", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Email 2</label><input value={form.email2} onChange={(e) => set("email2", e.target.value)} className={inputCls} /></div>
          </div>
        </div>
        {/* Employment Info */}
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-3 border-b border-border pb-2">Employment Info</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <div><label className={labelCls}>Client</label>
              <select value={form.client} onChange={(e) => { set("client", e.target.value); set("post", ""); set("location", ""); }} className={inputCls}>
                <option value="">-- Select --</option>
                {getClients().map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Trade / Post</label>
              <select value={form.post} onChange={(e) => { set("post", e.target.value); set("location", ""); }} disabled={!form.client} className={inputCls}>
                <option value="">-- Select --</option>
                {getPostsForClient(form.client).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Location</label>
              <select value={form.location} onChange={(e) => set("location", e.target.value)} disabled={!form.post} className={inputCls}>
                <option value="">-- Select --</option>
                {getLocationsForClientPost(form.client, form.post).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                <option>Active</option><option>On Notice</option><option>Resigned</option>
              </select>
            </div>
            <div><label className={labelCls}>Hire Date</label><input type="date" value={form.hire_date} onChange={(e) => set("hire_date", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Resign Date</label><input type="date" value={form.resign_date} onChange={(e) => set("resign_date", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Contract Expiry Date</label><input type="date" value={form.exp_date} onChange={(e) => set("exp_date", e.target.value)} className={inputCls} /></div>
          </div>
        </div>
        {/* Next of Kin */}
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-3 border-b border-border pb-2">Next of Kin (Emergency)</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <div><label className={labelCls}>NOK Name</label><input value={form.nok_name} onChange={(e) => set("nok_name", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>NOK Relation</label><input value={form.nok_relation} onChange={(e) => set("nok_relation", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>NOK Phone</label><input value={form.nok_phone} onChange={(e) => set("nok_phone", e.target.value)} className={inputCls} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// ─── MAIN PAGE ───
// ════════════════════════════════════��══
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

  // Save edited detail fields (from DetailOverlay)
  const handleDetailSave = async (fields: Record<string, string>) => {
    if (!selectedId) return;
    const payload: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      payload[k] = v.trim() || null;
    }
    const res = await updateCrewDetail(selectedId, payload);
    if (res.success) {
      await loadDetail(selectedId);
      // Refresh list in case name/post/client/location changed
      const listRes = await getCrewList();
      if (listRes.success && listRes.data) setCrewList(listRes.data);
    }
  };

  // Profile picture upload
  const handleProfilePicUpload = async (file: File) => {
    if (!selectedId || !file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Max 2MB for profile picture"); return; }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "png"].includes(ext || "")) { alert("Only JPG/PNG"); return; }
    setUploading(true);
    const supabase = createClient();
    const path = `profiles/${selectedId}.${ext}`;
    // Upsert: overwrite if exists
    const { error } = await supabase.storage.from("pcsb-doc").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) alert(error.message);
    else {
      // Get public URL and store in detail
      const { data: urlData } = supabase.storage.from("pcsb-doc").getPublicUrl(path);
      if (urlData?.publicUrl) {
        await updateCrewDetail(selectedId, { profile_pic: urlData.publicUrl });
        setDetail((prev) => prev ? { ...prev, profile_pic: urlData.publicUrl } : prev);
      }
    }
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
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
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
      <div className="grid grid-cols-1 lg:grid-cols-[30%_1fr] gap-3 h-[calc(100vh-120px)] animate-in fade-in duration-500">

        {/* ═══ SECTION A: PROFILE SIDEBAR (30%) ═══ */}
        <div className="bg-background border border-border rounded-xl overflow-hidden flex flex-col h-full">

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
                      className="w-full text-left px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors border-b border-border last:border-0"
                    >
                      {c.crew_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {d && (
            <>
              {/* Avatar + Status */}
              <div className="flex flex-col items-center pt-3 pb-2 px-4 shrink-0">
                {/* Profile avatar with hover upload */}
                <div className="relative group">
                  <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center shadow-md border-2 border-slate-300 overflow-hidden">
                    {d.profile_pic ? (
                      <img src={String(d.profile_pic)} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-slate-400">
                        <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" fill="currentColor" />
                      </svg>
                    )}
                  </div>
                  {/* Hover overlay for L1/L2 */}
                  {isL1L2 && (
                    <label className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                        <path d="M12 16a4 4 0 100-8 4 4 0 000 8z" fill="currentColor" />
                        <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9z" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                      <input
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleProfilePicUpload(f); e.target.value = ""; }}
                      />
                    </label>
                  )}
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
              <div className="px-4 py-2 space-y-2 shrink-0">
                <div className="text-center">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Assignment / Location</p>
                  <p className="text-sm font-semibold text-foreground">{String(d.client || "-")} / {String(d.location || "-")}</p>
                </div>

                {/* Dynamic Contract Status */}
                <div className="text-center">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Contract Status</p>
                  {d.exp_date ? (
                    <div className="mt-1">
                      <p className="text-xs font-semibold text-foreground">{fmtDate(String(d.exp_date))}</p>
                      {expDays !== null && expDays >= 0 ? (
                        <div className={`mt-1 px-2.5 py-1 rounded-md inline-block ${
                          expDays < 90 ? "bg-red-100 border border-red-200" : expDays < 180 ? "bg-amber-100 border border-amber-200" : "bg-emerald-100 border border-emerald-200"
                        }`}>
                          <span className={`text-[10px] font-black uppercase ${
                            expDays < 90 ? "text-red-600" : expDays < 180 ? "text-amber-600" : "text-emerald-600"
                          }`}>
                            {expDays} days remaining
                          </span>
                        </div>
                      ) : expDays !== null && expDays < 0 ? (
                        <div className="mt-1 px-2.5 py-1 bg-red-100 border border-red-200 rounded-md inline-block">
                          <span className="text-[10px] font-black text-red-600 uppercase">Expired ({Math.abs(expDays)} days ago)</span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic mt-0.5">Not set</p>
                  )}
                </div>

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
              <div className="p-2 border-t border-border space-y-1.5 shrink-0 mt-auto">
                <button
                  type="button"
                  onClick={() => setShowDetailOverlay(true)}
                  className="w-full px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                >
                  See Detail
                </button>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => isL1L2 && setShowStatusDialog(true)}
                    disabled={!isL1L2}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase transition-colors border ${
                      isL1L2 ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    }`}
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    onClick={() => isL1L2 && setShowAdd(true)}
                    disabled={!isL1L2}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase transition-colors border ${
                      isL1L2 ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    }`}
                  >
                    + Add Staff
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ═══ RIGHT PANEL (70%) - Section B + C ═══ */}
        <div className="flex flex-col gap-3 min-h-0 relative">

          {/* Detail Overlay (covers B+C) */}
          {showDetailOverlay && detail && (
            <DetailOverlay detail={detail} onClose={() => setShowDetailOverlay(false)} canEdit={isL1L2} onSave={handleDetailSave} />
          )}

          {/* Add Staff Overlay (covers B+C) */}
          {showAdd && (
            <AddStaffOverlay onClose={() => setShowAdd(false)} onCreated={handleCreated} />
          )}

          {/* ═══ SECTION B: CERTIFICATES (Top - auto fit, no scroll) ═══ */}
          <div className="bg-background border border-border rounded-xl shrink-0 flex flex-col overflow-hidden">
            <div className="px-4 py-1.5 border-b border-border flex items-center justify-between shrink-0">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-foreground">Certification List</h4>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground font-bold">{matrix.length} certs</span>
                <label className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase cursor-pointer transition-colors ${
                  isL1L2 ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}>
                  {uploading ? "..." : "Upload Doc"}
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
            <div className="p-2">
              {matrix.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No certifications found.</p>
              ) : (
                <div className="grid grid-cols-6 gap-1">
                  {matrix.map((cert) => {
                    const st = certStatus(cert.expiry_date);
                    return (
                      <div key={cert.id} className="flex flex-col px-1.5 py-1 rounded-md border border-border bg-accent/30 hover:bg-accent/60 transition-colors min-w-0">
                        <p className="text-[9px] font-bold text-foreground uppercase truncate leading-tight">{cert.cert_type}</p>
                        <div className="flex items-center justify-between gap-0.5 mt-0.5">
                          <p className="text-[8px] text-muted-foreground truncate">{fmtDate(cert.expiry_date)}</p>
                          <span className={`px-1 py-px rounded-full text-[7px] font-black border shrink-0 ${st.cls}`}>
                            {st.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ═══ SECTION C: MOVEMENT GRID (Bottom - fill remaining) ═══ */}
          <div className="bg-background border border-border rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 py-1.5 border-b border-border flex items-center justify-between shrink-0">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-foreground">Movement Grid</h4>
              <div className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm bg-blue-500 inline-block" /> On Board</span>
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

    </AppShell>
  );
}
