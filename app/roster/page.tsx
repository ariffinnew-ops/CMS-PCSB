"use client";

import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow, ClientType, TradeType } from "@/lib/types";
import { getRosterData } from "@/lib/actions";
import { safeParseDate, getTradeRank, getFullTradeName } from "@/lib/logic";

// Generate months from Sep 2025 to Dec 2026
const generateMonthRange = () => {
  const months = [];
  for (let year = 2025; year <= 2026; year++) {
    const startMonth = year === 2025 ? 8 : 0;
    const endMonth = year === 2026 ? 11 : 11;
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
  const [viewDate, setViewDate] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
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

  const hasActivityInMonth = (row: RosterRow) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0).getTime();
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

    if (row.post?.includes("IM") || row.post?.includes("OHN")) {
      return true;
    }

    for (let i = 1; i <= 24; i++) {
      const m = safeParseDate(row[`m${i}`] as string);
      const d = safeParseDate(row[`d${i}`] as string);
      if (m && d) {
        const rotationStart = m.getTime();
        const rotationEnd = d.getTime();
        if (rotationStart <= monthEnd && rotationEnd >= monthStart) {
          return true;
        }
      }
    }
    return false;
  };

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
        const hasActivity = hasActivityInMonth(row);
        return matchesClient && matchesTrade && hasActivity;
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
  }, [data, clientFilter, tradeFilter, viewDate]);

  // Get display name with relief suffix for duplicate crew_ids
  const getDisplayName = (row: RosterRow) => {
    if (!row.crew_id) return row.crew_name;
    const sameCrewRows = data.filter((r) => r.crew_id === row.crew_id);
    if (sameCrewRows.length <= 1) return row.crew_name;
    const idx = sameCrewRows.findIndex((r) => r.id === row.id);
    if (idx === 0) return row.crew_name;
    if (idx === 1) return `${row.crew_name} (R)`;
    return `${row.crew_name} (R${idx})`;
  };

  const groupedData = useMemo(() => {
    const result: { type: 'separator' | 'row'; label?: string; row?: RosterRow; trade?: string }[] = [];
    let lastGroupKey = "";
    
    sortedData.forEach((row) => {
      const tradeFull = getFullTradeName(row.post);
      const groupKey = `${row.client}-${tradeFull}-${row.location}`;
      
      if (groupKey !== lastGroupKey) {
        result.push({
          type: 'separator',
          label: `${row.client} - ${tradeFull} - ${row.location}`,
          trade: tradeFull
        });
        lastGroupKey = groupKey;
      }
      
      result.push({ type: 'row', row, trade: tradeFull });
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

    if (row.post?.includes("IM") || row.post?.includes("OHN")) {
      if (dayOfWeek === 0 || dayOfWeek === 6) return "OHN_WEEKEND";
      return "OHN_WEEKDAY";
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

  const getConnectStatus = (row: RosterRow, day: number) => {
    const status = getDayStatus(row, day);
    if (status === "OHN_WEEKDAY" || status === "OHN_WEEKEND") return "OHN";
    return status;
  };

  const connectsToNext = (row: RosterRow, day: number) => {
    if (day >= daysInMonth.length) return false;
    const currentStatus = getConnectStatus(row, day);
    const nextStatus = getConnectStatus(row, day + 1);
    return currentStatus !== "OFF" && nextStatus !== "OFF";
  };

  const connectsFromPrev = (row: RosterRow, day: number) => {
    if (day <= 1) return false;
    const currentStatus = getConnectStatus(row, day);
    const prevStatus = getConnectStatus(row, day - 1);
    return currentStatus !== "OFF" && prevStatus !== "OFF";
  };

  return (
    <AppShell>
      <style jsx>{`
        @keyframes barSlideIn {
          from {
            transform: scaleX(0);
            transform-origin: left center;
          }
          to {
            transform: scaleX(1);
            transform-origin: left center;
          }
        }
        .gantt-bar {
          animation: barSlideIn 0.8s ease-out forwards;
        }
      `}</style>
      
      <div className="space-y-4 animate-in fade-in duration-500 mt-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none">
              ROTATION MAP
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Period:
              </span>
              <select
                value={`${viewDate.getFullYear()}-${viewDate.getMonth()}`}
                onChange={(e) => {
                  const [year, month] = e.target.value.split('-').map(Number);
                  setViewDate(new Date(year, month, 1));
                }}
                className="text-[11px] font-bold text-blue-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg outline-none cursor-pointer uppercase shadow-sm"
              >
                {MONTH_RANGE.map(({ year, month }) => (
                  <option key={`${year}-${month}`} value={`${year}-${month}`}>
                    {MONTH_NAMES[month]} {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-200">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value as ClientType | "ALL")}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 uppercase outline-none"
            >
              <option value="ALL">All Clients</option>
              <option value="SKA">SKA</option>
              <option value="SBA">SBA</option>
            </select>
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value as TradeType | "ALL")}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 uppercase outline-none"
            >
              <option value="ALL">All Trades</option>
              <option value="OM">OFFSHORE MEDIC</option>
              <option value="EM">ESCORT MEDIC</option>
              <option value="IMP/OHN">OHN</option>
            </select>
            {(clientFilter !== "ALL" || tradeFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => { setClientFilter("ALL"); setTradeFilter("ALL"); }}
                className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[9px] uppercase tracking-wider transition-all border border-red-200"
              >
                Reset All
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: '100%' }}>
              <thead>
                <tr className="bg-slate-100">
                  <th className="px-3 py-2 w-48 min-w-[192px] text-left sticky left-0 bg-slate-200 z-20 border-r border-gray-300">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                      Crew / Trade
                    </span>
                  </th>
                  {daysInMonth.map((d) => (
                    <th
                      key={d.dayNum}
                      className={`px-0 py-1.5 text-center w-[26px] min-w-[26px] max-w-[26px] border-r border-gray-200 ${
                        d.isWeekend ? "bg-gray-100" : "bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-col items-center leading-none">
                        <span className="text-[10px] font-bold text-slate-500">
                          {d.dayName}
                        </span>
                        <span className="text-[12px] font-black text-slate-700 tabular-nums">
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
                    <td colSpan={daysInMonth.length + 1} className="text-center py-8 bg-white">
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
                        <span className="text-xs text-slate-500">Loading...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  groupedData.map((item, idx) => {
                    if (item.type === 'separator') {
                      return (
                        <tr key={`sep-${idx}`} className="bg-slate-300">
                          <td 
                            colSpan={daysInMonth.length + 1} 
                            className="px-3 sticky left-0 z-10 border-t-2 border-b-2 border-white bg-slate-300"
                            style={{ height: '24px' }}
                          >
                            <div className="flex items-center h-full">
                              <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                                {item.label}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const row = item.row!;
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-blue-50/50 transition-colors group border-b border-gray-300"
                        style={{ height: '28px' }}
                      >
                        <td className="px-3 py-0 sticky left-0 bg-slate-100 group-hover:bg-blue-100/50 z-10 border-r border-gray-300 w-48 min-w-[192px]">
                          <div 
                            className="text-[10px] font-semibold text-slate-700 leading-tight truncate"
                            title={getDisplayName(row)}
                          >
                            {getDisplayName(row)}
                          </div>
                        </td>
                        {daysInMonth.map((d) => {
                          const status = getDayStatus(row, d.dayNum);
                          const toNext = connectsToNext(row, d.dayNum);
                          const fromPrev = connectsFromPrev(row, d.dayNum);

                          let barClass = "";
                          if (status === "PRIMARY" || status === "OHN_WEEKDAY") {
                            barClass = "bg-blue-500";
                          } else if (status === "SECONDARY") {
                            barClass = "bg-sky-300";
                          } else if (status === "OHN_WEEKEND") {
                            barClass = "bg-slate-400";
                          }

                          const roundedLeft = !fromPrev ? "rounded-l-sm" : "";
                          const roundedRight = !toNext ? "rounded-r-sm" : "";

                          return (
                            <td
                              key={d.dayNum}
                              className={`p-0 relative w-[26px] min-w-[26px] max-w-[26px] ${
                                d.isWeekend ? "bg-gray-50" : "bg-white"
                              }`}
                              style={{ height: '28px' }}
                            >
                              <div className="absolute inset-y-0 right-0 w-px bg-gray-300 z-0" />
                              
                              {status !== "OFF" && (
                                <div
                                  className={`absolute z-10 gantt-bar ${roundedLeft} ${roundedRight} ${barClass}`}
                                  style={{
                                    top: '4px',
                                    bottom: '4px',
                                    left: fromPrev ? 0 : 0,
                                    right: toNext ? 0 : 0,
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

        <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-white rounded-lg w-fit shadow-sm border border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-5 h-3 bg-blue-500 rounded-sm" />
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">
              Primary / OHN Weekday
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-3 bg-sky-300 rounded-sm" />
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">
              EM Secondary
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-3 bg-slate-400 rounded-sm" />
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">
              OHN Weekend
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
