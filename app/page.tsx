"use client";

import { useState, useMemo, Fragment, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow, ClientType, TradeType } from "@/lib/types";
import { getRosterData } from "@/lib/actions";
import {
  isPersonnelOnBoard,
  getDaysOnBoard,
  formatDateLong,
  formatDate,
  getActiveRotationRange,
  getFullTradeName,
  getTradeRank,
} from "@/lib/logic";

export default function DashboardPage() {
  const [systemDate, setSystemDate] = useState(new Date(2025, 11, 31));
  const [clientFilter, setClientFilter] = useState<ClientType | "ALL">("ALL");
  const [tradeFilter, setTradeFilter] = useState<TradeType | "ALL">("ALL");
  const [data, setData] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRosterData().then((rosterData) => {
      setData(rosterData);
      setLoading(false);
    });
  }, []);

  const filteredPersonnel = useMemo(() => {
    return data
      .filter((row) => {
        const isBoard = isPersonnelOnBoard(row, systemDate);
        if (!isBoard) return false;

        const matchesClient =
          clientFilter === "ALL" || row.client === clientFilter;
        const matchesTrade =
          tradeFilter === "ALL" ||
          (tradeFilter === "OM" && row.post?.includes("OFFSHORE MEDIC")) ||
          (tradeFilter === "EM" && row.post?.includes("ESCORT MEDIC")) ||
          (tradeFilter === "IMP/OHN" &&
            (row.post?.includes("IM") || row.post?.includes("OHN")));
        return matchesClient && matchesTrade;
      })
      .sort((a, b) => {
        if (a.client !== b.client) return a.client.localeCompare(b.client);
        const rankA = getTradeRank(a.post);
        const rankB = getTradeRank(b.post);
        if (rankA !== rankB) return rankA - rankB;
        if (a.location !== b.location)
          return a.location.localeCompare(b.location);
        return a.crew_name.localeCompare(b.crew_name);
      });
  }, [data, systemDate, clientFilter, tradeFilter]);

  const stats = useMemo(
    () => ({
      total: filteredPersonnel.length,
      ska: filteredPersonnel.filter((p) => p.client === "SKA").length,
      sba: filteredPersonnel.filter((p) => p.client === "SBA").length,
      omCount: filteredPersonnel.filter((p) => p.post?.includes("OFFSHORE")).length,
      emCount: filteredPersonnel.filter((p) => p.post?.includes("ESCORT")).length,
      ohnCount: filteredPersonnel.filter(
        (p) => p.post?.includes("IM") || p.post?.includes("OHN")
      ).length,
    }),
    [filteredPersonnel]
  );

  let currentTradeCounter = 0;

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4 animate-in fade-in duration-300">
        {/* HEADER BAR */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Active Personnel</h1>
              <p className="text-xs text-muted-foreground">Real-time deployment status</p>
            </div>
          </div>

          {/* FILTERS */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value as ClientType | "ALL")}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-xs font-medium outline-none text-foreground"
            >
              <option value="ALL">All Clients</option>
              <option value="SKA">SKA</option>
              <option value="SBA">SBA</option>
            </select>

            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value as TradeType | "ALL")}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-xs font-medium outline-none text-foreground"
            >
              <option value="ALL">All Roles</option>
              <option value="OM">Offshore Medic</option>
              <option value="EM">Escort Medic</option>
              <option value="IMP/OHN">IMP / OHN</option>
            </select>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={systemDate.toISOString().split("T")[0]}
                onChange={(e) => setSystemDate(new Date(e.target.value))}
                className="bg-muted border border-border rounded-lg px-3 py-2 text-xs font-medium outline-none text-foreground"
              />
              <button
                type="button"
                onClick={() => setSystemDate(new Date(2025, 11, 31))}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* STATS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total POB</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.ska}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">SKA</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.sba}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">SBA</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.omCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Offshore</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.emCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Escort</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.ohnCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">IMP/OHN</p>
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">#</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Days</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Rotation Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPersonnel.map((row, idx) => {
                  const prev = filteredPersonnel[idx - 1];
                  const tradeChanged = !prev || getTradeRank(prev.post) !== getTradeRank(row.post);
                  const clientChanged = !prev || prev.client !== row.client;
                  const showSeparator = clientChanged || tradeChanged;

                  if (showSeparator) {
                    currentTradeCounter = 1;
                  } else {
                    currentTradeCounter++;
                  }

                  const range = getActiveRotationRange(row, systemDate);
                  const days = getDaysOnBoard(row, systemDate);
                  const isOHN = row.post?.includes("IM") || row.post?.includes("OHN");
                  const tradeName = getFullTradeName(row.post);

                  return (
                    <Fragment key={`${row.crew_name}-${row.id}`}>
                      {showSeparator && (
                        <tr className="bg-muted/30">
                          <td colSpan={7} className="px-4 py-2">
                            <span className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide ${
                              row.client === "SKA" ? "text-slate-600" : "text-slate-500"
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${row.client === "SKA" ? "bg-slate-600" : "bg-slate-400"}`} />
                              {row.client} - {tradeName}
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{currentTradeCounter}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-foreground">{row.crew_name}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                            tradeName === "OFFSHORE MEDIC" 
                              ? "bg-blue-100 text-blue-700" 
                              : tradeName === "ESCORT MEDIC"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {tradeName === "OFFSHORE MEDIC" ? "OM" : tradeName === "ESCORT MEDIC" ? "EM" : "IMP/OHN"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.location}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                            row.client === "SKA" ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-600"
                          }`}>
                            {row.client}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-sm font-semibold tabular-nums ${
                            days >= 14 ? "text-red-600" : "text-foreground"
                          }`}>
                            {isOHN ? "-" : days > 0 ? days : "-"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isOHN ? (
                            <span className="text-xs text-muted-foreground italic">Weekdays</span>
                          ) : range.start ? (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatDate(range.start)} - {formatDate(range.end)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
                {filteredPersonnel.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <p className="text-sm text-muted-foreground">No personnel on board for selected filters</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>Viewing date: {formatDateLong(systemDate)}</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-600" /> SKA
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400" /> SBA
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
