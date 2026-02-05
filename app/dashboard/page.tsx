"use client";

import { useState, useMemo, Fragment, useEffect, useRef } from "react";
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
import { motion, AnimatePresence } from "framer-motion";

// East Malaysia SVG Map Component
function EastMalaysiaMap() {
  return (
    <svg
      viewBox="0 0 800 400"
      className="absolute inset-0 w-full h-full opacity-[0.03]"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
    >
      {/* Sabah outline */}
      <path
        d="M450 80 L520 60 L600 70 L680 100 L720 150 L700 200 L650 220 L580 210 L520 180 L480 150 L450 120 Z"
        className="text-cyan-400"
        fill="currentColor"
        fillOpacity="0.1"
      />
      {/* Sarawak outline */}
      <path
        d="M80 180 L150 150 L250 140 L350 160 L420 200 L480 220 L520 260 L500 300 L420 320 L320 310 L220 280 L140 250 L80 220 Z"
        className="text-emerald-400"
        fill="currentColor"
        fillOpacity="0.1"
      />
      {/* Connection line between regions */}
      <path
        d="M480 220 L520 180"
        className="text-slate-600"
        strokeDasharray="4 4"
      />
    </svg>
  );
}

// Animated Leader Line Component
function LeaderLine({ 
  from, 
  to, 
  isActive 
}: { 
  from: { x: number; y: number }; 
  to: { x: number; y: number }; 
  isActive: boolean;
}) {
  if (!isActive) return null;
  
  return (
    <motion.svg
      className="absolute inset-0 w-full h-full pointer-events-none z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.path
        d={`M${from.x},${from.y} Q${(from.x + to.x) / 2},${from.y} ${to.x},${to.y}`}
        stroke="url(#leaderGradient)"
        strokeWidth="2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3 }}
      />
      <defs>
        <linearGradient id="leaderGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}

// 3D Donut Chart Component
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
  const radius = 120;
  const strokeWidth = 40;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  
  const skaPercent = total > 0 ? (ska / total) * 100 : 0;
  const sbaPercent = total > 0 ? (sba / total) * 100 : 0;
  
  const skaStroke = (skaPercent / 100) * circumference;
  const sbaStroke = (sbaPercent / 100) * circumference;

  return (
    <div className="relative">
      {/* Glow Effect */}
      <div className="absolute inset-0 blur-3xl opacity-30">
        <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-500 via-transparent to-emerald-500" />
      </div>
      
      <svg
        height={radius * 2}
        width={radius * 2}
        className="transform -rotate-90 drop-shadow-2xl"
      >
        {/* Background ring */}
        <circle
          stroke="rgba(255,255,255,0.05)"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        
        {/* SBA Segment (Sabah) - Orange/Amber */}
        <motion.circle
          stroke={hoveredSegment === "SBA" ? "#f59e0b" : "#d97706"}
          fill="transparent"
          strokeWidth={hoveredSegment === "SBA" ? strokeWidth + 8 : strokeWidth}
          strokeDasharray={`${sbaStroke} ${circumference}`}
          strokeDashoffset={-skaStroke}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="cursor-pointer transition-all duration-300 drop-shadow-lg"
          style={{
            filter: hoveredSegment === "SBA" ? "drop-shadow(0 0 20px #f59e0b)" : "none",
          }}
          onMouseEnter={() => onSegmentHover("SBA")}
          onMouseLeave={() => onSegmentHover(null)}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${sbaStroke} ${circumference}` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        
        {/* SKA Segment (Sarawak) - Cyan */}
        <motion.circle
          stroke={hoveredSegment === "SKA" ? "#22d3ee" : "#06b6d4"}
          fill="transparent"
          strokeWidth={hoveredSegment === "SKA" ? strokeWidth + 8 : strokeWidth}
          strokeDasharray={`${skaStroke} ${circumference}`}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="cursor-pointer transition-all duration-300 drop-shadow-lg"
          style={{
            filter: hoveredSegment === "SKA" ? "drop-shadow(0 0 20px #06b6d4)" : "none",
          }}
          onMouseEnter={() => onSegmentHover("SKA")}
          onMouseLeave={() => onSegmentHover(null)}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${skaStroke} ${circumference}` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      
      {/* Center Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            className="text-5xl font-black text-white tabular-nums"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.5 }}
            style={{
              textShadow: "0 0 40px rgba(6, 182, 212, 0.5), 0 0 80px rgba(6, 182, 212, 0.3)",
            }}
          >
            {total}
          </motion.div>
          <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.3em] mt-1">
            Total POB
          </div>
        </div>
      </div>
    </div>
  );
}

// Trade Panel Component
function TradePanel({
  client,
  personnel,
  systemDate,
  hoveredTrade,
  onTradeHover,
  isVisible,
}: {
  client: "SKA" | "SBA";
  personnel: RosterRow[];
  systemDate: Date;
  hoveredTrade: string | null;
  onTradeHover: (trade: string | null) => void;
  isVisible: boolean;
}) {
  const omCount = personnel.filter((p) => p.post?.includes("OFFSHORE")).length;
  const emCount = personnel.filter((p) => p.post?.includes("ESCORT")).length;
  const ohnCount = personnel.filter((p) => p.post?.includes("IM") || p.post?.includes("OHN")).length;

  const trades = [
    { code: "OM", name: "Offshore Medic", count: omCount, color: "from-blue-500 to-blue-600" },
    { code: "EM", name: "Escort Medic", count: emCount, color: "from-emerald-500 to-emerald-600" },
    { code: "OHN", name: "IMP / OHN", count: ohnCount, color: "from-amber-500 to-amber-600" },
  ];

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: client === "SKA" ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: client === "SKA" ? -20 : 20 }}
      className={`absolute top-1/2 -translate-y-1/2 ${
        client === "SKA" ? "left-0" : "right-0"
      }`}
    >
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700/50">
          <div className={`w-2 h-2 rounded-full ${client === "SKA" ? "bg-cyan-400" : "bg-amber-400"}`} />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            {client === "SKA" ? "Sarawak" : "Sabah"}
          </span>
          <span className="text-lg font-black text-white ml-auto tabular-nums">
            {personnel.length}
          </span>
        </div>
        
        <div className="space-y-2">
          {trades.map((trade) => (
            <motion.div
              key={trade.code}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                hoveredTrade === `${client}-${trade.code}`
                  ? "bg-slate-800/80 ring-1 ring-cyan-500/50"
                  : "hover:bg-slate-800/50"
              }`}
              onMouseEnter={() => onTradeHover(`${client}-${trade.code}`)}
              onMouseLeave={() => onTradeHover(null)}
              whileHover={{ scale: 1.02 }}
            >
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${trade.color} flex items-center justify-center`}>
                <span className="text-[10px] font-black text-white">{trade.code}</span>
              </div>
              <div className="flex-1">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">{trade.name}</div>
              </div>
              <div className="text-lg font-black text-white tabular-nums">{trade.count}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Staff Detail Callout Component
function StaffCallout({
  client,
  tradeCode,
  personnel,
  systemDate,
  isVisible,
}: {
  client: "SKA" | "SBA";
  tradeCode: string;
  personnel: RosterRow[];
  systemDate: Date;
  isVisible: boolean;
}) {
  const filteredStaff = personnel.filter((p) => {
    const matchClient = p.client === client;
    const matchTrade =
      (tradeCode === "OM" && p.post?.includes("OFFSHORE")) ||
      (tradeCode === "EM" && p.post?.includes("ESCORT")) ||
      (tradeCode === "OHN" && (p.post?.includes("IM") || p.post?.includes("OHN")));
    return matchClient && matchTrade;
  });

  if (!isVisible || filteredStaff.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-50"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${client === "SKA" ? "bg-cyan-400" : "bg-amber-400"}`} />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              {client === "SKA" ? "Sarawak" : "Sabah"} - {tradeCode}
            </span>
          </div>
          <span className="text-xs text-slate-400">{filteredStaff.length} Personnel</span>
        </div>
        
        <div className="max-h-48 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
          {filteredStaff.map((person) => {
            const days = getDaysOnBoard(person, systemDate);
            const range = getActiveRotationRange(person, systemDate);
            const isOHN = person.post?.includes("IM") || person.post?.includes("OHN");
            
            return (
              <div
                key={person.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{person.crew_name}</div>
                  <div className="text-[10px] text-slate-400">{person.location}</div>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Days on Board */}
                  <div className="text-center">
                    <div className={`text-sm font-bold tabular-nums ${days >= 14 ? "text-red-400" : "text-white"}`}>
                      {isOHN ? "-" : days > 0 ? days : "-"}
                    </div>
                    <div className="text-[8px] text-slate-500 uppercase">Days</div>
                  </div>
                  
                  {/* Status Badge */}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <span className="text-[9px] font-bold text-emerald-400 uppercase">Onsite</span>
                  </div>
                  
                  {/* Rotation Period */}
                  <div className="text-right min-w-[100px]">
                    {isOHN ? (
                      <span className="text-[10px] text-slate-500 italic">Weekdays</span>
                    ) : range.start ? (
                      <span className="text-[10px] text-cyan-400 tabular-nums">
                        {formatDate(range.start)} - {formatDate(range.end)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">-</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// Compact Table Component
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
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
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
                      <td colSpan={8} className="px-4 py-2">
                        <span className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide ${
                          row.client === "SKA" ? "text-cyan-400" : "text-amber-400"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${row.client === "SKA" ? "bg-cyan-400" : "bg-amber-400"}`} />
                          {row.client === "SKA" ? "Sarawak" : "Sabah"} - {tradeName}
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
                        row.client === "SKA" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
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
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <motion.div
                          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase">Onsite</span>
                      </div>
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
                <td colSpan={8} className="px-4 py-12 text-center">
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
      <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-3xl overflow-hidden relative">
        {/* Background Map */}
        <EastMalaysiaMap />
        
        {/* Grid Pattern Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Header */}
        <div className="relative z-10 p-6 border-b border-slate-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-black text-white uppercase tracking-wider">
                  POB Command Center
                </h1>
                <p className="text-xs text-slate-400">Personnel On Board - Real-time Deployment Status</p>
              </div>
            </div>

            {/* Date Picker */}
            <div className="flex items-center gap-3">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">System Date</div>
                <input
                  type="date"
                  value={systemDate.toISOString().split("T")[0]}
                  onChange={(e) => setSystemDate(new Date(e.target.value))}
                  className="bg-transparent text-white text-sm font-bold outline-none cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => setSystemDate(new Date(2025, 11, 31))}
                className="px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {viewMode === "hud" ? (
            <motion.div
              key="hud"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 p-6"
            >
              {/* HUD Main Content */}
              <div className="relative min-h-[500px] flex items-center justify-center">
                {/* SKA Trade Panel (Left) */}
                <AnimatePresence>
                  <TradePanel
                    client="SKA"
                    personnel={skaPersonnel}
                    systemDate={systemDate}
                    hoveredTrade={hoveredTrade}
                    onTradeHover={setHoveredTrade}
                    isVisible={hoveredSegment === "SKA" || hoveredSegment === null}
                  />
                </AnimatePresence>

                {/* Center Donut */}
                <div className="relative">
                  <DonutChart
                    total={stats.total}
                    ska={stats.ska}
                    sba={stats.sba}
                    onSegmentHover={setHoveredSegment}
                    hoveredSegment={hoveredSegment}
                  />
                  
                  {/* Legend */}
                  <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50" />
                      <span className="text-xs font-bold text-slate-400">SKA (Sarawak)</span>
                      <span className="text-sm font-black text-white tabular-nums">{stats.ska}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" />
                      <span className="text-xs font-bold text-slate-400">SBA (Sabah)</span>
                      <span className="text-sm font-black text-white tabular-nums">{stats.sba}</span>
                    </div>
                  </div>
                </div>

                {/* SBA Trade Panel (Right) */}
                <AnimatePresence>
                  <TradePanel
                    client="SBA"
                    personnel={sbaPersonnel}
                    systemDate={systemDate}
                    hoveredTrade={hoveredTrade}
                    onTradeHover={setHoveredTrade}
                    isVisible={hoveredSegment === "SBA" || hoveredSegment === null}
                  />
                </AnimatePresence>

                {/* Staff Callout */}
                <AnimatePresence>
                  {hoveredTrade && (
                    <StaffCallout
                      client={hoveredTrade.split("-")[0] as "SKA" | "SBA"}
                      tradeCode={hoveredTrade.split("-")[1]}
                      personnel={filteredPersonnel}
                      systemDate={systemDate}
                      isVisible={!!hoveredTrade}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Show Full List Button */}
              <div className="flex justify-center mt-20">
                <motion.button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-2xl text-white font-bold uppercase tracking-wider shadow-lg shadow-cyan-500/30 transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Show Full List
                  <svg className="w-4 h-4 group-hover:translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </motion.button>
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
              <div className="flex justify-between items-center mb-6">
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
                
                <div className="text-sm text-slate-400">
                  Showing <span className="text-white font-bold">{filteredPersonnel.length}</span> personnel for {formatDateLong(systemDate)}
                </div>
              </div>

              {/* Compact Table */}
              <CompactTable personnel={filteredPersonnel} systemDate={systemDate} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="relative z-10 p-4 border-t border-slate-800/50 mt-auto">
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Viewing: {formatDateLong(systemDate)}</span>
            <div className="flex items-center gap-1">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span>System Online</span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
