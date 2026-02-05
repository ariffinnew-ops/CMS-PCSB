"use client";

import { useState, useMemo, Fragment, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow } from "@/lib/types";
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
import { motion, AnimatePresence } from "framer-motion";

// 3D Donut Chart Component - Heavy 3D effect with SBA RIGHT, SKA LEFT
function DonutChart({
  total,
  ska,
  sba,
  onSegmentHover,
  hoveredSegment,
}: {
  total: number;
  ska: number;
  sba: number;
  onSegmentHover: (segment: "SKA" | "SBA" | null) => void;
  hoveredSegment: "SKA" | "SBA" | null;
}) {
  const radius = 140;
  const strokeWidth = 50;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  
  const skaPercent = total > 0 ? (ska / total) * 100 : 50;
  const sbaPercent = total > 0 ? (sba / total) * 100 : 50;
  
  const skaStroke = (skaPercent / 100) * circumference;
  const sbaStroke = (sbaPercent / 100) * circumference;

  return (
    <div className="relative">
      {/* Heavy 3D Shadow Layers */}
      <div className="absolute inset-0 blur-3xl opacity-50">
        <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-600 via-transparent to-emerald-600" />
      </div>
      <div className="absolute inset-2 blur-2xl opacity-30">
        <div className="w-full h-full rounded-full bg-gradient-to-tr from-cyan-500 to-green-500" />
      </div>
      
      <svg
        height={radius * 2}
        width={radius * 2}
        className="transform rotate-90 drop-shadow-2xl"
        style={{
          filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5)) drop-shadow(0 10px 20px rgba(0,0,0,0.3))",
        }}
      >
        {/* Background ring with 3D depth */}
        <circle
          stroke="rgba(0,0,0,0.3)"
          fill="transparent"
          strokeWidth={strokeWidth + 4}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke="rgba(255,255,255,0.03)"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        
        {/* SKA Segment (LEFT side) - Neon Blue */}
        <motion.circle
          stroke={hoveredSegment === "SKA" ? "#00d4ff" : "#0ea5e9"}
          fill="transparent"
          strokeWidth={hoveredSegment === "SKA" ? strokeWidth + 12 : strokeWidth}
          strokeDasharray={`${skaStroke} ${circumference}`}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="cursor-pointer transition-all duration-300"
          style={{
            filter: hoveredSegment === "SKA" 
              ? "drop-shadow(0 0 30px #00d4ff) drop-shadow(0 0 60px #0ea5e9)" 
              : "drop-shadow(0 0 10px rgba(14, 165, 233, 0.5))",
          }}
          onMouseEnter={() => onSegmentHover("SKA")}
          onMouseLeave={() => onSegmentHover(null)}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${skaStroke} ${circumference}` }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
        
        {/* SBA Segment (RIGHT side) - Neon Emerald */}
        <motion.circle
          stroke={hoveredSegment === "SBA" ? "#00ff88" : "#10b981"}
          fill="transparent"
          strokeWidth={hoveredSegment === "SBA" ? strokeWidth + 12 : strokeWidth}
          strokeDasharray={`${sbaStroke} ${circumference}`}
          strokeDashoffset={-skaStroke}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="cursor-pointer transition-all duration-300"
          style={{
            filter: hoveredSegment === "SBA" 
              ? "drop-shadow(0 0 30px #00ff88) drop-shadow(0 0 60px #10b981)" 
              : "drop-shadow(0 0 10px rgba(16, 185, 129, 0.5))",
          }}
          onMouseEnter={() => onSegmentHover("SBA")}
          onMouseLeave={() => onSegmentHover(null)}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${sbaStroke} ${circumference}` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      
      {/* Center Content - Total POB */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            className="text-6xl font-black text-white tabular-nums"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", delay: 0.5 }}
            style={{
              textShadow: "0 0 40px rgba(255,255,255,0.3), 0 0 80px rgba(14, 165, 233, 0.4)",
            }}
          >
            {total}
          </motion.div>
          <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-[0.4em] mt-1">
            Total POB
          </div>
        </div>
      </div>
    </div>
  );
}

// Trade Panel with Name List Popover
function TradePanel({
  client,
  personnel,
  systemDate,
  hoveredTrade,
  onTradeHover,
}: {
  client: "SKA" | "SBA";
  personnel: RosterRow[];
  systemDate: Date;
  hoveredTrade: string | null;
  onTradeHover: (trade: string | null) => void;
}) {
  const omList = personnel.filter((p) => p.post?.includes("OFFSHORE"));
  const emList = personnel.filter((p) => p.post?.includes("ESCORT"));
  const ohnList = personnel.filter((p) => p.post?.includes("IM") || p.post?.includes("OHN"));

  const trades = [
    { code: "OM", name: "Offshore Medic", list: omList, color: "from-blue-500 to-blue-600", textColor: "text-blue-400" },
    { code: "EM", name: "Escort Medic", list: emList, color: "from-emerald-500 to-emerald-600", textColor: "text-emerald-400" },
    { code: "OHN", name: "IMP / OHN", list: ohnList, color: "from-amber-500 to-amber-600", textColor: "text-amber-400" },
  ];

  return (
    <div className="relative">
      <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl min-w-[180px]">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700/50">
          <div className={`w-3 h-3 rounded-full ${client === "SKA" ? "bg-cyan-400 shadow-lg shadow-cyan-400/50" : "bg-emerald-400 shadow-lg shadow-emerald-400/50"}`} />
          <span className="text-sm font-black text-white uppercase tracking-wider">
            {client}
          </span>
          <span className="text-2xl font-black text-white ml-auto tabular-nums">
            {personnel.length}
          </span>
        </div>
        
        {/* Trade Rows */}
        <div className="space-y-2">
          {trades.map((trade) => (
            <div key={trade.code} className="relative">
              <motion.div
                className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all ${
                  hoveredTrade === `${client}-${trade.code}`
                    ? "bg-slate-800/90 ring-2 ring-cyan-500/50"
                    : "hover:bg-slate-800/50"
                }`}
                onMouseEnter={() => onTradeHover(`${client}-${trade.code}`)}
                onMouseLeave={() => onTradeHover(null)}
                whileHover={{ scale: 1.02 }}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${trade.color} flex items-center justify-center shadow-lg`}>
                  <span className="text-[11px] font-black text-white">{trade.code}</span>
                </div>
                <div className="flex-1">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wide">{trade.name}</div>
                </div>
                <div className="text-xl font-black text-white tabular-nums">{trade.list.length}</div>
              </motion.div>

              {/* Name List Popover - Glassmorphism, No Scroll, 2 Columns */}
              <AnimatePresence>
                {hoveredTrade === `${client}-${trade.code}` && trade.list.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute z-[100] ${client === "SKA" ? "left-full ml-4" : "right-full mr-4"} top-0 min-w-[400px] max-w-[600px]`}
                  >
                    <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-600/50 rounded-2xl shadow-2xl overflow-hidden">
                      <div className={`px-4 py-2 border-b border-slate-700/50 ${client === "SKA" ? "bg-cyan-950/50" : "bg-emerald-950/50"}`}>
                        <span className={`text-xs font-bold uppercase tracking-wider ${trade.textColor}`}>
                          {client} - {trade.name}
                        </span>
                        <span className="text-xs text-slate-400 ml-2">({trade.list.length})</span>
                      </div>
                      <div className={`p-3 ${trade.list.length > 6 ? "grid grid-cols-2 gap-x-4 gap-y-1" : "space-y-1"}`}>
                        {trade.list.map((person) => {
                          const days = getDaysOnBoard(person, systemDate);
                          const range = getActiveRotationRange(person, systemDate);
                          const isOHN = person.post?.includes("IM") || person.post?.includes("OHN");
                          
                          return (
                            <div
                              key={person.id}
                              className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-slate-800/50"
                            >
                              <span className="font-semibold text-white truncate flex-shrink min-w-0 max-w-[120px]">
                                {person.crew_name}
                              </span>
                              <span className="text-slate-500">-</span>
                              <span className={`font-bold tabular-nums ${days >= 14 ? "text-red-400" : "text-cyan-400"}`}>
                                {isOHN ? "-" : days > 0 ? `${days}d` : "-"}
                              </span>
                              <span className="text-slate-500">-</span>
                              <span className="text-slate-400 tabular-nums whitespace-nowrap">
                                {isOHN ? "Weekdays" : range.start ? `${formatDate(range.start)}-${formatDate(range.end)}` : "-"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Compact Table Component for Full List View
function CompactTable({
  personnel,
  systemDate,
}: {
  personnel: RosterRow[];
  systemDate: Date;
}) {
  let currentTradeCounter = 0;

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-700/50">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Location</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Days</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Rotation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {personnel.map((row, idx) => {
              const prev = personnel[idx - 1];
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
                    <tr className="bg-slate-800/30">
                      <td colSpan={7} className="px-4 py-2">
                        <span className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide ${
                          row.client === "SKA" ? "text-cyan-400" : "text-emerald-400"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${row.client === "SKA" ? "bg-cyan-400" : "bg-emerald-400"}`} />
                          {row.client} - {tradeName}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums">{currentTradeCounter}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-white">{row.crew_name}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                        tradeName === "OFFSHORE MEDIC" 
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
                          : tradeName === "ESCORT MEDIC"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}>
                        {tradeName === "OFFSHORE MEDIC" ? "OM" : tradeName === "ESCORT MEDIC" ? "EM" : "OHN"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{row.location}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                        row.client === "SKA" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}>
                        {row.client}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-sm font-semibold tabular-nums ${
                        days >= 14 ? "text-red-400" : "text-white"
                      }`}>
                        {isOHN ? "-" : days > 0 ? days : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isOHN ? (
                        <span className="text-xs text-slate-500 italic">Weekdays</span>
                      ) : range.start ? (
                        <span className="text-xs text-cyan-400 tabular-nums">
                          {formatDate(range.start)} - {formatDate(range.end)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {personnel.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <p className="text-sm text-slate-500">No personnel on board for selected date</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [systemDate, setSystemDate] = useState(new Date(2025, 11, 31));
  const [data, setData] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"hud" | "list">("hud");
  const [hoveredSegment, setHoveredSegment] = useState<"SKA" | "SBA" | null>(null);
  const [hoveredTrade, setHoveredTrade] = useState<string | null>(null);

  useEffect(() => {
    getRosterData().then((rosterData) => {
      setData(rosterData);
      setLoading(false);
    });
  }, []);

  const filteredPersonnel = useMemo(() => {
    return data
      .filter((row) => isPersonnelOnBoard(row, systemDate))
      .sort((a, b) => {
        if (a.client !== b.client) return a.client.localeCompare(b.client);
        const rankA = getTradeRank(a.post);
        const rankB = getTradeRank(b.post);
        if (rankA !== rankB) return rankA - rankB;
        if (a.location !== b.location)
          return a.location.localeCompare(b.location);
        return a.crew_name.localeCompare(b.crew_name);
      });
  }, [data, systemDate]);

  const stats = useMemo(
    () => ({
      total: filteredPersonnel.length,
      ska: filteredPersonnel.filter((p) => p.client === "SKA").length,
      sba: filteredPersonnel.filter((p) => p.client === "SBA").length,
    }),
    [filteredPersonnel]
  );

  const skaPersonnel = useMemo(
    () => filteredPersonnel.filter((p) => p.client === "SKA"),
    [filteredPersonnel]
  );

  const sbaPersonnel = useMemo(
    () => filteredPersonnel.filter((p) => p.client === "SBA"),
    [filteredPersonnel]
  );

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <motion.div
            className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div 
        className="min-h-[calc(100vh-80px)] rounded-3xl overflow-hidden relative"
        style={{
          backgroundImage: `url(https://image2url.com/r2/default/images/1770311131560-2493d85c-5fef-4dbd-96b2-5c844492a9aa.jpg)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm" />
        
        {/* Grid Pattern Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        <AnimatePresence mode="wait">
          {viewMode === "hud" ? (
            <motion.div
              key="hud"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 h-full flex flex-col"
            >
              {/* Compact Header with Title */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/50">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-emerald-500"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                    Live POB Status
                  </span>
                </div>
                
                {/* Title - Top Right */}
                <div className="text-right">
                  <h1 
                    className="text-lg font-black text-white uppercase tracking-[0.2em]"
                    style={{ fontFamily: "'Orbitron', 'Rajdhani', sans-serif" }}
                  >
                    PROVISION OF IMS - PCSB
                  </h1>
                </div>
              </div>

              {/* Main HUD Content - Compact */}
              <div className="flex-1 flex flex-col items-center justify-start pt-4 px-6">
                {/* Date Picker - Above Donut */}
                <div className="mb-4">
                  <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl px-6 py-3 flex items-center gap-4">
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider">System Date</div>
                    <input
                      type="date"
                      value={systemDate.toISOString().split("T")[0]}
                      onChange={(e) => setSystemDate(new Date(e.target.value))}
                      className="bg-transparent text-white text-sm font-bold outline-none cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setSystemDate(new Date(2025, 11, 31))}
                      className="px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white transition-all"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* HUD Layout: SKA (Left) - Donut (Center) - SBA (Right) */}
                <div className="flex items-center justify-center gap-8 w-full max-w-6xl">
                  {/* SKA Panel - LEFT */}
                  <div className="flex-shrink-0">
                    {/* Leader Line SVG */}
                    <svg className="absolute w-20 h-2 top-1/2 -translate-y-1/2" style={{ left: 'calc(50% - 220px)', transform: 'translateY(-50%)' }}>
                      <motion.line
                        x1="0" y1="50%" x2="100%" y2="50%"
                        stroke="url(#skaGradient)"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1, delay: 0.5 }}
                      />
                      <defs>
                        <linearGradient id="skaGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.8" />
                          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.2" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <TradePanel
                      client="SKA"
                      personnel={skaPersonnel}
                      systemDate={systemDate}
                      hoveredTrade={hoveredTrade}
                      onTradeHover={setHoveredTrade}
                    />
                  </div>

                  {/* Center Donut */}
                  <div className="relative flex-shrink-0">
                    <DonutChart
                      total={stats.total}
                      ska={stats.ska}
                      sba={stats.sba}
                      onSegmentHover={setHoveredSegment}
                      hoveredSegment={hoveredSegment}
                    />
                  </div>

                  {/* SBA Panel - RIGHT */}
                  <div className="flex-shrink-0">
                    {/* Leader Line SVG */}
                    <svg className="absolute w-20 h-2 top-1/2" style={{ right: 'calc(50% - 220px)', transform: 'translateY(-50%)' }}>
                      <motion.line
                        x1="0" y1="50%" x2="100%" y2="50%"
                        stroke="url(#sbaGradient)"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1, delay: 0.5 }}
                      />
                      <defs>
                        <linearGradient id="sbaGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <TradePanel
                      client="SBA"
                      personnel={sbaPersonnel}
                      systemDate={systemDate}
                      hoveredTrade={hoveredTrade}
                      onTradeHover={setHoveredTrade}
                    />
                  </div>
                </div>

                {/* Show Full List Button */}
                <div className="mt-8">
                  <motion.button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className="group flex items-center gap-3 px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-2xl text-white font-bold text-sm uppercase tracking-wider shadow-lg shadow-cyan-500/30 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    Show Full List
                    <svg className="w-4 h-4 group-hover:translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </motion.button>
                </div>
              </div>

              {/* Compact Footer */}
              <div className="px-6 py-2 border-t border-slate-800/50 flex items-center justify-between text-[9px] text-slate-500">
                <span>Viewing: {formatDateLong(systemDate)}</span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50" />
                    <span>SKA: {stats.ska}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                    <span>SBA: {stats.sba}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="relative z-10 p-6"
            >
              {/* Back to HUD Button */}
              <div className="flex justify-between items-center mb-4">
                <motion.button
                  type="button"
                  onClick={() => setViewMode("hud")}
                  className="group flex items-center gap-3 px-6 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-xl text-white font-bold uppercase tracking-wider transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to HUD
                </motion.button>
                
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-400">
                    <span className="text-white font-bold">{filteredPersonnel.length}</span> personnel for {formatDateLong(systemDate)}
                  </span>
                  <h2 className="text-lg font-black text-white uppercase tracking-[0.2em]">
                    PROVISION OF IMS - PCSB
                  </h2>
                </div>
              </div>

              {/* Compact Table */}
              <CompactTable personnel={filteredPersonnel} systemDate={systemDate} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
