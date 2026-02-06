"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { getUser, type AuthUser } from "@/lib/auth";
import {
  getCrewList,
  getCrewDetail,
  updateCrewDetail,
  getCrewMatrix,
  getCrewRoster,
  listCrewDocuments,
  deleteCrewDocument,
} from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

interface DocFile {
  name: string;
  size: number;
  created_at: string;
}

// ─── Helpers ───
function roleLevel(user: AuthUser | null): number {
  if (!user) return 3;
  if (user.role === "admin") return 1;
  if (user.role === "datalogger") return 2;
  return 3;
}

function formatCurrency(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return "-";
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function certStatus(expiry: string | null): { label: string; color: string } {
  if (!expiry) return { label: "N/A", color: "bg-slate-100 text-slate-500" };
  const now = new Date();
  const exp = new Date(expiry);
  const diffMs = exp.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return { label: "Expired", color: "bg-red-100 text-red-700" };
  if (diffDays < 90) return { label: "Expiring", color: "bg-amber-100 text-amber-700" };
  return { label: "Valid", color: "bg-emerald-100 text-emerald-700" };
}

function fileIcon(name: string): string {
  if (name.match(/\.pdf$/i)) return "PDF";
  if (name.match(/\.(jpg|jpeg|png)$/i)) return "IMG";
  return "DOC";
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Movement Timeline extraction ───
function extractMovements(rosterRows: Record<string, unknown>[]): { date: string; type: string; location: string }[] {
  const moves: { date: string; type: string; location: string }[] = [];
  for (const row of rosterRows) {
    const location = String(row.location || "");
    for (let i = 1; i <= 20; i++) {
      const mKey = `m${i}`;
      const dKey = `d${i}`;
      const mVal = row[mKey] as string | null;
      const dVal = row[dKey] as string | null;
      if (mVal) moves.push({ date: mVal, type: "Mobilize", location });
      if (dVal) moves.push({ date: dVal, type: "Demobilize", location });
    }
  }
  moves.sort((a, b) => b.date.localeCompare(a.date));
  return moves;
}

// ─── Main Page ───
export default function StaffDetailPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [crewList, setCrewList] = useState<CrewListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [rosterRows, setRosterRows] = useState<Record<string, unknown>[]>([]);
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("personal");

  const lvl = roleLevel(user);
  const canEdit = lvl <= 2; // L1 or L2

  // Load user + crew list
  useEffect(() => {
    const u = getUser();
    setUser(u);
    getCrewList().then((res) => {
      if (res.success && res.data) {
        setCrewList(res.data);
        if (res.data.length > 0) setSelectedId(res.data[0].id);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  // Load detail when selectedId changes
  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    const [detRes, matRes, docRes] = await Promise.all([
      getCrewDetail(id),
      getCrewMatrix(id),
      listCrewDocuments(id),
    ]);
    if (detRes.success && detRes.data) {
      setDetail(detRes.data);
      // Also load roster by crew_name
      const name = String(detRes.data.crew_name || "");
      if (name) {
        const rosRes = await getCrewRoster(name);
        setRosterRows(rosRes.success && rosRes.data ? rosRes.data : []);
      }
    }
    if (matRes.success && matRes.data) setMatrix(matRes.data);
    if (docRes.success && docRes.data) setDocs(docRes.data);
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Filtered crew list for search
  const filteredCrew = useMemo(() => {
    if (!search) return crewList;
    const q = search.toLowerCase();
    return crewList.filter((c) => c.crew_name.toLowerCase().includes(q));
  }, [crewList, search]);

  // Movement timeline
  const movements = useMemo(() => extractMovements(rosterRows), [rosterRows]);

  // Status change handler
  const handleStatusChange = async (newStatus: string) => {
    if (!detail || !selectedId) return;
    if (newStatus === "Resigned") {
      const resignDate = prompt("Enter resign date (YYYY-MM-DD):");
      if (!resignDate) return;
      setStatusSaving(true);
      const res = await updateCrewDetail(selectedId, { status: newStatus, resign_date: resignDate });
      setStatusSaving(false);
      if (res.success) {
        setDetail({ ...detail, status: newStatus, resign_date: resignDate });
        showNotification("success", "Status updated to Resigned.");
      } else {
        showNotification("error", res.error || "Failed to update status.");
      }
    } else {
      setStatusSaving(true);
      const res = await updateCrewDetail(selectedId, { status: newStatus });
      setStatusSaving(false);
      if (res.success) {
        setDetail({ ...detail, status: newStatus });
        showNotification("success", `Status updated to ${newStatus}.`);
      } else {
        showNotification("error", res.error || "Failed to update status.");
      }
    }
  };

  // Edit mode
  const startEdit = () => {
    if (!detail) return;
    setEditFields({
      passport_no: String(detail.passport_no || ""),
      clean_name: String(detail.clean_name || ""),
      address: String(detail.address || ""),
      phone: String(detail.phone || ""),
      email1: String(detail.email1 || ""),
      email2: String(detail.email2 || ""),
      hire_date: String(detail.hire_date || ""),
      nok_name: String(detail.nok_name || ""),
      nok_relation: String(detail.nok_relation || ""),
      nok_phone: String(detail.nok_phone || ""),
      basic: String(detail.basic || ""),
      fixed_all: String(detail.fixed_all || ""),
      oa_rate: String(detail.oa_rate || ""),
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditFields({});
  };

  const saveEdit = async () => {
    if (!selectedId) return;
    setSaving(true);
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(editFields)) {
      if (["basic", "fixed_all", "oa_rate"].includes(k)) {
        updates[k] = v ? parseFloat(v) : null;
      } else {
        updates[k] = v || null;
      }
    }
    const res = await updateCrewDetail(selectedId, updates);
    setSaving(false);
    if (res.success) {
      setEditing(false);
      loadDetail(selectedId);
      showNotification("success", "Personal info updated.");
    } else {
      showNotification("error", res.error || "Failed to save.");
    }
  };

  // File upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    // Validate
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (file.size > maxSize) {
      showNotification("error", "File size must be under 5MB.");
      return;
    }
    if (!allowed.includes(file.type)) {
      showNotification("error", "Only PDF, JPG, PNG files are allowed.");
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const path = `${selectedId}/${file.name}`;
    const { error } = await supabase.storage.from("pcsb-doc").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      showNotification("error", error.message);
    } else {
      showNotification("success", `${file.name} uploaded.`);
      const res = await listCrewDocuments(selectedId);
      if (res.success && res.data) setDocs(res.data);
    }
    e.target.value = "";
  };

  // File delete
  const handleDelete = async (fileName: string) => {
    if (!selectedId || !confirm(`Delete ${fileName}?`)) return;
    const res = await deleteCrewDocument(selectedId, fileName);
    if (res.success) {
      setDocs((prev) => prev.filter((f) => f.name !== fileName));
      showNotification("success", `${fileName} deleted.`);
    } else {
      showNotification("error", res.error || "Failed to delete.");
    }
  };

  // File download
  const handleDownload = async (fileName: string) => {
    if (!selectedId) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("pcsb-doc").download(`${selectedId}/${fileName}`);
    if (error || !data) {
      showNotification("error", "Download failed.");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showNotification = (type: "success" | "error", msg: string) => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 3000);
  };

  const selectedCrew = crewList.find((c) => c.id === selectedId);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4 animate-in fade-in duration-500">
        {/* Notification */}
        {notification && (
          <div className={`fixed top-16 right-4 z-[100] px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg animate-in slide-in-from-right-5 duration-300 ${
            notification.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}>
            {notification.msg}
          </div>
        )}

        {/* Top bar: Staff selector + search */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Staff Profile</h2>
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Search staff..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-200 border border-slate-400 text-slate-900 rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold outline-none w-48 placeholder:text-slate-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-red-500 hover:bg-red-400 rounded p-0.5 transition-all"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="bg-slate-200 border border-slate-400 text-slate-900 rounded-lg px-3 py-1.5 text-xs font-bold outline-none cursor-pointer max-w-[320px]"
            >
              {filteredCrew.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.crew_name} ({c.client} - {c.post})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Header Card */}
        {detail && (
          <Card className="border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 h-20" />
            <CardContent className="relative px-6 pb-5 pt-0">
              <div className="flex flex-col md:flex-row md:items-end gap-4 -mt-10">
                {/* Avatar */}
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl border-4 border-card flex items-center justify-center text-3xl font-black text-white shadow-lg shrink-0">
                  {String(detail.crew_name || "").charAt(0)}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 pt-2">
                  <h3 className="text-xl font-black text-foreground uppercase truncate">{String(detail.crew_name || "-")}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    <span className="text-sm font-bold text-blue-600">{String(detail.post || "-")}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{String(detail.location || "-")}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      String(detail.client) === "SKA" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                    }`}>{String(detail.client || "-")}</span>
                  </div>
                </div>
                {/* Status Dropdown (L1/L2 only) */}
                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Status</label>
                    <select
                      value={String(detail.status || "Active")}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      disabled={statusSaving}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold outline-none cursor-pointer border ${
                        String(detail.status) === "Resigned"
                          ? "bg-red-100 border-red-300 text-red-700"
                          : String(detail.status) === "On Notice"
                          ? "bg-amber-100 border-amber-300 text-amber-700"
                          : "bg-emerald-100 border-emerald-300 text-emerald-700"
                      } ${statusSaving ? "opacity-50" : ""}`}
                    >
                      <option value="Active">Active</option>
                      <option value="On Notice">On Notice</option>
                      <option value="Resigned">Resigned</option>
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        {detail && (
          <div className="space-y-4">
            {/* Tab buttons */}
            <div className="flex gap-1 bg-slate-200 border border-slate-300 rounded-lg p-1 w-fit">
              {lvl <= 2 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("personal")}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${activeTab === "personal" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Personal Info
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab("training")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${activeTab === "training" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                Training Matrix
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("movement")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${activeTab === "movement" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                Movement History
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("documents")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${activeTab === "documents" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                Documents
              </button>
            </div>

            {/* ─── TAB 1: Personal Info (L1/L2 only) ─── */}
            {lvl <= 2 && activeTab === "personal" && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Personal Information</h4>
                    {canEdit && !editing && (
                      <Button variant="outline" size="sm" onClick={startEdit} className="text-xs font-bold">
                        <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        Edit
                      </Button>
                    )}
                    {editing && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelEdit} className="text-xs font-bold">Cancel</Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving} className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">
                          {saving ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* A. Identity */}
                    <FieldGroup title="Identity">
                      <FieldRow label="Passport No" value={detail.passport_no} field="passport_no" editing={editing} editFields={editFields} setEditFields={setEditFields} />
                      <FieldRow label="Clean Name" value={detail.clean_name} field="clean_name" editing={editing} editFields={editFields} setEditFields={setEditFields} />
                      <FieldRow label="Address" value={detail.address} field="address" editing={editing} editFields={editFields} setEditFields={setEditFields} wide />
                    </FieldGroup>
                    {/* B. Contacts */}
                    <FieldGroup title="Contacts">
                      <FieldRow label="Phone" value={detail.phone} field="phone" editing={editing} editFields={editFields} setEditFields={setEditFields} />
                      <FieldRow label="Email 1" value={detail.email1} field="email1" editing={editing} editFields={editFields} setEditFields={setEditFields} />
                      <FieldRow label="Email 2" value={detail.email2} field="email2" editing={editing} editFields={editFields} setEditFields={setEditFields} />
                    </FieldGroup>
                    {/* C. Employment */}
                    <FieldGroup title="Employment">
                      <ReadOnlyField label="Client" value={String(detail.client || "-")} />
                      <FieldRow label="Hire Date" value={detail.hire_date} field="hire_date" editing={editing} editFields={editFields} setEditFields={setEditFields} inputType="date" />
                      <ReadOnlyField label="Status" value={String(detail.status || "Active")} badge />
                    </FieldGroup>
                    {/* D. Emergency Contact */}
                    <FieldGroup title="Emergency Contact (NOK)">
                      <FieldRow label="Name" value={detail.nok_name} field="nok_name" editing={editing} editFields={editFields} setEditFields={setEditFields} />
                      <FieldRow label="Relationship" value={detail.nok_relation} field="nok_relation" editing={editing} editFields={editFields} setEditFields={setEditFields} />
                      <FieldRow label="Phone" value={detail.nok_phone} field="nok_phone" editing={editing} editFields={editFields} setEditFields={setEditFields} />
                    </FieldGroup>
                    {/* E. Financials */}
                    <FieldGroup title="Financials">
                      <FieldRow label="Basic Salary" value={detail.basic} field="basic" editing={editing} editFields={editFields} setEditFields={setEditFields} formatFn={formatCurrency} />
                      <FieldRow label="Fixed Allowance" value={detail.fixed_all} field="fixed_all" editing={editing} editFields={editFields} setEditFields={setEditFields} formatFn={formatCurrency} />
                      <FieldRow label="OA Rate" value={detail.oa_rate} field="oa_rate" editing={editing} editFields={editFields} setEditFields={setEditFields} formatFn={formatCurrency} />
                    </FieldGroup>
                  </CardContent>
                </Card>
              </Card>
            )}

            {/* ─── TAB 2: Training Matrix ─── */}
            {activeTab === "training" && (
              <Card>
                <CardHeader className="pb-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Training Certificates</h4>
                </CardHeader>
                <CardContent>
                  {matrix.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">Cert Type</th>
                            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">Cert No</th>
                            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">Attended</th>
                            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">Expiry</th>
                            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">Plan</th>
                            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrix.map((row) => {
                            const st = certStatus(row.expiry_date);
                            return (
                              <tr key={row.id} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-0">
                                <td className="px-3 py-2 text-xs font-bold text-slate-900">{row.cert_type}</td>
                                <td className="px-3 py-2 text-xs font-semibold text-slate-700 tabular-nums">{row.cert_no || "-"}</td>
                                <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">{formatDate(row.attended_date)}</td>
                                <td className="px-3 py-2 text-xs font-bold text-slate-800 tabular-nums">{formatDate(row.expiry_date)}</td>
                                <td className="px-3 py-2 text-xs text-blue-600 font-semibold tabular-nums">{formatDate(row.plan_date)}</td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase ${st.color}`}>{st.label}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-10 text-sm text-muted-foreground font-medium">No training records found for this crew member.</div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─── TAB 3: Movement History ─── */}
            {activeTab === "movement" && (
              <Card>
                <CardHeader className="pb-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Rotation / Movement History</h4>
                </CardHeader>
                <CardContent>
                  {movements.length > 0 ? (
                    <div className="space-y-0 relative">
                      {/* Timeline line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
                      {movements.map((m, i) => (
                        <div key={i} className="flex gap-4 relative py-2">
                          <div className={`w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 z-10 border-2 border-white ${
                            m.type === "Mobilize" ? "bg-emerald-500" : "bg-red-400"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-3">
                              <span className={`text-xs font-bold uppercase ${
                                m.type === "Mobilize" ? "text-emerald-700" : "text-red-600"
                              }`}>{m.type}</span>
                              <span className="text-[10px] text-slate-500 font-semibold">{m.location}</span>
                            </div>
                            <p className="text-xs text-slate-600 font-semibold tabular-nums mt-0.5">{formatDate(m.date)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-sm text-muted-foreground font-medium">No movement records found.</div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─── TAB 4: Documents ─── */}
            {activeTab === "documents" && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Documents</h4>
                  {canEdit && (
                    <div className="relative">
                      <input
                        type="file"
                        id="file-upload"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        disabled={uploading}
                      />
                      <Button variant="outline" size="sm" className="text-xs font-bold pointer-events-none" disabled={uploading}>
                        <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        {uploading ? "Uploading..." : "Upload File"}
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-[10px] text-muted-foreground mb-4 font-medium">Max 5MB. Allowed: PDF, JPG, PNG.</p>
                  {docs.length > 0 ? (
                    <div className="space-y-2">
                      {docs.map((f) => (
                        <div key={f.name} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[9px] font-black text-white shrink-0 ${
                            fileIcon(f.name) === "PDF" ? "bg-red-500" : fileIcon(f.name) === "IMG" ? "bg-blue-500" : "bg-slate-500"
                          }`}>
                            {fileIcon(f.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{f.name}</p>
                            <p className="text-[10px] text-muted-foreground">{fileSize(f.size)} &middot; {formatDate(f.created_at)}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDownload(f.name)}
                              className="p-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                              title="Download"
                            >
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleDelete(f.name)}
                                className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
                                title="Delete"
                              >
                                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-sm text-muted-foreground font-medium">No documents uploaded yet.</div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Sub-components ───

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3 pb-1 border-b border-slate-200">{title}</h5>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  field,
  editing,
  editFields,
  setEditFields,
  wide,
  inputType = "text",
  formatFn,
}: {
  label: string;
  value: unknown;
  field: string;
  editing: boolean;
  editFields: Record<string, string>;
  setEditFields: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  wide?: boolean;
  inputType?: string;
  formatFn?: (v: unknown) => string;
}) {
  if (editing) {
    return (
      <div className={wide ? "md:col-span-3" : ""}>
        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
        <Input
          type={inputType}
          value={editFields[field] || ""}
          onChange={(e) => setEditFields((prev) => ({ ...prev, [field]: e.target.value }))}
          className="mt-1 h-9 text-sm font-semibold"
        />
      </div>
    );
  }

  const display = formatFn ? formatFn(value) : (String(value || "") || "-");
  return (
    <div className={wide ? "md:col-span-3" : ""}>
      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
      <p className="text-sm font-bold text-foreground mt-1">{display}</p>
    </div>
  );
}

function ReadOnlyField({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div>
      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
      {badge ? (
        <p className="mt-1">
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            value === "Active" ? "bg-emerald-100 text-emerald-700"
              : value === "On Notice" ? "bg-amber-100 text-amber-700"
              : value === "Resigned" ? "bg-red-100 text-red-700"
              : "bg-slate-100 text-slate-600"
          }`}>{value}</span>
        </p>
      ) : (
        <p className="text-sm font-bold text-foreground mt-1">{value}</p>
      )}
    </div>
  );
}
