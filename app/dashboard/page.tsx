"use client";

import { useState, useMemo, Fragment, useEffect, useRef, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow } from "@/lib/types";
import { getPivotedRosterData, getOHNStaffFromMaster } from "@/lib/actions";
import { useProject } from "@/hooks/use-project";
import { SyncingPlaceholder } from "@/components/syncing-placeholder";
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
  const radius = 120;
  const strokeWidth = 44;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  
  const skaPercent = total > 0 ? (ska / total) * 100 : 50;
  const sbaPercent = total > 0 ? (sba / total) * 100 : 50;
  
  const skaStroke = (skaPercent / 100) * circumference;
  const sbaStroke = (sbaPercent / 100) * circumference;

  return (
    <div className="relative">
      {/* Heavy 3D Shadow Layers - Blue and Orange */}
      <div className="absolute inset-0 blur-3xl opacity-60">
        <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-600 via-transparent to-orange-500" />
      </div>
      <div className="absolute inset-2 blur-2xl opacity-40">
        <div className="w-full h-full rounded-full bg-gradient-to-tr from-blue-500 to-orange-400" />
      </div>
      
      <svg
        height={radius * 2}
        width={radius * 2}
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
      >
        {/* Defs MUST be direct child of svg, not inside transformed g */}
        <defs>
          <linearGradient id="skaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="sbaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>

        <g transform={`rotate(-90 ${radius} ${radius})`}>
          {/* Background ring */}
          <circle
            stroke="rgba(0,0,0,0.3)"
            fill="transparent"
            strokeWidth={strokeWidth + 4}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            stroke="rgba(255,255,255,0.05)"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          
          {/* SKA Segment - Blue */}
          <circle
            stroke="#2563eb"
            fill="transparent"
            strokeWidth={hoveredSegment === "SKA" ? strokeWidth + 10 : strokeWidth}
            strokeDasharray={`${skaStroke} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="cursor-pointer"
            style={{ transition: "stroke-width 0.3s ease" }}
            onMouseEnter={() => onSegmentHover("SKA")}
            onMouseLeave={() => onSegmentHover(null)}
          />
          
          {/* SBA Segment - Orange */}
          <circle
            stroke="#f97316"
            fill="transparent"
            strokeWidth={hoveredSegment === "SBA" ? strokeWidth + 10 : strokeWidth}
            strokeDasharray={`${sbaStroke} ${circumference}`}
            strokeDashoffset={-skaStroke}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="cursor-pointer"
            style={{ transition: "stroke-width 0.3s ease" }}
            onMouseEnter={() => onSegmentHover("SBA")}
            onMouseLeave={() => onSegmentHover(null)}
          />
        </g>
      </svg>
      
      {/* Center Content - Total POB */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            className="text-5xl font-black text-white tabular-nums"
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

// Trade Panel - Just the panel, popover is rendered separately at page level
function TradePanel({
  client,
  personnel,
  hoveredTrade,
  onTradeHover,
}: {
  client: "SKA" | "SBA";
  personnel: PivotedCrewRow[];
  hoveredTrade: string | null;
  onTradeHover: (trade: string | null) => void;
}) {
  const omList = personnel.filter((p) => p.post?.includes("OFFSHORE"));
  const emList = personnel.filter((p) => p.post?.includes("ESCORT"));
  const ohnList = personnel.filter((p) => p.post?.includes("IM") || p.post?.includes("OHN"));

  const trades = [
    { code: "OM", name: "Offshore Medic", list: omList, color: "from-blue-500 to-blue-600" },
    { code: "EM", name: "Escort Medic", list: emList, color: "from-emerald-500 to-emerald-600" },
    { code: "OHN", name: "IMP / OHN", list: ohnList, color: "from-amber-500 to-amber-600" },
  ];

  return (
    <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-600/50 rounded-2xl p-2.5 sm:p-4 shadow-2xl sm:min-w-[180px]">
      {/* Header */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 pb-1.5 sm:pb-2 border-b border-slate-700/50">
        <div className={`w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full ${client === "SKA" ? "bg-blue-500 shadow-lg shadow-blue-500/50" : "bg-orange-500 shadow-lg shadow-orange-500/50"}`} />
        <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
          {client}
        </span>
        <span className="text-lg sm:text-2xl font-black text-white ml-auto tabular-nums">
          {personnel.length}
        </span>
      </div>
      
      {/* Trade Rows */}
      <div className="space-y-1.5 sm:space-y-2">
        {trades.map((trade) => (
          <motion.div
            key={trade.code}
            className={`flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-xl cursor-pointer transition-all ${
              hoveredTrade === `${client}-${trade.code}`
                ? "bg-slate-700/90 ring-2 ring-white/30"
                : "hover:bg-slate-800/50"
            }`}
            onMouseEnter={() => onTradeHover(`${client}-${trade.code}`)}
            onMouseLeave={() => onTradeHover(null)}
            whileHover={{ scale: 1.02 }}
          >
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${trade.color} flex items-center justify-center shadow-lg`}>
              <span className="text-[9px] sm:text-[11px] font-black text-white">{trade.code}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[8px] sm:text-[9px] text-slate-400 uppercase tracking-wide truncate">{trade.name}</div>
            </div>
            <div className="text-base sm:text-xl font-black text-white tabular-nums">{trade.list.length}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Name List Popover Component - Rendered at page level for proper fixed positioning
// Shows only: NAME - LOCATION - DAYS. No scrollbar, fits all names.
function NameListPopover({
  client,
  tradeCode,
  tradeName,
  personnel,
  systemDate,
}: {
  client: "SKA" | "SBA";
  tradeCode: string;
  tradeName: string;
  personnel: PivotedCrewRow[];
  systemDate: Date;
}) {
  const textColor = tradeCode === "OM" ? "text-blue-400" : tradeCode === "EM" ? "text-emerald-400" : "text-amber-400";
  const count = personnel.length;
  // Auto-reduce font size based on list length to fit without scrollbar
  const fontSize = count > 20 ? "text-[8px]" : count > 14 ? "text-[9px]" : "text-[10px]";
  const pySize = count > 20 ? "py-0.5" : count > 14 ? "py-0.5" : "py-1";

  return (
    <motion.div
      initial={{ opacity: 0, x: client === "SKA" ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: client === "SKA" ? -20 : 20 }}
      transition={{ duration: 0.2 }}
      className={`fixed z-[9999] sm:top-1/2 sm:-translate-y-1/2 bottom-0 sm:bottom-auto left-0 right-0 sm:left-auto sm:right-auto ${
        client === "SKA" ? "sm:left-4" : "sm:right-4"
      }`}
      style={{ maxWidth: '100%' }}
    >
      <div className={`bg-slate-900/95 backdrop-blur-2xl border-2 rounded-2xl shadow-2xl overflow-hidden ${
        client === "SKA" ? "border-blue-500/60 shadow-blue-500/20" : "border-orange-500/60 shadow-orange-500/20"
      }`}>
        <div className={`px-3 py-2 border-b border-slate-700/50 ${client === "SKA" ? "bg-blue-950/60" : "bg-orange-950/60"}`}>
          <span className={`text-xs font-bold uppercase tracking-wider ${textColor}`}>
            {client} - {tradeName}
          </span>
          <span className="text-xs text-slate-400 ml-2">({count})</span>
        </div>
        <div className="px-3 py-2">
          {/* Header row */}
          <div className={`flex items-center gap-2 ${fontSize} ${pySize} px-1 text-slate-500 font-bold uppercase tracking-wide border-b border-slate-800 mb-1 pb-1`}>
            <span className="w-[130px] truncate">Name</span>
            <span className="flex-1 truncate">Location</span>
            <span className="w-[32px] text-right">Days</span>
          </div>
          {personnel.map((person, idx) => {
            const days = getDaysOnBoard(person, systemDate);
            const isOHN = person.post?.includes("IM") || person.post?.includes("OHN");

            return (
              <div
                key={`${person.id}-${idx}`}
                className={`flex items-center gap-2 ${fontSize} ${pySize} px-1 rounded hover:bg-slate-800/50 transition-colors`}
              >
                <span className="font-semibold text-white truncate w-[130px]">
                  {person.crew_name}
                </span>
                <span className="text-slate-400 truncate flex-1">
                  {person.location || "-"}
                </span>
                <span className={`font-bold tabular-nums w-[32px] text-right ${days >= 14 ? "text-red-400" : "text-cyan-400"}`}>
                  {isOHN ? "-" : days > 0 ? days : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Compact Date Picker ───
// Idle: shows formatted date as clickable day / month / year segments
// Active: opens a small scroll list for the clicked segment only
function ScrollList({ items, selected, onSelect }: { items: { value: number; label: string }[]; selected: number; onSelect: (v: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const idx = items.findIndex((i) => i.value === selected);
    if (idx >= 0) {
      const el = listRef.current.children[idx] as HTMLElement;
      el?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [items, selected]);

  return (
    <motion.div
      ref={listRef}
      initial={{ opacity: 0, y: -8, scaleY: 0.9 }}
      animate={{ opacity: 1, y: 0, scaleY: 1 }}
      exit={{ opacity: 0, y: -8, scaleY: 0.9 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-slate-800/95 backdrop-blur-xl border border-slate-600/60 rounded-lg shadow-2xl overflow-y-auto z-50"
      style={{ maxHeight: 160, minWidth: 56, scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(item.value); }}
          className={`w-full px-3 py-1.5 text-xs font-bold text-center transition-colors ${
            item.value === selected
              ? "bg-blue-500/30 text-white"
              : "text-slate-400 hover:bg-slate-700/60 hover:text-white"
          }`}
        >
          {item.label}
        </button>
      ))}
    </motion.div>
  );
}

function CompactDatePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [activeSegment, setActiveSegment] = useState<"day" | "month" | "year" | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const day = value.getDate();
  const month = value.getMonth();
  const year = value.getFullYear();

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const dayItems = useMemo(() => {
    const dim = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: dim }, (_, i) => ({ value: i + 1, label: String(i + 1).padStart(2, "0") }));
  }, [year, month]);

  const monthItems = useMemo(() => MONTHS.map((m, i) => ({ value: i, label: m })), []);

  const yearItems = useMemo(() => {
    const arr = [];
    for (let y = 2020; y <= 2030; y++) arr.push({ value: y, label: String(y) });
    return arr;
  }, []);

  const DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const dayOfWeek = value.getDay();

  const isToday = useMemo(() => {
    const now = new Date();
    return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  }, [day, month, year]);

  // Close on outside click
  useEffect(() => {
    if (!activeSegment) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setActiveSegment(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeSegment]);

  const setDay = useCallback((d: number) => {
    const maxDay = new Date(year, month + 1, 0).getDate();
    onChange(new Date(year, month, Math.min(d, maxDay)));
    setActiveSegment(null);
  }, [year, month, onChange]);

  const setMonth = useCallback((m: number) => {
    const maxDay = new Date(year, m + 1, 0).getDate();
    onChange(new Date(year, m, Math.min(day, maxDay)));
    setActiveSegment(null);
  }, [year, day, onChange]);

  const setYear = useCallback((y: number) => {
    const maxDay = new Date(y, month + 1, 0).getDate();
    onChange(new Date(y, month, Math.min(day, maxDay)));
    setActiveSegment(null);
  }, [month, day, onChange]);

  const segmentCls = (active: boolean) =>
    `relative px-2 py-1 rounded-lg cursor-pointer transition-all text-lg font-black tabular-nums ${
      active
        ? "bg-blue-500/30 text-white ring-1 ring-blue-400/50"
        : "text-cyan-300 hover:bg-slate-700/50 hover:text-white"
    }`;

  return (
    <>
    <div ref={pickerRef} className="flex items-center gap-1">
      {/* Day */}
      <div className="relative">
        <button type="button" onClick={() => setActiveSegment(activeSegment === "day" ? null : "day")} className={segmentCls(activeSegment === "day")}>
          {String(day).padStart(2, "0")}
        </button>
        <AnimatePresence>
          {activeSegment === "day" && <ScrollList items={dayItems} selected={day} onSelect={setDay} />}
        </AnimatePresence>
      </div>

      <span className="text-slate-600 text-sm font-bold">/</span>

      {/* Month */}
      <div className="relative">
        <button type="button" onClick={() => setActiveSegment(activeSegment === "month" ? null : "month")} className={segmentCls(activeSegment === "month")}>
          {MONTHS[month]}
        </button>
        <AnimatePresence>
          {activeSegment === "month" && <ScrollList items={monthItems} selected={month} onSelect={setMonth} />}
        </AnimatePresence>
      </div>

      <span className="text-slate-600 text-sm font-bold">/</span>

      {/* Year */}
      <div className="relative">
        <button type="button" onClick={() => setActiveSegment(activeSegment === "year" ? null : "year")} className={segmentCls(activeSegment === "year")}>
          {year}
        </button>
        <AnimatePresence>
          {activeSegment === "year" && <ScrollList items={yearItems} selected={year} onSelect={setYear} />}
        </AnimatePresence>
      </div>

      {/* Today reset */}
      {!isToday && (
        <button
          type="button"
          onClick={() => { onChange(new Date()); setActiveSegment(null); }}
          className="ml-2 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-white transition-all"
        >
          Today
        </button>
      )}
    </div>
    {/* Day name on its own line below, centered */}
    <div className={`text-[10px] font-normal uppercase tracking-wider mt-0.5 text-center ${
      dayOfWeek === 0 || dayOfWeek === 6 ? "text-red-400" : "text-white"
    }`}>
      {DAY_NAMES[dayOfWeek]}
    </div>
    </>
  );
}

// Compact Table Component for Full List View - with filters and full scroll
function CompactTable({
  personnel,
  systemDate,
}: {
  personnel: PivotedCrewRow[];
  systemDate: Date;
}) {
  // crew_name is stored with suffix directly in cms_pcsb_roster
  const getDisplayName = (row: PivotedCrewRow) => row.crew_name;
  const [clientFilter, setClientFilter] = useState<string>("ALL");
  const [tradeFilter, setTradeFilter] = useState<string>("ALL");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");

  // Get unique locations for filter dropdown
  const locations = useMemo(() => {
    const locs = [...new Set(personnel.map((p) => p.location).filter(Boolean))];
    return locs.sort();
  }, [personnel]);

  // Apply filters
  const filtered = useMemo(() => {
    return personnel.filter((row) => {
      if (clientFilter !== "ALL" && row.client !== clientFilter) return false;
      if (tradeFilter !== "ALL") {
        const tradeName = getFullTradeName(row.post);
        const tradeShort = tradeName === "OFFSHORE MEDIC" ? "OM" : tradeName === "ESCORT MEDIC" ? "EM" : "OHN";
        if (tradeShort !== tradeFilter) return false;
      }
      if (locationFilter !== "ALL" && row.location !== locationFilter) return false;
      return true;
    });
  }, [personnel, clientFilter, tradeFilter, locationFilter]);

  let currentTradeCounter = 0;

  return (
    <div className="bg-slate-800/70 backdrop-blur-xl rounded-2xl border border-slate-600/50 overflow-hidden">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-slate-800/50 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client</span>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="bg-slate-700/60 text-white text-xs font-bold rounded-lg px-3 py-1.5 border border-slate-600/50 outline-none cursor-pointer"
          >
            <option value="ALL">All</option>
            <option value="SKA">SKA</option>
            <option value="SBA">SBA</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Trade</span>
          <select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            className="bg-slate-700/60 text-white text-xs font-bold rounded-lg px-3 py-1.5 border border-slate-600/50 outline-none cursor-pointer"
          >
            <option value="ALL">All</option>
            <option value="OM">OM</option>
            <option value="EM">EM</option>
            <option value="OHN">OHN</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Location</span>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="bg-slate-700/60 text-white text-xs font-bold rounded-lg px-3 py-1.5 border border-slate-600/50 outline-none cursor-pointer min-w-[120px]"
          >
            <option value="ALL">All</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>
        {(clientFilter !== "ALL" || tradeFilter !== "ALL" || locationFilter !== "ALL") && (
          <button
            type="button"
            onClick={() => { setClientFilter("ALL"); setTradeFilter("ALL"); setLocationFilter("ALL"); }}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-[9px] uppercase tracking-wider transition-all border border-red-500/30"
          >
            Reset All
          </button>
        )}
        <span className="ml-auto text-[10px] text-slate-400 font-bold">
          Showing <span className="text-white">{filtered.length}</span> of {personnel.length}
        </span>
      </div>

      {/* Scrollable Table */}
      <div className="overflow-auto max-h-[calc(100vh-300px)]">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800 border-b border-slate-700/50">
              <th className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">#</th>
              <th className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Name</th>
              <th className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Role</th>
              <th className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location</th>
              <th className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Client</th>
              <th className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Days</th>
              <th className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-right">Rotation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filtered.map((row, idx) => {
              const prev = filtered[idx - 1];
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
                      <td colSpan={7} className="px-3 py-1">
                        <span className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide ${
                          row.client === "SKA" ? "text-blue-400" : "text-orange-400"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${row.client === "SKA" ? "bg-blue-400" : "bg-orange-400"}`} />
                          {row.client} - {tradeName}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-1 text-[11px] text-slate-500 tabular-nums">{currentTradeCounter}</td>
                    <td className="px-3 py-1">
                      <span className="text-xs font-medium text-white">{getDisplayName(row)}</span>
                    </td>
                    <td className="px-3 py-1">
                      <span className={`inline-flex px-1.5 py-px rounded text-[9px] font-bold ${
                        tradeName === "OFFSHORE MEDIC" 
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
                          : tradeName === "ESCORT MEDIC"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}>
                        {tradeName === "OFFSHORE MEDIC" ? "OM" : tradeName === "ESCORT MEDIC" ? "EM" : "OHN"}
                      </span>
                    </td>
                    <td className="px-3 py-1 text-[11px] text-slate-400">{row.location}</td>
                    <td className="px-3 py-1">
                      <span className={`inline-flex px-1.5 py-px rounded text-[9px] font-bold ${
                        row.client === "SKA" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      }`}>
                        {row.client}
                      </span>
                    </td>
                    <td className="px-3 py-1 text-center">
                      <span className={`text-xs font-semibold tabular-nums ${
                        days >= 14 ? "text-red-400" : "text-white"
                      }`}>
                        {isOHN ? "-" : days > 0 ? days : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      {isOHN ? (
                        <span className="text-[11px] text-amber-400/80 italic font-semibold">OFFICE BASED</span>
                      ) : range.start ? (
                        <span className="text-[11px] text-cyan-400 tabular-nums">
                          {formatDate(range.start)} - {formatDate(range.end)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <p className="text-sm text-slate-500">No personnel match the selected filters</p>
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
  const project = useProject();
  const [systemDate, setSystemDate] = useState(() => new Date());
  const [liveTime, setLiveTime] = useState(() => new Date());
  const [data, setData] = useState<PivotedCrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterUnavailable, setRosterUnavailable] = useState(false);
  const [viewMode, setViewMode] = useState<"hud" | "list">("hud");
  const [hoveredSegment, setHoveredSegment] = useState<"SKA" | "SBA" | null>(null);
  const [hoveredTrade, setHoveredTrade] = useState<string | null>(null);
  // Live clock - updates every second
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLoading(true);
    setRosterUnavailable(false);
    Promise.all([getPivotedRosterData(project), getOHNStaffFromMaster()]).then(([pivotedData, ohnStaff]) => {
      if (project === "OTHERS" && pivotedData.length === 0) {
        setRosterUnavailable(true);
        setData([]);
        setLoading(false);
        return;
      }
      // Merge OHN from master into roster data, avoiding duplicates
      const rosterIds = new Set(pivotedData.map((r) => r.crew_id));
      const merged = [...pivotedData];
      for (const ohn of ohnStaff) {
        if (!rosterIds.has(ohn.crew_id)) {
          merged.push(ohn);
        }
      }
      setData(merged);
      setLoading(false);
    });
  }, [project]);

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

  if (rosterUnavailable) {
    return <AppShell><SyncingPlaceholder project={project} label="Dashboard" /></AppShell>;
  }

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
        className="min-h-[calc(100vh-120px)] sm:h-[calc(100vh-120px)] rounded-2xl overflow-hidden relative"
        style={{
          backgroundImage: `url(https://image2url.com/r2/default/images/1770311131560-2493d85c-5fef-4dbd-96b2-5c844492a9aa.jpg)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Lighter Dark Overlay */}
        <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />
        
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
              {/* Compact Header */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-3 sm:px-4 py-2 border-b border-slate-800/50 gap-1 sm:gap-0">
                <div className="flex items-center justify-between w-full sm:w-auto">
                  {/* Top Left - CMS Live Data */}
                  <div className="flex items-center gap-2">
                    <motion.div
                      className="w-2 h-2 rounded-full bg-emerald-500"
                      animate={{ opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <span className="text-[10px] sm:text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                      CMS - Live Data
                    </span>
                  </div>
                  
                  {/* Live Time - beside CMS badge on mobile, right side on desktop */}
                  <div className="flex items-center gap-1.5 sm:hidden">
                    <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                      {`${String(liveTime.getDate()).padStart(2, "0")}/${String(liveTime.getMonth() + 1).padStart(2, "0")}/${liveTime.getFullYear()}`}
                    </span>
                    <span className="text-sm font-black text-cyan-400 tabular-nums" style={{ textShadow: "0 0 20px rgba(6, 182, 212, 0.5)" }}>
                      {liveTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                </div>
                
                {/* Title - Center */}
                <h1 
                  className="text-sm sm:text-xl font-black text-white uppercase tracking-[0.15em] sm:tracking-[0.25em] font-sans text-center"
                  style={{ 
                    textShadow: "0 0 30px rgba(59, 130, 246, 0.5), 0 0 60px rgba(249, 115, 22, 0.3)"
                  }}
                >
                  PROVISION OF IMS - PCSB
                </h1>
                
                {/* Live Time - desktop only */}
                <div className="hidden sm:flex items-center gap-2 min-w-[180px] justify-end">
                  <span className="text-xs font-bold text-slate-400 tabular-nums">
                    {`${String(liveTime.getDate()).padStart(2, "0")}/${String(liveTime.getMonth() + 1).padStart(2, "0")}/${liveTime.getFullYear()}`}
                  </span>
                  <span className="text-lg font-black text-cyan-400 tabular-nums" style={{ textShadow: "0 0 20px rgba(6, 182, 212, 0.5)" }}>
                    {liveTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              </div>

              {/* Main HUD Content - Compact */}
              <div className="flex-1 flex flex-col items-center justify-center px-2 sm:px-4 overflow-y-auto">
                {/* Compact Date Picker - Above Donut */}
                <div className="mb-2">
                  <CompactDatePicker value={systemDate} onChange={setSystemDate} />
                </div>

                {/* HUD Layout: Desktop = SKA | Donut | SBA row. Mobile = Donut on top, panels below */}
                {/* Desktop layout */}
                <div className="hidden md:flex items-center justify-center gap-6 w-full max-w-5xl">
                  <div className="flex-shrink-0">
                    <TradePanel client="SKA" personnel={skaPersonnel} hoveredTrade={hoveredTrade} onTradeHover={setHoveredTrade} />
                  </div>
                  <div className="relative flex-shrink-0">
                    <DonutChart total={stats.total} ska={stats.ska} sba={stats.sba} onSegmentHover={setHoveredSegment} hoveredSegment={hoveredSegment} />
                  </div>
                  <div className="flex-shrink-0">
                    <TradePanel client="SBA" personnel={sbaPersonnel} hoveredTrade={hoveredTrade} onTradeHover={setHoveredTrade} />
                  </div>
                </div>

                {/* Mobile layout */}
                <div className="flex flex-col items-center gap-3 md:hidden w-full">
                  {/* Smaller Donut */}
                  <div className="relative scale-75 -my-6">
                    <DonutChart total={stats.total} ska={stats.ska} sba={stats.sba} onSegmentHover={setHoveredSegment} hoveredSegment={hoveredSegment} />
                  </div>
                  {/* Trade panels side by side */}
                  <div className="flex gap-2 w-full px-1">
                    <div className="flex-1 min-w-0">
                      <TradePanel client="SKA" personnel={skaPersonnel} hoveredTrade={hoveredTrade} onTradeHover={setHoveredTrade} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <TradePanel client="SBA" personnel={sbaPersonnel} hoveredTrade={hoveredTrade} onTradeHover={setHoveredTrade} />
                    </div>
                  </div>
                </div>

                {/* Show Full List Button */}
                <div className="mt-3">
                  <motion.button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className="group flex items-center gap-2 px-5 sm:px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-white font-bold text-[10px] sm:text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/30 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    Show Full List
                    <svg className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </motion.button>
                </div>
              </div>

              {/* Compact Footer */}
              <div className="px-3 sm:px-6 py-2 border-t border-slate-800/50 flex items-center justify-between text-[8px] sm:text-[9px] text-slate-500">
                <span>Viewing: {formatDateLong(systemDate)}</span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50" />
                    <span>SKA: {stats.ska}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50" />
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
              className="relative z-10 p-3 sm:p-6 h-full overflow-auto"
            >
              {/* Back to HUD Button */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 sticky top-0 z-20 bg-transparent">
                <motion.button
                  type="button"
                  onClick={() => setViewMode("hud")}
                  className="group flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-xl text-white text-xs sm:text-sm font-bold uppercase tracking-wider transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to HUD
                </motion.button>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-4">
                  <span className="text-xs sm:text-sm text-slate-400">
                    <span className="text-white font-bold">{filteredPersonnel.length}</span> personnel for {formatDateLong(systemDate)}
                  </span>
                  <h2 className="text-sm sm:text-lg font-black text-white uppercase tracking-[0.15em] sm:tracking-[0.2em]">
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

      {/* Name List Popovers - Rendered OUTSIDE the overflow-hidden container */}
      <AnimatePresence>
        {hoveredTrade?.startsWith("SKA-") && (
          <NameListPopover
            client="SKA"
            tradeCode={hoveredTrade.split("-")[1]}
            tradeName={
              hoveredTrade === "SKA-OM" ? "Offshore Medic" :
              hoveredTrade === "SKA-EM" ? "Escort Medic" : "IMP / OHN"
            }
            personnel={
              hoveredTrade === "SKA-OM" ? skaPersonnel.filter(p => p.post?.includes("OFFSHORE")) :
              hoveredTrade === "SKA-EM" ? skaPersonnel.filter(p => p.post?.includes("ESCORT")) :
              skaPersonnel.filter(p => p.post?.includes("IM") || p.post?.includes("OHN"))
            }
            systemDate={systemDate}
          />
        )}
        {hoveredTrade?.startsWith("SBA-") && (
          <NameListPopover
            client="SBA"
            tradeCode={hoveredTrade.split("-")[1]}
            tradeName={
              hoveredTrade === "SBA-OM" ? "Offshore Medic" :
              hoveredTrade === "SBA-EM" ? "Escort Medic" : "IMP / OHN"
            }
            personnel={
              hoveredTrade === "SBA-OM" ? sbaPersonnel.filter(p => p.post?.includes("OFFSHORE")) :
              hoveredTrade === "SBA-EM" ? sbaPersonnel.filter(p => p.post?.includes("ESCORT")) :
              sbaPersonnel.filter(p => p.post?.includes("IM") || p.post?.includes("OHN"))
            }
            systemDate={systemDate}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}
