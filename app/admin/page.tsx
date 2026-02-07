"use client";

import React from "react"

import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow, TradeType } from "@/lib/types";
import { getRosterData, updateRosterRow, createRosterRow, deleteRosterRow, getCrewList } from "@/lib/actions";
import { safeParseDate, getTradeRank, shortenPost } from "@/lib/logic";

interface CrewListItem { id: string; crew_name: string; clean_name: string; post: string; client: string; location: string; status?: string }

export default function AdminPage() {
  const [data, setData] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState<TradeType | "ALL">("ALL");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);

  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [activeNote, setActiveNote] = useState<{
    id: number;
    name: string;
    rotationIdx: number;
    note: string;
  } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const [notesStore, setNotesStore] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Dynamic crew list from pcsb_crew_detail
  const [crewList, setCrewList] = useState<CrewListItem[]>([]);

  // Add Staff Modal State
  const [addStaffModal, setAddStaffModal] = useState<boolean>(false);
  const [newStaffClient, setNewStaffClient] = useState("");
  const [newStaffPost, setNewStaffPost] = useState("");
  const [newStaffLocation, setNewStaffLocation] = useState("");
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<CrewListItem | null>(null);
  
  // Track newly added staff IDs for showing delete button
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<number>>(new Set());
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{ id: number; name: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [rosterData, crewResult] = await Promise.all([getRosterData(), getCrewList()]);
    setData(rosterData);
    if (crewResult.success && crewResult.data) setCrewList(crewResult.data);
    // Load notes from pcsb_roster note1-note24 columns into notesStore
    const loadedNotes: Record<string, string> = {};
    for (const row of rosterData) {
      for (let i = 1; i <= 24; i++) {
        const noteVal = row[`note${i}`] as string | null | undefined;
        if (noteVal && typeof noteVal === "string" && noteVal.trim()) {
          loadedNotes[`${row.id}-${i}`] = noteVal;
        }
      }
    }
    setNotesStore(loadedNotes);
    setLoading(false);
  };

  const sortedData = useMemo(() => {
    const filtered = data.filter((row) => {
      const matchesSearch = row.crew_name
        ?.toLowerCase()
        .includes(search.toLowerCase());
      const matchesTrade =
        tradeFilter === "ALL" ||
        (tradeFilter === "OM" && row.post?.includes("OFFSHORE MEDIC")) ||
        (tradeFilter === "EM" && row.post?.includes("ESCORT MEDIC")) ||
        (tradeFilter === "IMP/OHN" &&
          (row.post?.includes("IM") || row.post?.includes("OHN")));
      const matchesLocation =
        locationFilter === "ALL" || row.location === locationFilter;
      return matchesSearch && matchesTrade && matchesLocation;
    });

    return filtered.sort((a, b) => {
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
  }, [data, search, tradeFilter, locationFilter]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const updateMax = () => {
      if (scrollContainerRef.current) {
        setMaxScroll(
          scrollContainerRef.current.scrollWidth -
            scrollContainerRef.current.clientWidth
        );
      }
    };
    const timer = setTimeout(updateMax, 200);
    window.addEventListener("resize", updateMax);
    return () => {
      window.removeEventListener("resize", updateMax);
      clearTimeout(timer);
    };
  }, [loading, data, sortedData]);

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollPos(e.currentTarget.scrollLeft);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setScrollPos(val);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = val;
    }
  };

  const locations = useMemo(() => {
    const locs = Array.from(new Set(data.map((r) => r.location))).filter(
      Boolean
    );
    return locs.sort();
  }, [data]);

  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const getOverlaps = useMemo(() => {
    const alerts: Record<string, string[]> = {};
    const oms = data.filter((r) => r.post?.includes("OFFSHORE MEDIC"));

    oms.forEach((rowA) => {
      for (let i = 1; i <= 24; i++) {
        const mA = safeParseDate(rowA[`m${i}`] as string);
        const dA = safeParseDate(rowA[`d${i}`] as string);
        if (!mA || !dA) continue;

        oms.forEach((rowB) => {
          if (rowA.id === rowB.id) return;
          if (rowA.location !== rowB.location || rowA.post !== rowB.post)
            return;

          for (let j = 1; j <= 24; j++) {
            const mB = safeParseDate(rowB[`m${j}`] as string);
            const dB = safeParseDate(rowB[`d${j}`] as string);
            if (!mB || !dB) continue;

            if (mA.getTime() < dB.getTime() && dA.getTime() > mB.getTime()) {
              const key = `${rowA.id}-${i}`;
              if (!alerts[key]) alerts[key] = [];
              if (!alerts[key].includes(rowB.crew_name))
                alerts[key].push(rowB.crew_name);
            }
          }
        });
      }
    });
    return alerts;
  }, [data]);

  const handleUpdate = async (id: number, field: string, value: string) => {
    const finalValue = value === "" ? null : value;
    
    const isMob = field.startsWith("m");
    const rotationNum = field.replace(/^[md]/, "");
    const pairedField = isMob ? `d${rotationNum}` : `m${rotationNum}`;
    
    const currentRow = data.find(r => r.id === id);
    if (!currentRow) return;
    
    const pairedValue = currentRow[pairedField as keyof RosterRow] as string | null;
    
    // Optimistic update - always allow the action
    const updatedData = data.map((r) =>
      r.id === id ? { ...r, [field]: finalValue } : r
    );
    setData(updatedData);
    setIsSyncing(true);
    
    // Persist to Supabase
    const result = await updateRosterRow(id, { [field]: finalValue });
    setIsSyncing(false);
    
    if (result.success) {
      setLastSynced(new Date());
      
      // Warn if incomplete date pair (but allow action to proceed)
      if (finalValue && (!pairedValue || pairedValue === "")) {
        const missingType = isMob ? "DEMOB" : "MOB";
        showNotification(`Warning: Incomplete date pair (${missingType} missing)`, "error");
      } else if (!finalValue && pairedValue && pairedValue !== "") {
        const clearedType = isMob ? "MOB" : "DEMOB";
        showNotification(`Warning: Incomplete date pair (${clearedType} cleared)`, "error");
      } else {
        showNotification("Update Synced", "success");
      }
    } else {
      showNotification(result.error || "Update failed", "error");
      fetchData();
    }
  };

  const syncAll = async () => {
    setIsSyncing(true);
    await fetchData();
    setIsSyncing(false);
    setLastSynced(new Date());
    showNotification("Global Registry Synced", "success");
  };

  const saveNote = async () => {
    if (activeNote) {
      const key = `${activeNote.id}-${activeNote.rotationIdx}`;
      const noteColumn = `note${activeNote.rotationIdx}`;
      setNotesStore((prev) => ({ ...prev, [key]: activeNote.note }));
      // Sync to pcsb_roster note{N} column
      await updateRosterRow(activeNote.id, { [noteColumn]: activeNote.note });
      showNotification("Note Saved", "success");
      setActiveNote(null);
    }
  };

  const deleteNote = async () => {
    if (activeNote) {
      const key = `${activeNote.id}-${activeNote.rotationIdx}`;
      const noteColumn = `note${activeNote.rotationIdx}`;
      const newStore = { ...notesStore };
      delete newStore[key];
      setNotesStore(newStore);
      // Clear note{N} in pcsb_roster
      await updateRosterRow(activeNote.id, { [noteColumn]: null });
      showNotification("Note Deleted", "error");
      setActiveNote(null);
    }
  };

  const calculateDays = (start: string, end: string) => {
    if (!start || !end || start === "-" || end === "-") return null;
    const s = safeParseDate(start);
    const e = safeParseDate(end);
    if (!s || !e) return null;
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 3600 * 24));
    return diff > 0 ? diff : 0;
  };

  // Check if a crew_id (or any relief variant like id_R, id_R1) already exists in the roster
  const isCrewInRoster = (crewId: string) => {
    return data.some((row) => row.crew_id === crewId || (row.crew_id && row.crew_id.startsWith(`${crewId}_R`)));
  };

  // Count how many times a crew_id (including relief variants) appears in the roster
  const getCrewIdCount = (crewId: string) => {
    return data.filter((row) => row.crew_id === crewId || (row.crew_id && row.crew_id.startsWith(`${crewId}_R`))).length;
  };

  // Display name is now stored directly in pcsb_roster.crew_name (with suffix)
  const getDisplayName = (row: RosterRow) => row.crew_name;

  // Add new staff to roster - always INSERT a new row
  const handleAddStaff = async () => {
    if (!selectedStaff || !newStaffClient || !newStaffPost || !newStaffLocation) return;

    setIsSyncing(true);

    const baseName = selectedStaff.clean_name || selectedStaff.crew_name;

    // Count existing rows for this crew_id (including relief variants)
    const existingCount = data.filter((row) =>
      row.crew_id === selectedStaff.id || (row.crew_id && row.crew_id.startsWith(`${selectedStaff.id}_R`))
    ).length;

    // Auto-add (R) suffix if crew already exists
    let finalName = baseName;
    if (existingCount === 1) {
      finalName = `${baseName} (R)`;
    } else if (existingCount > 1) {
      finalName = `${baseName} (R${existingCount})`;
    }

    // Unique crew_id for relief to avoid PKEY constraint
    const isRelief = existingCount > 0;
    const uniqueCrewId = isRelief
      ? `${selectedStaff.id}_R${existingCount}`
      : selectedStaff.id;

    const payload = {
      crew_id: uniqueCrewId,
      crew_name: finalName,
      post: newStaffPost,
      client: newStaffClient,
      location: newStaffLocation,
    };

    const result = await createRosterRow(payload);
    setIsSyncing(false);

    if (result.success && result.data) {
      setData((prev) => [...prev, result.data!]);
      setNewlyAddedIds((prev) => new Set([...prev, result.data!.id]));
      setLastSynced(new Date());
      const displaySuffix = isRelief ? ` (Relief at ${newStaffLocation})` : "";
      showNotification(`${finalName}${displaySuffix} added successfully`, "success");
    } else {
      showNotification(result.error || "Failed to add staff", "error");
    }

    // Reset all modal state
    setAddStaffModal(false);
    setSelectedStaff(null);
    setStaffSearchQuery("");
    setNewStaffClient("");
    setNewStaffPost("");
    setNewStaffLocation("");
  };

  // Delete staff - called after confirmation
  const handleDeleteStaff = async () => {
    if (!deleteModal) return;
    
    const { id, name } = deleteModal;
    setDeleteModal(null);
    
    setIsSyncing(true);
    const result = await deleteRosterRow(id);
    setIsSyncing(false);
    
    if (result.success) {
      setData((prev) => prev.filter((row) => row.id !== id));
      setNewlyAddedIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setLastSynced(new Date());
      showNotification(`${name} deleted`, "success");
    } else {
      showNotification(result.error || "Failed to delete", "error");
    }
  };

  // Unique values for assignment dropdowns
  const uniqueClients = useMemo(() => [...new Set(data.map((r) => r.client).filter(Boolean))].sort(), [data]);
  const uniquePosts = useMemo(() => [...new Set(data.map((r) => r.post).filter(Boolean))].sort(), [data]);
  const uniqueLocations = useMemo(() => [...new Set(data.map((r) => r.location).filter(Boolean))].sort(), [data]);

  // Filter crew list for modal (search by clean_name or crew_name)
  const filteredMasterList = useMemo(() => {
    if (!addStaffModal) return [];
    const q = staffSearchQuery.toLowerCase();
    return crewList.filter((staff) => {
      return (staff.clean_name || staff.crew_name || '').toLowerCase().includes(q) ||
             (staff.crew_name || '').toLowerCase().includes(q);
    });
  }, [addStaffModal, staffSearchQuery, crewList]);

  if (loading)
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-foreground" />
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="flex flex-col h-full max-h-[calc(100vh-80px)] mt-1 relative">
        {/* SYNCING INDICATOR */}
        {isSyncing && (
          <div className="fixed top-24 right-4 z-[2000] px-6 py-3 rounded-2xl shadow-2xl bg-blue-600 text-white font-black text-[11px] uppercase tracking-widest animate-in slide-in-from-right duration-300 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            Saving...
          </div>
        )}

        {/* NOTIFICATION */}
        {notification && !isSyncing && (
          <div
            className={`fixed top-24 right-4 z-[2000] px-6 py-3 rounded-2xl shadow-2xl text-white font-black text-[11px] uppercase tracking-widest animate-in slide-in-from-right duration-300 ${
              notification.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {notification.message}
          </div>
        )}

        {/* PAGE HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between border-b border-border pb-2 flex-shrink-0 gap-4">
          <div>
            <h2 className="text-4xl font-black text-foreground uppercase italic tracking-tighter leading-none">
              MOVEMENT REGISTER
            </h2>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-muted-foreground font-black text-[10px] tracking-[0.3em] uppercase italic flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Edit Enabled - Auto-Sync Active
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setAddStaffModal(true)}
              className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] uppercase tracking-widest transition-all shadow-lg hover:shadow-emerald-500/30 flex items-center gap-2 border border-emerald-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              Add New Staff
            </button>
            <div className="flex flex-wrap items-center gap-4 bg-muted p-3 rounded-2xl border border-border shadow-inner">
              <div className="flex flex-col px-4 border-r border-border">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                  Grade
                </span>
                <select
                  value={tradeFilter}
                  onChange={(e) =>
                    setTradeFilter(e.target.value as TradeType | "ALL")
                  }
                  className="bg-transparent text-[14px] font-black uppercase outline-none cursor-pointer py-1"
                >
                  <option value="ALL">ALL TRADES</option>
                  <option value="OM">OM</option>
                  <option value="EM">EM</option>
                  <option value="IMP/OHN">OHN</option>
                </select>
              </div>
              <div className="flex flex-col px-4 border-r border-border">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                  Site
                </span>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="bg-transparent text-[14px] font-black uppercase outline-none cursor-pointer max-w-[180px] py-1"
                >
                  <option value="ALL">ALL SITES</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col px-4 border-r border-border">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                  Search
                </span>
                <input
                  type="text"
                  placeholder="Type name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent border-none p-0 text-[14px] font-black uppercase outline-none w-36 py-1"
                />
              </div>
              {(tradeFilter !== "ALL" || locationFilter !== "ALL" || search) && (
                <button
                  type="button"
                  onClick={() => { setTradeFilter("ALL"); setLocationFilter("ALL"); setSearch(""); }}
                  className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 font-black text-[10px] uppercase tracking-wider transition-all border border-red-200"
                >
                  Reset All
                </button>
              )}
            </div>

            
          </div>
        </div>

        {/* TIMELINE NAVIGATION */}
        <div className="bg-blue-600 backdrop-blur-md px-4 py-1.5 border-b border-blue-700 flex items-center gap-3 flex-shrink-0 shadow-md rounded-lg mx-2 mt-1">
          <span className="text-[8px] font-black text-white/80 uppercase tracking-wider shrink-0">
            Scroll
          </span>
          <input
            type="range"
            min="0"
            max={maxScroll}
            value={scrollPos}
            onChange={handleSliderChange}
            className="flex-grow h-2 bg-blue-500/50 rounded-full appearance-none cursor-pointer"
            style={{ WebkitAppearance: 'none' }}
          />
          <style jsx>{`
            input[type="range"]::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 18px;
              height: 18px;
              background: linear-gradient(145deg, #ffffff, #e0e0e0);
              border-radius: 50%;
              cursor: grab;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              border: 2px solid #d1d5db;
              transition: all 0.15s ease;
            }
            input[type="range"]::-webkit-slider-thumb:hover {
              transform: scale(1.15);
            }
            input[type="range"]::-webkit-slider-thumb:active {
              cursor: grabbing;
            }
            input[type="range"]::-moz-range-thumb {
              width: 18px;
              height: 18px;
              background: linear-gradient(145deg, #ffffff, #e0e0e0);
              border-radius: 50%;
              cursor: grab;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              border: 2px solid #d1d5db;
            }
          `}</style>
          <span className="text-[8px] font-bold text-white/70 tabular-nums w-8 text-right shrink-0">
            {Math.round((scrollPos / (maxScroll || 1)) * 100)}%
          </span>
        </div>

        {/* LAST SYNCED STATUS */}
        {lastSynced && (
          <div className="flex items-center justify-end px-4 py-2 bg-muted/30 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-medium text-muted-foreground">
                Last Synced: {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        )}

        {/* TABLE CONTAINER */}
        <div className="bg-card rounded-b-[2rem] shadow-2xl border border-border border-t-0 overflow-hidden flex flex-col flex-grow">
          <div
            ref={scrollContainerRef}
            onScroll={handleTableScroll}
            className="overflow-auto flex-grow relative"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <table className="w-full border-collapse table-fixed min-w-full">
              <tbody className="divide-y divide-border">
                <tr className="h-0 opacity-0 pointer-events-none">
                  <td className="w-[200px]" />
                  <td className="w-[5000px]" />
                </tr>
                {sortedData.map((row, idx) => {
                  const prev = sortedData[idx - 1];
                  const showSeparator =
                    !prev ||
                    prev.client !== row.client ||
                    getTradeRank(prev.post) !== getTradeRank(row.post) ||
                    prev.location !== row.location;

                  return (
                    <Fragment key={row.id}>
                      {showSeparator && (
                        <tr className="sticky top-0 z-[90] bg-slate-900 border-y border-slate-950 shadow-xl w-full">
                          <td className="px-6 py-2 sticky left-0 z-[95] bg-slate-900 border-r border-slate-800">
                            <div className="flex flex-col">
                              <span className="text-[15px] font-black text-white uppercase tracking-wider leading-tight">
                                {shortenPost(row.post)}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide leading-tight">
                                {row.location} / {row.client}
                              </span>
                            </div>
                          </td>
                          <td className="bg-slate-900 py-2 h-12 w-full" />
                        </tr>
                      )}
                      <tr className="transition-colors group h-14 hover:bg-blue-50/20">
                        <td className="px-6 py-2 sticky left-0 bg-card group-hover:bg-muted/50 z-50 border-r border-border shadow-sm">
                          <div className="flex items-center gap-2 group/name">
                            <span className="font-black text-foreground text-[11px] uppercase leading-tight block tracking-tight whitespace-normal break-words flex-1 cursor-default">
                              {getDisplayName(row)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDeleteModal({ id: row.id, name: row.crew_name })}
                              className="flex items-center justify-center w-5 h-5 bg-red-500 hover:bg-red-400 text-white rounded-full text-[14px] font-black transition-all shadow-md hover:shadow-red-500/40 hover:scale-110 flex-shrink-0 opacity-0 group-hover/name:opacity-100"
                              title="Delete Row"
                            >
                              -
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-1 whitespace-nowrap">
                          <div className="flex items-center gap-4">
                            {Array.from({ length: 24 }).map((_, i) => {
                              const rotationIdx = i + 1;
                              const mVal = row[`m${rotationIdx}`] as string;
                              const dVal = row[`d${rotationIdx}`] as string;
                              const days = calculateDays(mVal, dVal);
                              const noteKey = `${row.id}-${rotationIdx}`;
                              const alertKey = `${row.id}-${rotationIdx}`;
                              const hasNote = !!notesStore[noteKey];
                              const conflicts = getOverlaps[alertKey];

                              const shouldShowSlot =
                                rotationIdx <= 12 ||
                                !!mVal ||
                                !!dVal ||
                                (rotationIdx > 1 &&
                                  !!row[`m${rotationIdx - 1}`]);
                              if (!shouldShowSlot) return null;

                              return (
                                <Fragment key={rotationIdx}>
                                  <div
                                    className={`flex items-center gap-3 p-1.5 rounded-2xl border transition-all ${
                                      mVal
                                        ? "bg-card border-border shadow-md"
                                        : "bg-muted/30 border-border/50 opacity-40 hover:opacity-100 group-hover:shadow-lg"
                                    } ${
                                      conflicts
                                        ? "ring-2 ring-red-500 bg-red-50"
                                        : ""
                                    }`}
                                  >
                                    <div className="flex flex-col">
                                      <div className="flex justify-between items-center mb-0.5">
                                        <span className="text-[7px] font-black text-muted-foreground uppercase tracking-tighter">
                                          MOB {rotationIdx}
                                        </span>
                                        {conflicts && (
                                          <span className="text-red-600 text-[8px] font-black animate-pulse">
                                            DUPLICATE
                                          </span>
                                        )}
                                      </div>
                                      <input
                                        type="date"
                                        value={mVal || ""}
                                        onChange={(e) =>
                                          handleUpdate(
                                            row.id,
                                            `m${rotationIdx}`,
                                            e.target.value
                                          )
                                        }
                                        className="border border-border rounded-xl px-2.5 py-1.5 text-[11px] font-black w-36 outline-none focus:ring-2 focus:ring-slate-400 bg-muted text-foreground transition-all"
                                      />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[7px] font-black text-red-500 mb-0.5 ml-1 uppercase tracking-tighter">
                                        DEMOB {rotationIdx}
                                      </span>
                                      <input
                                        type="date"
                                        value={dVal || ""}
                                        onChange={(e) =>
                                          handleUpdate(
                                            row.id,
                                            `d${rotationIdx}`,
                                            e.target.value
                                          )
                                        }
                                        className="border border-border rounded-xl px-2.5 py-1.5 text-[11px] font-black w-36 outline-none focus:ring-2 focus:ring-red-400 bg-muted text-foreground transition-all"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1.5 items-center justify-center h-full px-1">
                                      {days !== null && (
                                        <div
                                          className={`px-2 py-1 rounded-lg flex flex-col items-center justify-center shadow-lg min-w-[32px] ${
                                            days > 15
                                              ? "bg-red-900 text-white"
                                              : "bg-slate-900 text-white"
                                          }`}
                                        >
                                          <span className="text-[11px] font-black leading-none tabular-nums">
                                            {days}
                                          </span>
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        onMouseEnter={(e) =>
                                          hasNote &&
                                          setHoveredNote({
                                            text: notesStore[noteKey],
                                            x: e.clientX,
                                            y: e.clientY,
                                          })
                                        }
                                        onMouseLeave={() =>
                                          setHoveredNote(null)
                                        }
                                        onClick={() =>
                                          setActiveNote({
                                            id: row.id,
                                            name: row.crew_name,
                                            rotationIdx,
                                            note: notesStore[noteKey] || "",
                                          })
                                        }
                                        className={`text-[12px] hover:scale-125 transition-all p-1.5 rounded-lg border shadow-sm ${
                                          hasNote
                                            ? "bg-amber-100 border-amber-300"
                                            : "bg-muted border-border hover:bg-card"
                                        }`}
                                      >
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                  {/* Arrow separator between filled rotations */}
                                  {rotationIdx < 24 &&
                                    !!row[`m${rotationIdx + 1}`] && (
                                      <div className="text-muted-foreground font-black text-lg select-none mx-1">
                                        {" -> "}
                                      </div>
                                    )}
                                </Fragment>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* HOVERED NOTE PREVIEW */}
        {hoveredNote && (
          <div
            className="fixed z-[3000] bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-white/10 pointer-events-none max-w-[220px] animate-in zoom-in-95 duration-150"
            style={{ left: hoveredNote.x + 10, top: hoveredNote.y + 10 }}
          >
            <p className="text-[8px] font-bold text-blue-400 uppercase tracking-wider mb-0.5">Note</p>
            <p className="text-[10px] font-medium leading-relaxed">{hoveredNote.text}</p>
          </div>
        )}

        {/* NOTE MODAL - Compact */}
        {activeNote && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-foreground">{activeNote.name}</h3>
                  <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wide mt-0.5">
                    Rotation {activeNote.rotationIdx} Note
                  </p>
                </div>
                <button type="button" onClick={() => setActiveNote(null)} className="text-muted-foreground hover:text-foreground text-lg font-bold">&times;</button>
              </div>

              <div className="px-5 py-3">
                <textarea
                  value={activeNote.note}
                  onChange={(e) => setActiveNote({ ...activeNote, note: e.target.value })}
                  placeholder="Enter rotation notes..."
                  className="w-full h-28 bg-muted border border-border rounded-lg p-3 text-xs outline-none focus:ring-2 focus:ring-slate-400 resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                {notesStore[`${activeNote.id}-${activeNote.rotationIdx}`] && (
                  <button type="button" onClick={deleteNote} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-wider transition-all">
                    Delete
                  </button>
                )}
                <button type="button" onClick={saveNote} className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-black text-[10px] uppercase tracking-wider transition-all">
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ADD NEW STAFF MODAL */}
        {addStaffModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl w-full max-w-lg shadow-2xl border border-border">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-emerald-600 rounded-t-2xl">
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">Add New Staff</h3>
                  <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-wide mt-0.5">
                    Select crew member and assign location
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setAddStaffModal(false); setSelectedStaff(null); setStaffSearchQuery(""); setNewStaffClient(""); setNewStaffPost(""); setNewStaffLocation(""); }}
                  className="text-white/80 hover:text-white text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                >&times;</button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* STEP 1: Select Crew Member */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                    Step 1 &mdash; Select Crew Member
                  </label>
                  <input
                    type="text"
                    value={staffSearchQuery}
                    onChange={(e) => setStaffSearchQuery(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 mb-2 font-medium"
                  />
                  <div className="h-44 overflow-y-auto bg-muted/30 rounded-xl border border-border p-2" style={{ scrollbarWidth: "thin" }}>
                    {filteredMasterList.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-xs font-medium">No staff found</div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {filteredMasterList.map((staff) => {
                          const isSelected = selectedStaff?.id === staff.id;
                          const alreadyInRoster = isCrewInRoster(staff.id);
                          return (
                            <button
                              key={staff.id}
                              type="button"
                              onClick={() => setSelectedStaff(staff)}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all ${
                                isSelected
                                  ? "bg-emerald-600 text-white shadow-md"
                                  : "bg-card hover:bg-muted border border-border"
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="font-black text-xs uppercase block truncate">{staff.clean_name || staff.crew_name}</span>
                                <span className={`text-[9px] ${isSelected ? "text-emerald-100" : "text-muted-foreground"}`}>
                                  {shortenPost(staff.post)} &middot; {staff.location} &middot; {staff.client}
                                </span>
                              </div>
                              {alreadyInRoster && (
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                                  isSelected ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-700 border border-amber-200"
                                }`}>In Roster</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Relief Notice */}
                {selectedStaff && isCrewInRoster(selectedStaff.id) && (() => {
                  const baseName = selectedStaff.clean_name || selectedStaff.crew_name;
                  const count = getCrewIdCount(selectedStaff.id);
                  const suffix = count === 1 ? "(R)" : `(R${count})`;
                  return (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2">
                      <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p className="text-[10px] font-bold text-amber-800 leading-relaxed">
                        <strong>{baseName}</strong> already exists in roster ({count} {count === 1 ? "entry" : "entries"}).
                        Will be added as <strong className="text-amber-900">{baseName} {suffix}</strong>.
                      </p>
                    </div>
                  );
                })()}

                {/* STEP 2: Assign Location */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 block">
                    Step 2 &mdash; Assign to
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Client</label>
                      <select
                        value={newStaffClient}
                        onChange={(e) => setNewStaffClient(e.target.value)}
                        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-400 uppercase"
                      >
                        <option value="">-- Select --</option>
                        {uniqueClients.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Trade / Post</label>
                      <select
                        value={newStaffPost}
                        onChange={(e) => setNewStaffPost(e.target.value)}
                        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-400 uppercase"
                      >
                        <option value="">-- Select --</option>
                        {uniquePosts.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Location</label>
                      <select
                        value={newStaffLocation}
                        onChange={(e) => setNewStaffLocation(e.target.value)}
                        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-400 uppercase"
                      >
                        <option value="">-- Select --</option>
                        {uniqueLocations.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                {selectedStaff && newStaffClient && newStaffPost && newStaffLocation && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-emerald-800 leading-relaxed">
                      Adding <strong>{selectedStaff.clean_name || selectedStaff.crew_name}{isCrewInRoster(selectedStaff.id) ? ` ${getCrewIdCount(selectedStaff.id) === 1 ? "(R)" : `(R${getCrewIdCount(selectedStaff.id)})`}` : ""}</strong> as <strong>{shortenPost(newStaffPost)}</strong> at <strong>{newStaffLocation}</strong> / <strong>{newStaffClient}</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => { setAddStaffModal(false); setSelectedStaff(null); setStaffSearchQuery(""); setNewStaffClient(""); setNewStaffPost(""); setNewStaffLocation(""); }}
                  className="px-5 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold text-[10px] uppercase tracking-wider transition-all border border-border"
                >Cancel</button>
                <button
                  type="button"
                  onClick={handleAddStaff}
                  disabled={!selectedStaff || !newStaffClient || !newStaffPost || !newStaffLocation}
                  className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${
                    selectedStaff && newStaffClient && newStaffPost && newStaffLocation
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg hover:shadow-emerald-500/30"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >Add to Roster</button>
              </div>
            </div>
          </div>
        )}

        {/* DELETE CONFIRMATION MODAL */}
        {deleteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl shadow-2xl border border-border w-full max-w-md p-8 animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight mb-2">
                  Delete Staff?
                </h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Are you sure you want to delete <strong className="text-foreground">{deleteModal.name}</strong>? This action cannot be undone.
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setDeleteModal(null)}
                    className="flex-1 px-6 py-3 rounded-2xl bg-muted hover:bg-muted/80 text-foreground font-black text-[11px] uppercase tracking-widest transition-all border border-border"
                  >
                    No, Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteStaff}
                    className="flex-1 px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-[11px] uppercase tracking-widest transition-all shadow-lg hover:shadow-red-500/30"
                  >
                    Yes, Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
