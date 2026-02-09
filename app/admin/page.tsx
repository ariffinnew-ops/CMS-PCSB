"use client";

import React from "react"

import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { PivotedCrewRow, TradeType } from "@/lib/types";
import { getPivotedRosterData, updateRosterRow, createRosterRow, deleteRosterRow, deleteCrewFromRoster, deleteCrewByName, getCrewList } from "@/lib/actions";
import { safeParseDate, getTradeRank, shortenPost } from "@/lib/logic";
import { getClients, getPostsForClient, getLocationsForClientPost } from "@/lib/client-location-map";

interface CrewListItem { id: string; crew_name: string; clean_name: string; post: string; client: string; location: string; status?: string }

export default function AdminPage() {
  const [data, setData] = useState<PivotedCrewRow[]>([]);
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
    crewId: string;
    name: string;
    post: string;
    rotationIdx: number;
    cycleRowId: number | null;
    note: string;
    relief_all: number | null;
    standby_all: number | null;
    day_relief: number | null;
    day_standby: number | null;
    is_offshore: boolean | null;
    medevac_dates: string[];
  } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Dynamic crew list from cms_pcsb_master
  const [crewList, setCrewList] = useState<CrewListItem[]>([]);

  // Add Staff modal state
  const [addModal, setAddModal] = useState<{ client: string; post: string; location: string } | null>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<CrewListItem | null>(null);
  // Duplicate confirmation: when the name already exists in roster
  const [dupeConfirm, setDupeConfirm] = useState<{ staff: CrewListItem; existingCount: number } | null>(null);
  const [customSuffix, setCustomSuffix] = useState("");
  const [newStaffClient, setNewStaffClient] = useState("");
  const [newStaffPost, setNewStaffPost] = useState("");
  const [newStaffLocation, setNewStaffLocation] = useState("");
  
  // Track newly added crew IDs for showing delete button
  const [newlyAddedCrewIds, setNewlyAddedCrewIds] = useState<Set<string>>(new Set());
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{ crewId: string; name: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [pivotedData, crewResult] = await Promise.all([getPivotedRosterData(), getCrewList()]);
    setData(pivotedData);
    if (crewResult.success && crewResult.data) setCrewList(crewResult.data);
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

  // Overlap detection using normalized cycles
  const getOverlaps = useMemo(() => {
    const alerts: Record<string, string[]> = {};
    const oms = data.filter((r) => r.post?.includes("OFFSHORE MEDIC"));

    oms.forEach((rowA) => {
      for (const [cycleNumA, cycleA] of Object.entries(rowA.cycles)) {
        const mA = safeParseDate(cycleA.sign_on);
        const dA = safeParseDate(cycleA.sign_off);
        if (!mA || !dA) continue;

        oms.forEach((rowB) => {
          if (rowA.crew_id === rowB.crew_id) return;
          if (rowA.location !== rowB.location || rowA.post !== rowB.post) return;

          for (const cycleB of Object.values(rowB.cycles)) {
            const mB = safeParseDate(cycleB.sign_on);
            const dB = safeParseDate(cycleB.sign_off);
            if (!mB || !dB) continue;

            if (mA.getTime() < dB.getTime() && dA.getTime() > mB.getTime()) {
              const key = `${rowA.crew_id}-${cycleNumA}`;
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

  // Handle updating a cycle's sign_on or sign_off
  const handleUpdate = async (crewRow: PivotedCrewRow, cycleNum: number, field: 'sign_on' | 'sign_off', value: string) => {
    const finalValue = value === "" ? null : value;
    const cycle = crewRow.cycles[cycleNum];
    
    setIsSyncing(true);

    if (cycle?.id) {
      // Update existing cycle row
      const result = await updateRosterRow(cycle.id, { [field]: finalValue });
      setIsSyncing(false);
      if (result.success) {
        setLastSynced(new Date());
        // Optimistic update
        setData(prev => prev.map(row => {
          if (row.crew_id !== crewRow.crew_id || row.crew_name !== crewRow.crew_name) return row;
          const newCycles = { ...row.cycles };
          if (newCycles[cycleNum]) {
            newCycles[cycleNum] = { ...newCycles[cycleNum], [field]: finalValue };
          }
          return { ...row, cycles: newCycles };
        }));
        showNotification("Update Synced", "success");
      } else {
        showNotification(result.error || "Update failed", "error");
        fetchData();
      }
    } else {
      // Create new cycle row
      const result = await createRosterRow({
        crew_id: crewRow.crew_id,
        crew_name: crewRow.crew_name,
        post: crewRow.post,
        client: crewRow.client,
        location: crewRow.location,
        cycle_number: cycleNum,
        [field]: finalValue,
      });
      setIsSyncing(false);
      if (result.success && result.data) {
        setLastSynced(new Date());
        setData(prev => prev.map(row => {
          if (row.crew_id !== crewRow.crew_id || row.crew_name !== crewRow.crew_name) return row;
          const newCycles = { ...row.cycles };
          newCycles[cycleNum] = {
            id: result.data!.id,
            sign_on: field === 'sign_on' ? finalValue : null,
            sign_off: field === 'sign_off' ? finalValue : null,
            notes: null,
            relief_all: null,
            standby_all: null,
            day_relief: null,
            day_standby: null,
            is_offshore: null,
            medevac_dates: null,
          };
          return { ...row, cycles: newCycles };
        }));
        showNotification("Update Synced", "success");
      } else {
        showNotification(result.error || "Update failed", "error");
        fetchData();
      }
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
      const updates: Record<string, unknown> = {
        notes: activeNote.note || null,
        relief_all: activeNote.relief_all,
        standby_all: activeNote.standby_all,
        day_relief: activeNote.day_relief,
        day_standby: activeNote.day_standby,
        is_offshore: activeNote.is_offshore,
        medevac_dates: activeNote.medevac_dates.filter(Boolean).length > 0 ? activeNote.medevac_dates.filter(Boolean) : null,
      };

      if (activeNote.cycleRowId) {
        await updateRosterRow(activeNote.cycleRowId, updates);
      } else {
        // Create cycle row with all fields
        const result = await createRosterRow({
          crew_id: activeNote.crewId,
          crew_name: activeNote.name,
          post: activeNote.post,
          client: '',
          location: '',
          cycle_number: activeNote.rotationIdx,
        });
        if (result.success && result.data) {
          await updateRosterRow(result.data.id, updates);
        }
      }
      showNotification("Saved", "success");
      setActiveNote(null);
      fetchData();
    }
  };

  const deleteNote = async () => {
    if (activeNote && activeNote.cycleRowId) {
      await updateRosterRow(activeNote.cycleRowId, { notes: null });
      showNotification("Note Deleted", "error");
      setActiveNote(null);
      fetchData();
    }
  };

  const calculateDays = (start: string | null, end: string | null) => {
    if (!start || !end) return null;
    const s = safeParseDate(start);
    const e = safeParseDate(end);
    if (!s || !e) return null;
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 3600 * 24));
    return diff > 0 ? diff : 0;
  };

  // Check if a crew_id already exists in the roster
  const isCrewInRoster = (crewId: string) => {
    return data.some((row) => row.crew_id === crewId);
  };

  // Build a lookup from crew_id -> clean display name from master
  const crewNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const staff of crewList) {
      map.set(staff.id, staff.clean_name || staff.crew_name);
    }
    return map;
  }, [crewList]);

  // Display name: resolve crew_name via master list, preserve any suffix like (R), (R1), (S), (S1), (P)
  const getDisplayName = (row: PivotedCrewRow) => {
    const masterName = crewNameMap.get(row.crew_id);
    if (!masterName) return row.crew_name; // fallback
    // Match any parenthesised suffix at end: (R1), (S), (P), (S/P), (R2), etc.
    const suffixMatch = (row.crew_name || "").match(/\s*(\([^)]+\))\s*$/);
    return suffixMatch ? `${masterName} ${suffixMatch[1]}` : masterName;
  };

  // Handle selecting a staff from the modal list
  const handleStaffSelect = (staff: CrewListItem) => {
    const baseName = staff.clean_name || staff.crew_name;
    const existingCount = data.filter((row) => row.crew_id === staff.id).length;
    if (existingCount > 0) {
      // Name exists in roster -- ask user to confirm and enter manual suffix
      setSelectedStaff(staff);
      setDupeConfirm({ staff, existingCount });
      setCustomSuffix("");
      return;
    }
    // Name is new -- insert directly
    doInsertStaff(staff, baseName);
  };

  // Insert after user confirms duplicate with custom suffix
  const handleDupeConfirmAdd = () => {
    if (!dupeConfirm) return;
    const baseName = dupeConfirm.staff.clean_name || dupeConfirm.staff.crew_name;
    const suffix = customSuffix.trim();
    if (!suffix) {
      showNotification("Please enter a suffix (e.g. R1, S, P)", "error");
      return;
    }
    const finalName = `${baseName} (${suffix})`;
    // Check for duplicate name in roster
    const isDupe = data.some((row) => row.crew_name?.trim().toUpperCase() === finalName.trim().toUpperCase());
    if (isDupe) {
      showNotification(`"${finalName}" already exists in roster. Use a different suffix.`, "error");
      return;
    }
    doInsertStaff(dupeConfirm.staff, finalName);
    setDupeConfirm(null);
    setCustomSuffix("");
  };

  // Core insert function
  const doInsertStaff = async (staff: CrewListItem, finalName: string) => {
    if (!addModal) return;
    setIsSyncing(true);
    const payload = {
      crew_id: staff.id,
      crew_name: finalName,
      post: newStaffPost || addModal.post,
      client: newStaffClient || addModal.client,
      location: newStaffLocation || addModal.location,
      cycle_number: 1,
    };

    const result = await createRosterRow(payload);
    setIsSyncing(false);

    if (result.success) {
      setNewlyAddedCrewIds((prev) => new Set([...prev, staff.id]));
      setLastSynced(new Date());
      showNotification(`${finalName} added successfully`, "success");
      await fetchData();
    } else {
      showNotification(result.error || "Failed to add staff", "error");
    }
    closeAddModal();
  };

  const closeAddModal = () => {
    setAddModal(null);
    setSelectedStaff(null);
    setStaffSearchQuery("");
    setDupeConfirm(null);
    setCustomSuffix("");
    setNewStaffClient("");
    setNewStaffPost("");
    setNewStaffLocation("");
  };

  // Delete staff - removes cycle rows for this specific crew_id + crew_name
  const handleDeleteStaff = async () => {
    if (!deleteModal) return;
    
    const { crewId, name } = deleteModal;
    setDeleteModal(null);
    
    setIsSyncing(true);
    // Use name-specific delete so suffixed entries don't wipe the original
    const result = await deleteCrewByName(crewId, name);
    setIsSyncing(false);
    
    if (result.success) {
      setData((prev) => prev.filter((row) => !(row.crew_id === crewId && row.crew_name === name)));
      setLastSynced(new Date());
      showNotification(`${name} deleted`, "success");
    } else {
      showNotification(result.error || "Failed to delete", "error");
    }
  };

  // Cascading dropdown options
  const mapClients = useMemo(() => getClients(), []);
  const mapPosts = useMemo(() => newStaffClient ? getPostsForClient(newStaffClient) : [], [newStaffClient]);
  const mapLocations = useMemo(() => (newStaffClient && newStaffPost) ? getLocationsForClientPost(newStaffClient, newStaffPost) : [], [newStaffClient, newStaffPost]);

  // Filter crew list for add-staff modal
  const filteredMasterList = useMemo(() => {
    if (!addModal) return [];
    const q = staffSearchQuery.toLowerCase();
    return crewList.filter((staff) => {
      return (staff.clean_name || staff.crew_name || '').toLowerCase().includes(q) ||
             (staff.crew_name || '').toLowerCase().includes(q);
    });
  }, [addModal, staffSearchQuery, crewList]);

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
                    <Fragment key={`${row.crew_id}::${row.crew_name}`}>
                      {showSeparator && (
                        <tr className="sticky top-0 z-[90] bg-slate-900 border-y border-slate-950 shadow-xl w-full">
                          <td className="px-6 py-2 sticky left-0 z-[95] bg-slate-900 border-r border-slate-800">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-col">
                                <span className="text-[15px] font-black text-white uppercase tracking-wider leading-tight">
                                  {shortenPost(row.post)}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide leading-tight">
                                  {row.location} / {row.client}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddModal({ client: row.client, post: row.post, location: row.location });
                                  setNewStaffClient(row.client);
                                  setNewStaffPost(row.post);
                                  setNewStaffLocation(row.location);
                                  setSelectedStaff(null);
                                  setStaffSearchQuery("");
                                }}
                                className="flex items-center justify-center w-7 h-7 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full text-lg font-black transition-all shadow-md hover:shadow-emerald-500/40 hover:scale-110 shrink-0"
                                title={`Add staff to ${shortenPost(row.post)} at ${row.location}`}
                              >
                                +
                              </button>
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
                              onClick={() => setDeleteModal({ crewId: row.crew_id, name: row.crew_name })}
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
                              const cycle = row.cycles[rotationIdx];
                              const mVal = cycle?.sign_on || '';
                              const dVal = cycle?.sign_off || '';
                              const days = calculateDays(mVal || null, dVal || null);
                              const hasNote = !!(cycle?.notes);
                              const alertKey = `${row.crew_id}-${rotationIdx}`;
                              const conflicts = getOverlaps[alertKey];
                              const isRelief = cycle?.relief_all && cycle.relief_all > 0;

                              const shouldShowSlot =
                                rotationIdx <= 12 ||
                                !!mVal ||
                                !!dVal ||
                                (rotationIdx > 1 && !!row.cycles[rotationIdx - 1]?.sign_on);
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
                                    } ${isRelief ? "ring-2 ring-amber-400" : ""}`}
                                  >
                                    <div className="flex flex-col">
                                      <div className="flex justify-between items-center mb-0.5">
                                        <span className="text-[7px] font-black text-muted-foreground uppercase tracking-tighter">
                                          SIGN ON {rotationIdx}
                                          {isRelief && <span className="ml-1 text-amber-600">(R{rotationIdx})</span>}
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
                                          handleUpdate(row, rotationIdx, 'sign_on', e.target.value)
                                        }
                                        className="border border-border rounded-xl px-2.5 py-1.5 text-[11px] font-black w-36 outline-none focus:ring-2 focus:ring-slate-400 bg-muted text-foreground transition-all"
                                      />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[7px] font-black text-red-500 mb-0.5 ml-1 uppercase tracking-tighter">
                                        SIGN OFF {rotationIdx}
                                      </span>
                                      <input
                                        type="date"
                                        value={dVal || ""}
                                        onChange={(e) =>
                                          handleUpdate(row, rotationIdx, 'sign_off', e.target.value)
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
                                            text: cycle?.notes || '',
                                            x: e.clientX,
                                            y: e.clientY,
                                          })
                                        }
                                        onMouseLeave={() =>
                                          setHoveredNote(null)
                                        }
                                        onClick={() =>
                                          setActiveNote({
                                            crewId: row.crew_id,
                                            name: row.crew_name,
                                            post: row.post || "",
                                            rotationIdx,
                                            cycleRowId: cycle?.id || null,
                                            note: cycle?.notes || "",
                                            relief_all: cycle?.relief_all ?? null,
                                            standby_all: cycle?.standby_all ?? null,
                                            day_relief: cycle?.day_relief ?? null,
                                            day_standby: cycle?.day_standby ?? null,
                                            is_offshore: cycle?.is_offshore ?? true,
                                            medevac_dates: cycle?.medevac_dates ?? [],
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
                                    !!row.cycles[rotationIdx + 1]?.sign_on && (
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

        {/* CYCLE DETAIL MODAL */}
        {activeNote && (() => {
          const isOM = (activeNote.post || "").toUpperCase().includes("OFFSHORE MEDIC");
          const isEM = (activeNote.post || "").toUpperCase().includes("ESCORT MEDIC");
          return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl border border-border flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-slate-900 rounded-t-2xl shrink-0">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white">{activeNote.name}</h3>
                  <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wide mt-0.5">
                    Cycle {activeNote.rotationIdx} &middot; {shortenPost(activeNote.post)}
                  </p>
                </div>
                <button type="button" onClick={() => setActiveNote(null)} className="text-white/60 hover:text-white text-lg font-bold w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors">&times;</button>
              </div>

              <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: "thin" }}>
                {/* Field A: Offshore Allowance - only for OFFSHORE MEDIC */}
                {isOM && (
                  <div>
                    <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                      Offshore Allowance
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveNote({ ...activeNote, is_offshore: true })}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                          activeNote.is_offshore === true
                            ? "bg-emerald-600 text-white border-emerald-500 shadow-md"
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveNote({ ...activeNote, is_offshore: false })}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                          activeNote.is_offshore === false
                            ? "bg-red-600 text-white border-red-500 shadow-md"
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                        }`}
                      >
                        No
                      </button>
                    </div>
                    <p className="text-[8px] text-muted-foreground mt-1">Offshore allowance will be calculated if set to Yes.</p>
                  </div>
                )}

                {/* Field B: Relief Allowance - all crew */}
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                    Relief Allowance
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">No. of Days</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={activeNote.day_relief ?? ""}
                        onChange={(e) => setActiveNote({ ...activeNote, day_relief: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="0"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-400 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Rate (RM/day)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={activeNote.relief_all ?? ""}
                        onChange={(e) => setActiveNote({ ...activeNote, relief_all: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="0.00"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-400 tabular-nums"
                      />
                    </div>
                  </div>
                  {(activeNote.day_relief ?? 0) > 0 && (activeNote.relief_all ?? 0) > 0 && (
                    <p className="text-[8px] text-blue-500 font-bold mt-1">
                      Total: RM {((activeNote.day_relief ?? 0) * (activeNote.relief_all ?? 0)).toFixed(2)}
                    </p>
                  )}
                </div>

                {/* Field B2: Standby Allowance - all crew */}
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                    Standby Allowance
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">No. of Days</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={activeNote.day_standby ?? ""}
                        onChange={(e) => setActiveNote({ ...activeNote, day_standby: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="0"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-400 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Rate (RM/day)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={activeNote.standby_all ?? ""}
                        onChange={(e) => setActiveNote({ ...activeNote, standby_all: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="0.00"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-400 tabular-nums"
                      />
                    </div>
                  </div>
                  {(activeNote.day_standby ?? 0) > 0 && (activeNote.standby_all ?? 0) > 0 && (
                    <p className="text-[8px] text-blue-500 font-bold mt-1">
                      Total: RM {((activeNote.day_standby ?? 0) * (activeNote.standby_all ?? 0)).toFixed(2)}
                    </p>
                  )}
                </div>

                {/* Field C: Medevac Case - only for ESCORT MEDIC */}
                {isEM && (
                  <div>
                    <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                      Medevac Cases ({activeNote.medevac_dates.length}/5)
                    </label>
                    <div className="space-y-2">
                      {activeNote.medevac_dates.map((dateVal, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-[8px] font-bold text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                          <input
                            type="date"
                            value={dateVal}
                            onChange={(e) => {
                              const newDates = [...activeNote.medevac_dates];
                              newDates[idx] = e.target.value;
                              setActiveNote({ ...activeNote, medevac_dates: newDates });
                            }}
                            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newDates = activeNote.medevac_dates.filter((_, i) => i !== idx);
                              setActiveNote({ ...activeNote, medevac_dates: newDates });
                            }}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 text-sm font-bold transition-colors shrink-0"
                            title="Remove date"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                      {activeNote.medevac_dates.length < 5 && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveNote({ ...activeNote, medevac_dates: [...activeNote.medevac_dates, ""] });
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 font-bold text-[10px] uppercase tracking-wider transition-colors border border-blue-500/20"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                          Add Date
                        </button>
                      )}
                    </div>
                    <p className="text-[8px] text-muted-foreground mt-1.5">Up to 5 medevac case dates per cycle.</p>
                  </div>
                )}

                {/* Field D: Notes */}
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                    Notes
                  </label>
                  <textarea
                    value={activeNote.note}
                    onChange={(e) => setActiveNote({ ...activeNote, note: e.target.value })}
                    placeholder="Enter cycle notes..."
                    className="w-full h-24 bg-muted border border-border rounded-lg p-3 text-xs outline-none focus:ring-2 focus:ring-slate-400 resize-none leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 rounded-b-2xl shrink-0">
                {activeNote.cycleRowId && activeNote.note && (
                  <button type="button" onClick={deleteNote} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-wider transition-all">
                    Delete Note
                  </button>
                )}
                <button type="button" onClick={() => setActiveNote(null)} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold text-[10px] uppercase tracking-wider transition-all border border-border">
                  Cancel
                </button>
                <button type="button" onClick={saveNote} className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-black text-[10px] uppercase tracking-wider transition-all shadow-lg">
                  Save All
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ADD STAFF MODAL -- popup with searchable name list */}
        {addModal && !dupeConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border flex flex-col max-h-[75vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-emerald-600 rounded-t-2xl shrink-0">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white">Add Staff</h3>
                  <p className="text-[9px] font-bold text-emerald-100 uppercase tracking-wide">
                    {shortenPost(addModal.post)} &middot; {addModal.location} / {addModal.client}
                  </p>
                </div>
                <button type="button" onClick={closeAddModal} className="text-white/80 hover:text-white text-lg font-bold w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors">&times;</button>
              </div>

              {/* Search */}
              <div className="px-4 pt-3 pb-2 shrink-0">
                <input
                  type="text"
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                  placeholder="Search master list by name..."
                  autoFocus
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-[10px] font-bold outline-none focus:ring-2 focus:ring-emerald-400 uppercase"
                />
              </div>

              {/* Name List */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0" style={{ scrollbarWidth: "thin" }}>
                {filteredMasterList.length === 0 && staffSearchQuery.length > 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-[10px] font-bold uppercase">No results found</div>
                ) : staffSearchQuery.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-[10px] font-bold uppercase">Type to search...</div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {filteredMasterList.slice(0, 30).map((staff) => {
                      const alreadyInRoster = isCrewInRoster(staff.id);
                      return (
                        <button
                          key={staff.id}
                          type="button"
                          onClick={() => handleStaffSelect(staff)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left transition-all hover:bg-emerald-50 rounded-lg border border-transparent hover:border-emerald-200"
                        >
                          <div className="min-w-0">
                            <span className="font-black text-[10px] uppercase block truncate text-foreground">{staff.clean_name || staff.crew_name}</span>
                            <span className="text-[8px] text-muted-foreground">{shortenPost(staff.post)} &middot; {staff.location} &middot; {staff.client}</span>
                          </div>
                          {alreadyInRoster && (
                            <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ml-2 bg-amber-100 text-amber-700 border border-amber-200">In Roster</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end px-4 py-2.5 border-t border-border bg-muted/30 rounded-b-2xl shrink-0">
                <button type="button" onClick={closeAddModal} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold text-[10px] uppercase tracking-wider transition-all border border-border">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DUPLICATE NAME CONFIRMATION MODAL */}
        {dupeConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-amber-500 rounded-t-2xl shrink-0">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white">Name Already in Roster</h3>
                  <p className="text-[9px] font-bold text-amber-100 uppercase tracking-wide">
                    {dupeConfirm.existingCount} existing {dupeConfirm.existingCount === 1 ? "entry" : "entries"}
                  </p>
                </div>
                <button type="button" onClick={() => { setDupeConfirm(null); setCustomSuffix(""); }} className="text-white/80 hover:text-white text-lg font-bold w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors">&times;</button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-amber-900">
                    <strong>{dupeConfirm.staff.clean_name || dupeConfirm.staff.crew_name}</strong> already exists in the roster.
                  </p>
                  <p className="text-[9px] text-amber-700 mt-1">
                    Enter a suffix to differentiate (e.g. R1, R2, S, P).
                  </p>
                </div>

                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">
                    Name with suffix
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-foreground uppercase truncate max-w-[180px]">
                      {dupeConfirm.staff.clean_name || dupeConfirm.staff.crew_name}
                    </span>
                    <span className="text-muted-foreground font-bold text-sm">(</span>
                    <input
                      type="text"
                      value={customSuffix}
                      onChange={(e) => setCustomSuffix(e.target.value.toUpperCase())}
                      placeholder="R1"
                      autoFocus
                      className="w-20 bg-muted border-2 border-amber-400 rounded-lg px-2 py-1.5 text-[11px] font-black outline-none focus:ring-2 focus:ring-amber-400 uppercase text-center"
                    />
                    <span className="text-muted-foreground font-bold text-sm">)</span>
                  </div>
                  {customSuffix.trim() && (
                    <p className="text-[9px] font-bold text-emerald-700 mt-2">
                      Will be saved as: <strong>{dupeConfirm.staff.clean_name || dupeConfirm.staff.crew_name} ({customSuffix.trim()})</strong>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 rounded-b-2xl shrink-0">
                <button type="button" onClick={() => { setDupeConfirm(null); setCustomSuffix(""); }} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold text-[10px] uppercase tracking-wider transition-all border border-border">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDupeConfirmAdd}
                  disabled={!customSuffix.trim()}
                  className={`px-5 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                    customSuffix.trim()
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg hover:shadow-emerald-500/30"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >Confirm &amp; Add</button>
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
                  Are you sure you want to delete <strong className="text-foreground">{deleteModal.name}</strong> and all their cycle data? This action cannot be undone.
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
