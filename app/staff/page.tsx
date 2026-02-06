"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { getUser, type AuthUser } from "@/lib/auth";
import {
  getCrewList,
  getCrewDetail,
  getCrewMatrix,
  getCrewRoster,
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
function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function certStatus(expiry: string | null): { label: string; color: string; bg: string } {
  if (!expiry) return { label: "N/A", color: "text-slate-500", bg: "bg-slate-100" };
  const now = new Date();
  const exp = new Date(expiry);
  const diffMs = exp.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return { label: "EXPIRED", color: "text-red-600", bg: "bg-red-50" };
  if (diffDays < 90) return { label: "EXPIRING", color: "text-amber-600", bg: "bg-amber-50" };
  return { label: "VALID", color: "text-emerald-600", bg: "bg-emerald-50" };
}

// ─── Movement Timeline extraction ───
function extractMovements(rosterRows: Record<string, unknown>[]): { date: string; type: string; location: string }[] {
  const moves: { date: string; type: string; location: string }[] = [];
  for (const row of rosterRows) {
    const location = String(row.location || "");
    for (let i = 1; i <= 24; i++) {
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
  const [loading, setLoading] = useState(true);

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
    const [detRes, matRes] = await Promise.all([
      getCrewDetail(id),
      getCrewMatrix(id),
    ]);
    if (detRes.success && detRes.data) {
      setDetail(detRes.data);
      const rosRes = await getCrewRoster(id);
      setRosterRows(rosRes.success && rosRes.data ? rosRes.data : []);
    }
    if (matRes.success && matRes.data) setMatrix(matRes.data);
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Movement timeline
  const movements = useMemo(() => extractMovements(rosterRows), [rosterRows]);

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
        <div className="space-y-4 animate-in fade-in duration-500">
          <h2 className="text-2xl font-black text-foreground tracking-tight">Staff Detail</h2>
          <div className="bg-card border border-border rounded-xl py-10 text-center">
            <p className="text-sm text-muted-foreground font-semibold">No staff records found.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const d = detail;
  const statusVal = String(d?.status || "Active");
  const statusColor =
    statusVal === "Resigned"
      ? "text-red-600"
      : statusVal === "On Notice"
      ? "text-amber-600"
      : "text-emerald-600";

  return (
    <AppShell>
      <div className="space-y-5 animate-in fade-in duration-500">

        {/* ─── Top: Title + Dropdown ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h2 className="text-2xl font-black text-foreground tracking-tight">Staff Detail</h2>
          <div className="ml-auto">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="bg-card border border-border text-foreground rounded-xl px-4 py-2.5 text-sm font-bold outline-none cursor-pointer w-full sm:w-[360px]"
            >
              {crewList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.crew_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Body: Left Profile + Right Content ─── */}
        {d && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* ═══ LEFT: Profile Card ═══ */}
            <div className="lg:col-span-1">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Blue header */}
                <div className="h-28 bg-blue-600" />

                {/* Avatar overlapping header */}
                <div className="px-6 -mt-12">
                  <div className="w-20 h-20 bg-slate-800 rounded-2xl border-4 border-card flex items-center justify-center text-3xl font-black text-white shadow-lg">
                    {String(d.crew_name || "").charAt(0)}
                  </div>
                </div>

                {/* Name + Post */}
                <div className="px-6 pt-3 pb-4">
                  <h3 className="text-xl font-black text-foreground uppercase leading-tight">
                    {String(d.crew_name || "-")}
                  </h3>
                  <p className="text-sm font-bold text-blue-600 mt-0.5">
                    {String(d.post || "-")}
                  </p>
                </div>

                <div className="border-t border-border mx-6" />

                {/* Details rows */}
                <div className="px-6 py-4 space-y-4">
                  {/* Status */}
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</p>
                    <p className={`text-sm font-black uppercase ${statusColor}`}>{statusVal}</p>
                  </div>

                  {/* Assignment */}
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Assignment</p>
                    <p className="text-sm font-black text-foreground">{String(d.location || "-")}</p>
                  </div>

                  {/* Client */}
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Client</p>
                    <p className="text-sm font-black text-foreground">{String(d.client || "-")}</p>
                  </div>

                  {/* IC / Passport */}
                  {d.ic_no && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">IC No</p>
                      <p className="text-sm font-semibold text-foreground">{String(d.ic_no)}</p>
                    </div>
                  )}
                  {d.passport_no && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Passport No</p>
                      <p className="text-sm font-semibold text-foreground">{String(d.passport_no)}</p>
                    </div>
                  )}

                  {/* Phone */}
                  {d.phone && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Phone</p>
                      <p className="text-sm font-semibold text-foreground">{String(d.phone)}</p>
                    </div>
                  )}

                  {/* Email */}
                  {d.email1 && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</p>
                      <p className="text-sm font-semibold text-foreground break-all">{String(d.email1)}</p>
                    </div>
                  )}

                  {/* Hire Date */}
                  {d.hire_date && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hire Date</p>
                      <p className="text-sm font-semibold text-foreground">{formatDate(String(d.hire_date))}</p>
                    </div>
                  )}

                  {/* NOK */}
                  {d.nok_name && (
                    <>
                      <div className="border-t border-border" />
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Next of Kin</p>
                        <p className="text-sm font-semibold text-foreground">{String(d.nok_name)}</p>
                        {d.nok_relation && <p className="text-xs text-muted-foreground">{String(d.nok_relation)}</p>}
                        {d.nok_phone && <p className="text-xs text-muted-foreground">{String(d.nok_phone)}</p>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ═══ RIGHT: Movement + Certifications ═══ */}
            <div className="lg:col-span-2 space-y-5">

              {/* ─── Movement History ─── */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h4 className="text-sm font-black uppercase tracking-wider text-foreground mb-4">Movement History</h4>
                {movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No movement records found.</p>
                ) : (
                  <div className="overflow-auto max-h-56">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                          <th className="text-left py-2 px-2 font-bold text-muted-foreground uppercase tracking-wider">Type</th>
                          <th className="text-left py-2 px-2 font-bold text-muted-foreground uppercase tracking-wider">Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.slice(0, 20).map((m, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
                            <td className="py-2 px-2 font-semibold text-foreground">{formatDate(m.date)}</td>
                            <td className="py-2 px-2">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                m.type === "Mobilize"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700"
                              }`}>
                                {m.type}
                              </span>
                            </td>
                            <td className="py-2 px-2 font-semibold text-foreground">{m.location || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ─── Certification List ─── */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h4 className="text-sm font-black uppercase tracking-wider text-foreground mb-4">Certification List</h4>
                {matrix.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No certifications found.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {matrix.map((cert) => {
                      const st = certStatus(cert.expiry_date);
                      return (
                        <div
                          key={cert.id}
                          className="flex items-center justify-between border border-border rounded-lg px-4 py-3 hover:bg-muted/30 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-bold text-foreground uppercase">{cert.cert_type}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Exp: {formatDate(cert.expiry_date)}
                            </p>
                            {cert.cert_no && (
                              <p className="text-[10px] text-muted-foreground">
                                No: {cert.cert_no}
                              </p>
                            )}
                          </div>
                          <span className={`text-xs font-black ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
