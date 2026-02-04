"use client";

import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow, ClientType, TradeType } from "@/lib/types";
import { getRosterData } from "@/lib/actions";
import { safeParseDate, getTradeRank, shortenPost } from "@/lib/logic";

export default function RosterPage() {
  const [viewDate, setViewDate] = useState(new Date(2025, 11, 1));
  const [systemDate] = useState(new Date(2025, 11, 31));
  const [data, setData] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState<ClientType | "ALL">("ALL");
  const [tradeFilter, setTradeFilter] = useState<TradeType | "ALL">("ALL");

  useEffect(() => {
    getRosterData().then((rosterData) => {
      setData(rosterData);
      setLoading(false);
    });
  }, []);

  const daysInMonth = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const dateCount = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: dateCount }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return {
        dayNum: i + 1,
        dayName: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        isToday:
          d.getDate() === systemDate.getDate() &&
          d.getMonth() === systemDate.getMonth() &&
          d.getFullYear() === systemDate.getFullYear(),
      };
    });
  }, [viewDate, systemDate]);

  const sortedData = useMemo(() => {
    return data
      .filter((row) => {
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
        const clientOrder = { SKA: 1, SBA: 2 };
        const valA = clientOrder[a.client as keyof typeof clientOrder] || 3;
        const valB = clientOrder[b.client as keyof typeof clientOrder] || 3;
        if (valA !== valB) return valA - valB;
        const rankA = getTradeRank(a.post);
        const rankB = getTradeRank(b.post);
        if (rankA !== rankB) return rankA - rankB;
        const locA = a.location || "";
        const locB = b.location || "";
        if (locA !== locB) return locA.localeCompare(locB);
        return a.crew_name.localeCompare(b.crew_name);
      });
  }, [data, clientFilter, tradeFilter]);

  const getDayStatus = (row: RosterRow, day: number) => {
    const checkDate = new Date(
      viewDate.getFullYear(),
      viewDate.getMonth(),
      day,
      0,
      0,
      0,
      0
    );
    const checkTime = checkDate.getTime();

    if (row.post?.includes("IM") || row.post?.includes("OHN")) {
      const dow = checkDate.getDay();
      if (dow === 0 || dow === 6) return "OFF";
      return "PRIMARY";
    }

    for (let i = 1; i <= 24; i++) {
      const m = safeParseDate(row[`m${i}`] as string);
      const d = safeParseDate(row[`d${i}`] as string);
      if (m && d && checkTime >= m.getTime() && checkTime <= d.getTime()) {
        return row.roles_em === "SECONDARY" ? "SECONDARY" : "PRIMARY";
      }
    }
    return "OFF";
  };

  return (
    <AppShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-4xl font-black text-foreground uppercase italic tracking-tighter leading-none">
              ROTATION MAP
            </h2>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">
                Temporal View:
              </span>
              <select
                value={viewDate.getMonth()}
                onChange={(e) =>
                  setViewDate(
                    new Date(viewDate.getFullYear(), parseInt(e.target.value), 1)
                  )
                }
                className="text-[11px] font-black text-blue-600 bg-card border border-border px-3 py-1 rounded-lg outline-none cursor-pointer uppercase italic shadow-sm"
              >
                {[
                  "January",
                  "February",
                  "March",
                  "April",
                  "May",
                  "June",
                  "July",
                  "August",
                  "September",
                  "October",
                  "November",
                  "December",
                ].map((m, i) => (
                  <option key={m} value={i}>
                    {m} {viewDate.getFullYear()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-card p-2 rounded-2xl shadow-sm border border-border">
            <select
              value={clientFilter}
              onChange={(e) =>
                setClientFilter(e.target.value as ClientType | "ALL")
              }
              className="bg-muted border-none rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none shadow-inner"
            >
              <option value="ALL">All Clients</option>
              <option value="SKA">SKA</option>
              <option value="SBA">SBA</option>
            </select>
            <select
              value={tradeFilter}
              onChange={(e) =>
                setTradeFilter(e.target.value as TradeType | "ALL")
              }
              className="bg-muted border-none rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none shadow-inner"
            >
              <option value="ALL">All Trades</option>
              <option value="OM">OM</option>
              <option value="EM">EM</option>
            </select>
          </div>
        </div>

        <div className="bg-card rounded-[2.5rem] shadow-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-900 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-800">
                  <th className="px-8 py-5 w-56 text-left sticky left-0 bg-slate-900 z-20 border-r border-slate-800">
                    Operational Unit
                  </th>
                  {daysInMonth.map((d) => (
                    <th
                      key={d.dayNum}
                      className={`p-2 text-center border-r border-slate-800 ${
                        d.isToday
                          ? "bg-blue-600 text-white shadow-[inset_0_0_10px_rgba(255,255,255,0.2)]"
                          : ""
                      }`}
                    >
                      <div className="flex flex-col leading-none">
                        <span className="text-[7px] opacity-60 mb-1">
                          {d.dayName}
                        </span>
                        <span className="text-[11px] tabular-nums">
                          {d.dayNum}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedData.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/50 transition-colors group"
                  >
                    <td className="px-8 py-4 sticky left-0 bg-card group-hover:bg-muted/50 z-10 border-r border-border whitespace-nowrap shadow-sm">
                      <div className="text-[11px] font-black text-foreground uppercase tracking-tight truncate max-w-[200px]">
                        {row.crew_name}
                      </div>
                      <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1 truncate">
                        {shortenPost(row.post)} - {row.location}
                      </div>
                    </td>
                    {daysInMonth.map((d) => {
                      const status = getDayStatus(row, d.dayNum);

                      let barClass = "";
                      if (status === "PRIMARY") {
                        barClass =
                          "bg-slate-950 border-t border-white/20 shadow-[0_3px_6px_rgba(0,0,0,0.5)] ring-1 ring-slate-900";
                      } else if (status === "SECONDARY") {
                        barClass =
                          "bg-blue-400 border-t border-white/40 shadow-[0_2px_4px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/20";
                      }

                      return (
                        <td
                          key={d.dayNum}
                          className={`p-0 h-14 border-r border-border/50 relative ${
                            d.isWeekend ? "bg-muted/30" : ""
                          }`}
                        >
                          {status !== "OFF" && (
                            <div
                              className={`absolute inset-y-3 left-0.5 right-0.5 rounded-sm transition-all transform hover:scale-y-110 z-0 ${barClass}`}
                            />
                          )}
                          {d.isToday && (
                            <div className="absolute inset-0 border-x-2 border-blue-500 bg-blue-500/5 pointer-events-none z-10" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-8 px-10 py-5 bg-slate-950 rounded-[2rem] w-fit shadow-2xl border border-white/10 ring-1 ring-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-5 h-5 bg-slate-950 border-t border-white/20 rounded shadow-lg ring-1 ring-slate-800" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                Primary Deployment
              </span>
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                Blue Black Logic
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-5 h-5 bg-blue-400 border-t border-white/40 rounded shadow-lg ring-1 ring-blue-500/30" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">
                Secondary Role
              </span>
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                Light Blue Base
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-5 h-5 bg-slate-800 rounded border border-slate-700" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">
                Off Duty / Reserve
              </span>
              <span className="text-[8px] font-bold text-slate-700 uppercase tracking-widest">
                Null State
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
