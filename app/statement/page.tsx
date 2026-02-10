"use client";

import { Fragment, useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow, TradeType } from "@/lib/types";
import { getPivotedRosterData, getCrewMasterData, getCrewList, type CrewMasterRecord, getApproval, submitForApproval, approveStatement, rejectApproval, type ApprovalRecord } from "@/lib/actions";
import { getUser } from "@/lib/auth";
import { safeParseDate, shortenPost, getTradeRank, formatDate } from "@/lib/logic";

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

interface StatementRow {
  crew_id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  displayLocation: string;
  masterIndex: number;
  offshoreDays: number;
  offshoreTotal: number;
  reliefDays: number;
  reliefRate: number;
  reliefTotal: number;
  standbyDays: number;
  standbyRate: number;
  standbyTotal: number;
  medevacDays: number;
  medevacTotal: number;
  grandTotal: number;
  cycles: {
    cycleNum: number;
    sign_on: string | null;
    sign_off: string | null;
    days: number;
    is_offshore: boolean;
    day_relief: number;
    relief_rate: number;
    day_standby: number;
    standby_rate: number;
    medevac_dates: string[];
    notes: string | null;
  }[];
}

export default function StatementPage() {
  const [data, setData] = useState<PivotedCrewRow[]>([]);
  const [masterData, setMasterData] = useState<CrewMasterRecord[]>([]);
  const [crewList, setCrewList] = useState<{ id: string; crew_name: string; clean_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [tradeFilter, setTradeFilter] = useState<TradeType | "ALL">("ALL");
  const [clientFilter, setClientFilter] = useState<"ALL" | "SBA" | "SKA">("ALL");
  const [search, setSearch] = useState("");

  // Two-stage approval system
  const [approvalModal, setApprovalModal] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState<"Draft" | "Submitted" | "Approved">("Draft");
  const [approvalRecord, setApprovalRecord] = useState<ApprovalRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const user = typeof window !== "undefined" ? getUser() : null;

  useEffect(() => {
    Promise.all([getPivotedRosterData(), getCrewMasterData(), getCrewList()]).then(([pivotedData, master, crewResult]) => {
      setData(pivotedData);
      setMasterData(master);
      if (crewResult.success && crewResult.data) setCrewList(crewResult.data);
      setLoading(false);
    });
  }, []);

  const masterMap = useMemo(() => {
    const map = new Map<string, CrewMasterRecord>();
    for (const m of masterData) {
      map.set((m.crew_name || "").toUpperCase().trim(), m);
    }
    return map;
  }, [masterData]);

  // Build crew_id -> clean display name from master for consistent naming
  const crewNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const staff of crewList) {
      map.set(staff.id, staff.clean_name || staff.crew_name);
    }
    return map;
  }, [crewList]);

  // Resolve display name: master clean_name + preserve suffix like (R), (S), (P)
  const getDisplayName = (crewId: string, crewName: string) => {
    const masterName = crewNameMap.get(crewId);
    if (!masterName) return crewName;
    const suffixMatch = (crewName || "").match(/\s*(\([A-Z]\d*\))\s*$/);
    return suffixMatch ? `${masterName} ${suffixMatch[1]}` : masterName;
  };

  // Map crew name to their index in master data for sorting
  const masterIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    masterData.forEach((m, idx) => {
      map.set((m.crew_name || "").toUpperCase().trim(), idx);
    });
    return map;
  }, [masterData]);

  const [selectedYear, selectedMonthNum] = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return [y, m];
  }, [selectedMonth]);

  const statementRows = useMemo(() => {
    // Use day-number arithmetic to avoid floating-point issues
    const monthStartDate = new Date(selectedYear, selectedMonthNum - 1, 1);
    const monthEndDate = new Date(selectedYear, selectedMonthNum, 0); // last day of month
    const monthStartDay = Math.round(monthStartDate.getTime() / 86400000);
    const monthEndDay = Math.round(monthEndDate.getTime() / 86400000);
    const OA_RATE = 200;
    const MEDEVAC_RATE = 500;
    // Keep ms values for medevac date filtering
    const monthStartTime = monthStartDate.getTime();
    const monthEndTime = monthEndDate.getTime();

    const rows: StatementRow[] = [];

    for (const crew of data) {
      const isOM = (crew.post || "").toUpperCase().includes("OFFSHORE MEDIC");
      const isEM = (crew.post || "").toUpperCase().includes("ESCORT MEDIC");
      const hasR = (crew.crew_name || "").includes("(R)");
      // (R) crew: use their assigned location from master; non-(R): use roster location
      const master = masterMap.get((crew.crew_name || "").toUpperCase().trim());
      const displayLocation = hasR ? (master?.location || crew.location || "") : (crew.location || "");
      const masterIdx = masterIndexMap.get((crew.crew_name || "").toUpperCase().trim()) ?? 9999;

      const cycleDetails: StatementRow["cycles"] = [];
      let totalOffshoreDays = 0;
      let totalReliefDays = 0;
      let totalReliefAmount = 0;
      let totalStandbyDays = 0;
      let totalStandbyAmount = 0;
      let totalMedevacDays = 0;

      for (const [cycleNumStr, cycle] of Object.entries(crew.cycles)) {
        const signOn = safeParseDate(cycle.sign_on);
        const signOff = safeParseDate(cycle.sign_off);
        if (!signOn || !signOff) continue;

        // sign_off date not counted: last working day = signOff - 1
        const rotStartDay = Math.round(signOn.getTime() / 86400000);
        const rotEndDay = Math.round(signOff.getTime() / 86400000) - 1;
        if (rotStartDay > monthEndDay || rotEndDay < monthStartDay) continue;

        // Clamp to month boundaries: endOfMonth - startDate + 1
        const effectiveStartDay = Math.max(rotStartDay, monthStartDay);
        const effectiveEndDay = Math.min(rotEndDay, monthEndDay);
        const daysInMonth = effectiveEndDay - effectiveStartDay + 1;
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
          if (!md) return false;
          return md.getTime() >= monthStartTime && md.getTime() <= monthEndTime;
        });
        totalMedevacDays += cycleMedevacDates.length;

        cycleDetails.push({
          cycleNum: parseInt(cycleNumStr),
          sign_on: cycle.sign_on,
          sign_off: cycle.sign_off,
          days: daysInMonth,
          is_offshore: isOffshore,
          day_relief: cycleReliefDays,
          relief_rate: cycleReliefRate,
          day_standby: cycleStandbyDays,
          standby_rate: cycleStandbyRate,
          medevac_dates: cycleMedevacDates,
          notes: cycle.notes,
        });
      }

      if (cycleDetails.length === 0) continue;

      const offshoreTotal = isOM ? totalOffshoreDays * OA_RATE : 0;
      const medevacTotal = isEM ? totalMedevacDays * MEDEVAC_RATE : 0;
      const grandTotal = offshoreTotal + totalReliefAmount + totalStandbyAmount + medevacTotal;

      rows.push({
        crew_id: crew.crew_id,
        crew_name: crew.crew_name,
        post: crew.post,
        client: crew.client,
        location: crew.location,
        displayLocation,
        masterIndex: masterIdx,
        offshoreDays: isOM ? totalOffshoreDays : 0,
        offshoreTotal,
        reliefDays: totalReliefDays,
        reliefRate: totalReliefAmount > 0 && totalReliefDays > 0 ? totalReliefAmount / totalReliefDays : 0,
        reliefTotal: totalReliefAmount,
        standbyDays: totalStandbyDays,
        standbyRate: totalStandbyAmount > 0 && totalStandbyDays > 0 ? totalStandbyAmount / totalStandbyDays : 0,
        standbyTotal: totalStandbyAmount,
        medevacDays: isEM ? totalMedevacDays : 0,
        medevacTotal,
        grandTotal,
        cycles: cycleDetails.sort((a, b) => a.cycleNum - b.cycleNum),
      });
    }

    // Sort: Trade (OM→EM→OHN), Location (alphabetical), Client (SKA→SBA), then Name
    const clientRank = (c: string) => {
      const u = (c || "").toUpperCase().trim();
      if (u.includes("SKA")) return 1;
      if (u.includes("SBA")) return 2;
      return 3;
    };
    return rows.sort((a, b) => {
      const tradeA = getTradeRank(a.post);
      const tradeB = getTradeRank(b.post);
      if (tradeA !== tradeB) return tradeA - tradeB;
      const locCmp = (a.displayLocation || "").localeCompare(b.displayLocation || "");
      if (locCmp !== 0) return locCmp;
      const cA = clientRank(a.client);
      const cB = clientRank(b.client);
      if (cA !== cB) return cA - cB;
      return a.crew_name.localeCompare(b.crew_name);
    });
  }, [data, masterMap, selectedYear, selectedMonthNum]);

  const filteredRows = useMemo(() => {
    return statementRows.filter((row) => {
      if (row.grandTotal === 0) return false;
      const displayName = getDisplayName(row.crew_id, row.crew_name);
    const matchesSearch = !search.trim() || displayName.toLowerCase().includes(search.toLowerCase());
      const matchesTrade =
        tradeFilter === "ALL" ||
        (tradeFilter === "OM" && row.post?.includes("OFFSHORE MEDIC")) ||
        (tradeFilter === "EM" && row.post?.includes("ESCORT MEDIC")) ||
        (tradeFilter === "IMP/OHN" && (row.post?.includes("IM") || row.post?.includes("OHN")));
      const matchesClient = clientFilter === "ALL" || row.client === clientFilter;
      return matchesSearch && matchesTrade && matchesClient;
    });
  }, [statementRows, search, tradeFilter, clientFilter]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => ({
        offshore: acc.offshore + row.offshoreTotal,
        relief: acc.relief + row.reliefTotal,
        standby: acc.standby + row.standbyTotal,
        medevac: acc.medevac + row.medevacTotal,
        grand: acc.grand + row.grandTotal,
      }),
      { offshore: 0, relief: 0, standby: 0, medevac: 0, grand: 0 }
    );
  }, [filteredRows]);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Load approval record from Supabase
  useEffect(() => {
    if (!selectedMonth || !clientFilter) return;
    const key = clientFilter === "ALL" ? "ALL" : clientFilter;
    getApproval(selectedMonth, key).then((rec) => {
      if (rec) {
        setApprovalRecord(rec);
        setSubmissionStatus((rec.submission_status as "Draft" | "Submitted" | "Approved") || "Draft");
      } else {
        setApprovalRecord(null);
        setSubmissionStatus("Draft");
      }
    });
  }, [selectedMonth, clientFilter]);

  // Stage 1: Submit for Approval
  const handleSubmitForApproval = async () => {
    if (submitting) return;
    setSubmitting(true);
    const key = clientFilter === "ALL" ? "ALL" : clientFilter;
    const submitterName = user?.username || "Unknown";
    const result = await submitForApproval(selectedMonth, key, submitterName);
    if (result.success) {
      // Reload record from DB
      const rec = await getApproval(selectedMonth, key);
      if (rec) {
        setApprovalRecord(rec);
        setSubmissionStatus((rec.submission_status as "Draft" | "Submitted" | "Approved") || "Draft");
      } else {
        // If no record returned, set directly
        setSubmissionStatus("Submitted");
      }
    }
    setSubmitting(false);
  };

  // Stage 2: PM Approval
  const handleApprove = async () => {
    if (!approverName.trim() || submitting) return;
    setSubmitting(true);
    const key = clientFilter === "ALL" ? "ALL" : clientFilter;
    const result = await approveStatement(selectedMonth, key, approverName.trim());
    if (result.success) {
      setSubmissionStatus("Approved");
      const rec = await getApproval(selectedMonth, key);
      if (rec) setApprovalRecord(rec);
    }
    setApprovalModal(false);
    setApproverName("");
    setSubmitting(false);
  };

  // Reject / Unlock: reset to Draft
  const handleReject = async () => {
    if (submitting) return;
    setSubmitting(true);
    const key = clientFilter === "ALL" ? "ALL" : clientFilter;
    const result = await rejectApproval(selectedMonth, key);
    if (result.success) {
      setSubmissionStatus("Draft");
      setApprovalRecord(null);
    }
    setSubmitting(false);
  };

  const fmtNum = (val: number) => (val === 0 ? "-" : String(val));
  const fmtAmt = (val: number) =>
    val === 0
      ? "-"
      : val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hasActiveFilters = tradeFilter !== "ALL" || clientFilter !== "ALL" || search.trim() !== "";
  const resetFilters = () => {
    setTradeFilter("ALL");
    setClientFilter("ALL");
    setSearch("");
  };

  return (
    <AppShell>
      {/* Print-only header */}
      <div className="print-header hidden items-center justify-between px-2 py-2 border-b border-slate-300 mb-2">
        <div>
          <span className="text-sm font-black uppercase tracking-wider">Monthly Allowance Statement</span>
          <span className="text-xs font-bold text-slate-600 ml-3">{MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-bold text-slate-500 uppercase">
          {clientFilter !== "ALL" && <span>Client: {clientFilter}</span>}
          {tradeFilter !== "ALL" && <span>Trade: {tradeFilter}</span>}
          {search.trim() && <span>Search: {search}</span>}
          {clientFilter === "ALL" && tradeFilter === "ALL" && !search.trim() && <span>All Crew</span>}
          <span>{filteredRows.length} staff</span>
        </div>
      </div>

      <div className="space-y-4 animate-in fade-in duration-500 mt-1">
        {/* HEADER + FILTERS -- hidden on print */}
        <div className="no-print-header" data-no-print>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">
                Monthly Allowance Statement
              </h2>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                Allowance Payable for {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Period</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {(() => {
                    const options: { value: string; label: string }[] = [];
                    for (let y = 2025; y <= 2026; y++) {
                      const startM = y === 2025 ? 9 : 1;
                      const endM = 12;
                      for (let m = startM; m <= endM; m++) {
                        const val = `${y}-${String(m).padStart(2, "0")}`;
                        options.push({ value: val, label: `${MONTH_NAMES[m - 1]} ${y}` });
                      }
                    }
                    return options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ));
                  })()}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Client</label>
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value as "ALL" | "SBA" | "SKA")}
                  className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="ALL">All</option>
                  <option value="SBA">SBA</option>
                  <option value="SKA">SKA</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Grade</label>
                <select
                  value={tradeFilter}
                  onChange={(e) => setTradeFilter(e.target.value as TradeType | "ALL")}
                  className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold uppercase outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="ALL">All</option>
                  <option value="OM">OM</option>
                  <option value="EM">EM</option>
                  <option value="IMP/OHN">OHN</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Search</label>
                <input
                  type="text"
                  placeholder="Name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/40 w-32"
                />
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-wider transition-colors border border-red-500/20"
                >
                  Reset
                </button>
              )}
              {/* Print icon pushed to far right */}
              <button
                type="button"
                onClick={() => { document.title = `Statement_${new Date().toISOString().slice(0,10)}`; window.print(); }}
                className="print-btn self-end p-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-sm ml-auto"
                title="Print Statement"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* TABLE */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <p className="text-muted-foreground text-sm font-medium">
              No active rotations found for {MONTH_NAMES[selectedMonthNum - 1]} {selectedYear}.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-220px)]">
              <table className="w-full text-[12px] font-sans border-collapse" style={{ minWidth: "1000px" }}>
                <thead className="sticky top-0 z-10">
                  {/* Group header */}
                  <tr className="text-white" style={{ backgroundColor: "#1e3a8a" }}>
                    <th rowSpan={2} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-left border-r border-blue-700/50" style={{ minWidth: "240px" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="whitespace-nowrap">Name / Client / Trade / Location</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Reject/Unlock button - visible to L1 roles when Submitted or Approved */}
                          {(submissionStatus === "Submitted" || submissionStatus === "Approved") && (
                            <button
                              type="button"
                              onClick={handleReject}
                              disabled={submitting}
                              className="flex items-center gap-1 px-2 py-1.5 bg-white/10 hover:bg-amber-500/30 rounded-md border border-white/20 transition-all"
                              title="Reject / Unlock - Reset to Draft"
                            >
                              <svg className="w-3.5 h-3.5 text-amber-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                              <span className="text-[8px] font-bold text-amber-200 uppercase tracking-wider">Unlock</span>
                            </button>
                          )}

                          {/* Stage: APPROVED - Big Red Stamp */}
                          {submissionStatus === "Approved" && approvalRecord ? (
                            <div className="approval-stamp flex items-center gap-2.5 px-4 py-3 bg-red-600 rounded-lg border-2 border-red-400 shadow-lg shadow-red-900/30">
                              <svg className="w-7 h-7 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                              <div className="flex flex-col leading-none gap-1">
                                <span className="text-[11px] font-black text-white uppercase tracking-widest leading-none">Certified & Approved</span>
                                <span className="text-[9px] font-black text-red-100 uppercase tracking-wider leading-none">For Payment</span>
                                <span className="text-[8px] font-bold text-red-200 whitespace-nowrap leading-none">{approvalRecord.approved_by} | Project Manager | {approvalRecord.approved_at}</span>
                              </div>
                            </div>
                          ) : submissionStatus === "Submitted" ? (
                            <>
                              {/* Submitted badge */}
                              <div className="flex items-center gap-1.5 px-2.5 py-2 bg-amber-500/20 rounded-lg border border-amber-400/40 shrink-0">
                                <svg className="w-4 h-4 text-amber-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <div className="flex flex-col leading-none gap-0.5">
                                  <span className="text-[9px] font-black text-amber-200 uppercase tracking-widest">Submitted</span>
                                  <span className="text-[7px] font-bold text-amber-300/70 whitespace-nowrap">By {approvalRecord?.submitted_by} | {approvalRecord?.submitted_at}</span>
                                </div>
                              </div>
                              {/* PM Approve button */}
                              <button
                                type="button"
                                onClick={() => setApprovalModal(true)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg border border-red-400 transition-all shadow-lg shrink-0"
                              >
                                <svg className="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                <span className="text-[9px] font-black text-white uppercase tracking-wider">Approve Statement</span>
                              </button>
                            </>
                          ) : (
                            /* Draft - Submit for Approval button */
                            <button
                              type="button"
                              onClick={handleSubmitForApproval}
                              disabled={submitting}
                              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg border border-orange-400 transition-all shadow-lg shrink-0"
                            >
                              <svg className="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span className="text-[9px] font-black text-white uppercase tracking-wider">{submitting ? "Submitting..." : "Submit for Approval"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-center border-r border-b border-blue-700/50">
                      Offshore
                    </th>
                    <th colSpan={3} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-center border-r border-b border-blue-700/50">
                      Relief
                    </th>
                    <th colSpan={3} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-center border-r border-b border-blue-700/50">
                      Standby
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-center border-r border-b border-blue-700/50">
                      Medevac
                    </th>
                    <th rowSpan={2} className="px-3 py-1.5 text-center whitespace-nowrap" style={{ minWidth: "100px" }}>
                      <div className="text-[10px] font-black uppercase tracking-wide">Grand Total</div>
                      <div className="text-[11px] font-black tabular-nums mt-0.5">{fmtAmt(totals.grand)}</div>
                    </th>
                  </tr>
                  {/* Sub-header */}
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
                  {filteredRows.map((row, idx) => {
                    const isExpanded = expandedRow === `${row.crew_id}::${row.crew_name}`;
                    return (
                      <Fragment key={`${row.crew_id}::${row.crew_name}::${idx}`}>
                        <tr
                          onClick={() => setExpandedRow(isExpanded ? null : `${row.crew_id}::${row.crew_name}`)}
                          className={`cursor-pointer transition-colors border-b border-border ${
                            idx % 2 === 0 ? "bg-card" : "bg-muted/30"
                          } hover:bg-blue-500/5`}
                        >
                          <td className="px-3 py-1 border-r border-border">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground font-bold tabular-nums w-4">{idx + 1}</span>
                              <div>
                                <div className="text-[11px] font-bold text-foreground uppercase leading-tight whitespace-nowrap">{getDisplayName(row.crew_id, row.crew_name)}</div>
                                <div className="text-[9px] text-muted-foreground">
                                  {row.client} / {shortenPost(row.post)} / {row.displayLocation}
                                </div>
                              </div>
                            </div>
                          </td>
                          {/* Offshore */}
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.offshoreDays > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.offshoreDays)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.offshoreTotal > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.offshoreTotal)}</span>
                          </td>
                          {/* Relief */}
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.reliefDays > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.reliefDays)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums text-muted-foreground text-[11px]">
                            {row.reliefRate > 0 ? fmtAmt(row.reliefRate) : "-"}
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.reliefTotal > 0 ? "text-blue-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.reliefTotal)}</span>
                          </td>
                          {/* Standby */}
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.standbyDays > 0 ? "text-violet-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.standbyDays)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums text-muted-foreground text-[11px]">
                            {row.standbyRate > 0 ? fmtAmt(row.standbyRate) : "-"}
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.standbyTotal > 0 ? "text-violet-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.standbyTotal)}</span>
                          </td>
                          {/* Medevac */}
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.medevacDays > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>{fmtNum(row.medevacDays)}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-border tabular-nums">
                            <span className={row.medevacTotal > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>{fmtAmt(row.medevacTotal)}</span>
                          </td>
                          {/* Grand Total */}
                          <td className="px-3 py-1 text-center tabular-nums">
                            <span className="text-[12px] font-black text-foreground">{fmtAmt(row.grandTotal)}</span>
                          </td>
                        </tr>
                        {/* Expanded detail */}
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
                    <td className="px-3 py-2 text-left border-r border-blue-700/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Total ({filteredRows.length} crew)</span>
                    </td>
                    <td className="px-2 py-2 border-r border-blue-700/50" />
                    <td className="px-2 py-2 text-center border-r border-blue-700/50 tabular-nums text-[11px]">{fmtAmt(totals.offshore)}</td>
                    <td className="px-2 py-2 border-r border-blue-700/50" />
                    <td className="px-2 py-2 border-r border-blue-700/50" />
                    <td className="px-2 py-2 text-center border-r border-blue-700/50 tabular-nums text-[11px]">{fmtAmt(totals.relief)}</td>
                    <td className="px-2 py-2 border-r border-blue-700/50" />
                    <td className="px-2 py-2 border-r border-blue-700/50" />
                    <td className="px-2 py-2 text-center border-r border-blue-700/50 tabular-nums text-[11px]">{fmtAmt(totals.standby)}</td>
                    <td className="px-2 py-2 border-r border-blue-700/50" />
                    <td className="px-2 py-2 text-center border-r border-blue-700/50 tabular-nums text-[11px]">{fmtAmt(totals.medevac)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-[12px] font-black">{fmtAmt(totals.grand)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PM Approval Modal (Stage 2) */}
      {approvalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border">
            <div className="px-5 py-3 border-b border-border bg-red-600 rounded-t-2xl">
              <h3 className="text-xs font-black uppercase tracking-wider text-white">Project Manager Approval</h3>
              <p className="text-[9px] font-bold text-red-100">Enter your name to certify this statement for payment</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <p className="text-[9px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Statement submitted by {approvalRecord?.submitted_by} on {approvalRecord?.submitted_at}</p>
              </div>
              <div>
                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">PM Full Name</label>
                <input
                  type="text"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  placeholder="Enter your full name..."
                  autoFocus
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 rounded-b-2xl">
              <button type="button" onClick={() => { setApprovalModal(false); setApproverName(""); }} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold text-[10px] uppercase tracking-wider transition-all border border-border">Cancel</button>
              <button type="button" onClick={handleApprove} disabled={!approverName.trim() || submitting} className={`px-5 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${approverName.trim() && !submitting ? "bg-red-600 hover:bg-red-500 text-white shadow-lg" : "bg-muted text-muted-foreground cursor-not-allowed"}`}>
                {submitting ? "Approving..." : "Certify & Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
