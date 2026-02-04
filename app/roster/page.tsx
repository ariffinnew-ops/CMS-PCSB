"use client";

import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow, ClientType, TradeType } from "@/lib/types";
import { getRosterData } from "@/lib/actions";
import { safeParseDate, getTradeRank, shortenPost } from "@/lib/logic";

// Generate months from Sep 2025 to Dec 2026
const generateMonthRange = () => {
  const months = [];
  for (let year = 2025; year <= 2026; year++) {
    const startMonth = year === 2025 ? 8 : 0; // Sep 2025 (index 8) or Jan 2026
    const endMonth = year === 2026 ? 11 : 11; // Dec of each year
    for (let month = startMonth; month <= endMonth; month++) {
      months.push({ year, month });
    }
  }
  return months;
};

const MONTH_RANGE = generateMonthRange();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function RosterPage() {
  const [viewDate, setViewDate] = useState(new Date(2025, 11, 1));
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
        dayOfWeek: d.getDay(),
      };
    });
  }, [viewDate]);

  // Sort by Client -> Trade -> Location (matching Data Manager)
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
        // Sort by Client first
        const clientOrder = { SKA: 1, SBA: 2 };
        const valA = clientOrder[a.client as keyof typeof clientOrder] || 3;
        const valB = clientOrder[b.client as keyof typeof clientOrder] || 3;
        if (valA !== valB) return valA - valB;
        
        // Then by Trade rank
        const rankA = getTradeRank(a.post);
        const rankB = getTradeRank(b.post);
        if (rankA !== rankB) return rankA - rankB;
        
        // Then by Location
        const locA = a.location || "";
        const locB = b.location || "";
        if (locA !== locB) return locA.localeCompare(locB);
        
        // Finally by Name
        return a.crew_name.localeCompare(b.crew_name);
      });
  }, [data, clientFilter, tradeFilter]);

  // Group data with separators
  const groupedData = useMemo(() => {
    const result: { type: 'separator' | 'row'; label?: string; row?: RosterRow; trade?: string }[] = [];
    let lastGroupKey = "";
    
    sortedData.forEach((row) => {
      const trade = shortenPost(row.post);
      const groupKey = `${row.client}-${trade}-${row.location}`;
      
      if (groupKey !== lastGroupKey) {
        result.push({
          type: 'separator',
          label: `${row.client} - ${trade} - ${row.location}`,
          trade: trade
        });
        lastGroupKey = groupKey;
      }
      
      result.push({ type: 'row', row, trade });
    });
    
    return result;
  }, [sortedData]);

  const getDayStatus = (row: RosterRow, day: number) => {
    const checkDate = new Date(
      viewDate.getFullYear(),
      viewDate.getMonth(),
      day,
      0, 0, 0, 0
    );
    const checkTime = checkDate.getTime();
    const dayOfWeek = checkDate.getDay();

    // OHN/IM staff - weekday vs weekend logic
    if (row.post?.includes("IM") || row.post?.includes("OHN")) {
      if (dayOfWeek === 0 || dayOfWeek === 6) return "OHN_WEEKEND";
      return "OHN_WEEKDAY";
    }

    // OM/EM - check rotation dates
    for (let i = 1; i <= 24; i++) {
      const m = safeParseDate(row[`m${i}`] as string);
      const d = safeParseDate(row[`d${i}`] as string);
      if (m && d && checkTime >= m.getTime() && checkTime <= d.getTime()) {
        return row.roles_em === "SECONDARY" ? "SECONDARY" : "PRIMARY";
      }
    }
    return "OFF";
  };

  // Check if current day connects to next day (for continuous bars)
  const connectsToNext = (row: RosterRow, day: number) => {
    if (day >= daysInMonth.length) return false;
    const currentStatus = getDayStatus(row, day);
    const nextStatus = getDayStatus(row, day + 1);
    return currentStatus !== "OFF" && nextStatus !== "OFF" && currentStatus === nextStatus;
  };

  // Check if current day connects from previous day
  const connectsFromPrev = (row: RosterRow, day: number) => {
    if (day <= 1) return false;
    const currentStatus = getDayStatus(row, day);
    const prevStatus = getDayStatus(row, day - 1);
    return currentStatus !== "OFF" && prevStatus !== "OFF" && currentStatus === prevStatus;
  };

  return (
    <AppShell>
      <div className="space-y-6 animate-in fade-in duration-500 mt-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight leading-none">
              ROTATION MAP
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Period:
              </span>
              <select
                value={`${viewDate.getFullYear()}-${viewDate.getMonth()}`}
                onChange={(e) => {
                  const [year, month] = e.target.value.split('-').map(Number);
                  setViewDate(new Date(year, month, 1));
                }}
                className="text-[11px] font-bold text-blue-600 bg-card border border-border px-3 py-1.5 rounded-lg outline-none cursor-pointer uppercase shadow-sm"
              >
                {MONTH_RANGE.map(({ year, month }) => (
                  <option key={`${year}-${month}`} value={`${year}-${month}`}>
                    {MONTH_NAMES[month]} {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-card p-2 rounded-xl shadow-sm border border-border">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value as ClientType | "ALL")}
              className="bg-muted border-none rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase outline-none"
            >
              <option value="ALL">All Clients</option>
              <option value="SKA">SKA</option>
              <option value="SBA">SBA</option>
            </select>
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value as TradeType | "ALL")}
              className="bg-muted border-none rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase outline-none"
            >
              <option value="ALL">All Trades</option>
              <option value="OM">OM</option>
              <option value="EM">EM</option>
              <option value="IMP/OHN">OHN</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: '100%' }}>
              <thead>
                <tr className="bg-slate-900">
                  <th className="px-4 py-3 w-48 text-left sticky left-0 bg-slate-900 z-20 border-r border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Personnel
                    </span>
                  </th>
                  {daysInMonth.map((d) => (
                    <th
                      key={d.dayNum}
                      className={`px-0 py-2 text-center min-w-[28px] border-r border-slate-700/50 ${
                        d.isWeekend ? "bg-slate-800" : ""
                      }`}
                    >
                      <div className="flex flex-col items-center leading-none">
                        <span className="text-[11px] font-bold text-white/70">
                          {d.dayName}
                        </span>
                        <span className="text-[13px] font-black text-white tabular-nums mt-0.5">
                          {d.dayNum}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={daysInMonth.length + 1} className="text-center py-12">
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
                        <span className="text-sm text-muted-foreground">Loading roster data...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  groupedData.map((item, idx) => {
                    if (item.type === 'separator') {
                      // Separator bar with group label
                      const separatorColor = item.trade === 'OM' 
                        ? 'bg-amber-50 border-amber-200' 
                        : item.trade === 'OHN' 
                        ? 'bg-teal-50 border-teal-200'
                        : 'bg-blue-50 border-blue-200';
                      const textColor = item.trade === 'OM'
                        ? 'text-amber-700'
                        : item.trade === 'OHN'
                        ? 'text-teal-700'
                        : 'text-blue-700';
                        
                      return (
                        <tr key={`sep-${idx}`} className={`${separatorColor} border-y`}>
                          <td 
                            colSpan={daysInMonth.length + 1} 
                            className="px-4 py-1.5 sticky left-0 z-10"
                          >
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${textColor}`}>
                              {item.label}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    const row = item.row!;
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-muted/30 transition-colors group border-b border-border/30"
                      >
                        <td className="px-4 py-1.5 sticky left-0 bg-card group-hover:bg-muted/30 z-10 border-r border-border">
                          <div 
                            className="text-[11px] font-bold text-foreground leading-tight"
                            style={{ 
                              maxWidth: '160px',
                              wordWrap: 'break-word',
                              whiteSpace: 'normal'
                            }}
                          >
                            {row.crew_name}
                          </div>
                        </td>
                        {daysInMonth.map((d) => {
                          const status = getDayStatus(row, d.dayNum);
                          const toNext = connectsToNext(row, d.dayNum);
                          const fromPrev = connectsFromPrev(row, d.dayNum);

                          // Color coding based on status - solid 3D bars
                          let barClass = "";
                          if (status === "PRIMARY") {
                            // OM/EM Primary - Navy blue-black solid 3D
                            barClass = "bg-gradient-to-b from-slate-600 via-slate-800 to-slate-900 shadow-[0_3px_6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)]";
                          } else if (status === "SECONDARY") {
                            // EM Secondary - Light blue solid 3D
                            barClass = "bg-gradient-to-b from-sky-400 via-sky-500 to-sky-600 shadow-[0_3px_6px_rgba(14,165,233,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]";
                          } else if (status === "OHN_WEEKDAY") {
                            // OHN Weekday - Navy blue-black solid 3D
                            barClass = "bg-gradient-to-b from-slate-600 via-slate-800 to-slate-900 shadow-[0_3px_6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)]";
                          } else if (status === "OHN_WEEKEND") {
                            // OHN Weekend - Medium grey solid 3D
                            barClass = "bg-gradient-to-b from-slate-400 via-slate-500 to-slate-600 shadow-[0_3px_6px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]";
                          }

                          // Continuous bar styling (no gaps)
                          const roundedLeft = !fromPrev ? "rounded-l-sm" : "";
                          const roundedRight = !toNext ? "rounded-r-sm" : "";
                          const marginLeft = fromPrev ? "" : "ml-0.5";
                          const marginRight = toNext ? "" : "mr-0.5";

                          return (
                            <td
                              key={d.dayNum}
                              className={`p-0 h-8 relative ${
                                d.isWeekend ? "bg-muted/20" : ""
                              }`}
                            >
                              {status !== "OFF" && (
                                <div
                                  className={`absolute top-1.5 bottom-1.5 ${roundedLeft} ${roundedRight} ${barClass}`}
                                  style={{
                                    left: fromPrev ? 0 : 1,
                                    right: toNext ? 0 : 1,
                                  }}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 px-6 py-4 bg-slate-900 rounded-xl w-fit shadow-xl border border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-6 h-4 bg-gradient-to-b from-slate-700 to-slate-900 rounded-sm shadow-md" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                Primary / OHN Weekday
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-4 bg-gradient-to-b from-sky-300 to-sky-500 rounded-sm shadow-md" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                EM Secondary
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-4 bg-gradient-to-b from-slate-400 to-slate-500 rounded-sm shadow-md" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                OHN Weekend
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
