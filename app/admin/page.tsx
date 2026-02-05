"use client";

import React from "react"

import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow, TradeType } from "@/lib/types";
import { getRosterData, updateRosterRow, createRosterRow } from "@/lib/actions";
import { safeParseDate, getTradeRank, shortenPost } from "@/lib/logic";

// Master list of staff for selection (from staff_rows concept)
const MASTER_STAFF_LIST = [
  { name: "HENRY MISUN", post: "OFFSHORE MEDIC", client: "SBA", location: "ERB WEST (EW)" },
  { name: "RICKEY BIN PATREK", post: "OFFSHORE MEDIC", client: "SBA", location: "ERB WEST (EW)" },
  { name: "EDDYIANSAH BIN HADIR", post: "OFFSHORE MEDIC", client: "SBA", location: "KINABALU (KNAG)" },
  { name: "EVORY LEY JOULIS", post: "OFFSHORE MEDIC", client: "SBA", location: "KINABALU (KNAG)" },
  { name: "BRANDON ALEX JR AUGUSTINE", post: "OFFSHORE MEDIC", client: "SBA", location: "SAMARANG (SM)" },
  { name: "LIANUS BIN ELLING", post: "OFFSHORE MEDIC", client: "SBA", location: "SAMARANG (SM)" },
  { name: "SONNYBOY BIN ABD RAZAK", post: "OFFSHORE MEDIC", client: "SBA", location: "SUMANDAK (SUPD)" },
  { name: "MOHAMAD FAZLEE BIN ZULKIPLEE", post: "ESCORT MEDIC", client: "SBA", location: "KK" },
  { name: "ALLEN JOE MAININ", post: "ESCORT MEDIC", client: "SBA", location: "KK" },
  { name: "NOOR ARIFF AKMAL BIN NOORBI", post: "ESCORT MEDIC", client: "SBA", location: "KK" },
  { name: "MOHD ZULFADLI BIN ALIAS", post: "ESCORT MEDIC", client: "SBA", location: "LABUAN" },
  { name: "ROMUALD JEOFFRY", post: "ESCORT MEDIC", client: "SBA", location: "LABUAN" },
  { name: "MOHD SABRI BIN LADISMA", post: "ESCORT MEDIC", client: "SBA", location: "LABUAN" },
  { name: "ANDERSON EDWARD", post: "IM / OHN", client: "SBA", location: "SOGT" },
  { name: "JUNIOR FLORIAN MARITUS", post: "IM / OHN", client: "SBA", location: "SBA OFFICE" },
  { name: "GREGORY CHAN WAN TSUI", post: "OFFSHORE MEDIC", client: "SKA", location: "BARAM" },
  { name: "BALAN IBAU", post: "OFFSHORE MEDIC", client: "SKA", location: "BARAM" },
  { name: "QIQIE QUSYAIRI BIN MINGTIAN", post: "OFFSHORE MEDIC", client: "SKA", location: "TUKAU" },
  { name: "ADAM FAHMI BIN ISKANDAR", post: "OFFSHORE MEDIC", client: "SKA", location: "TUKAU" },
  { name: "DAVID ANAK JIMIT", post: "OFFSHORE MEDIC", client: "SKA", location: "TEMANA" },
  { name: "ANSELM ANAK YABI", post: "OFFSHORE MEDIC", client: "SKA", location: "TEMANA" },
  { name: "RAZLAN BIN ABANG", post: "OFFSHORE MEDIC", client: "SKA", location: "M1" },
  { name: "HAZXIEKEN ANAK GUNDAH", post: "OFFSHORE MEDIC", client: "SKA", location: "M1" },
  { name: "MUHAMMAD ZAMRI ABDULLAH", post: "OFFSHORE MEDIC", client: "SKA", location: "NC3" },
  { name: "CHRISTMA ANAK JOE", post: "OFFSHORE MEDIC", client: "SKA", location: "NC3" },
  { name: "DENIL ANAK AWANG", post: "OFFSHORE MEDIC", client: "SKA", location: "KASAWARI" },
  { name: "MOHAMAD ZARUL HAFIZ BIN ROSLI", post: "OFFSHORE MEDIC", client: "SKA", location: "KASAWARI" },
  { name: "ARIFF FAQRI BIN BUANG", post: "OFFSHORE MEDIC", client: "SKA", location: "B11" },
  { name: "MUHD FIRDAUS AINUL TAN ABDULLAH", post: "OFFSHORE MEDIC", client: "SKA", location: "B11" },
  { name: "GERSHWIN SIRAI ANAK KILIM", post: "OFFSHORE MEDIC", client: "SKA", location: "BARONIA" },
  { name: "MOHD ASRI BIN SABRI", post: "OFFSHORE MEDIC", client: "SKA", location: "BARONIA" },
  { name: "MOHAMMAD FAUZAN BIN MADHI", post: "OFFSHORE MEDIC", client: "SKA", location: "KANOWIT KAKG" },
  { name: "LAWRENCE SAWANG ANAK MEROM", post: "OFFSHORE MEDIC", client: "SKA", location: "KANOWIT KAKG" },
  { name: "MOHAMAD FIROUZ BIN MOHAMAD ISKANDAR", post: "OFFSHORE MEDIC", client: "SKA", location: "E11" },
  { name: "LESLIE SONJA ANAK MIKE", post: "OFFSHORE MEDIC", client: "SKA", location: "E11" },
  { name: "COLLIN KRANK ANAK ACHAI @ JEMBAI", post: "OFFSHORE MEDIC", client: "SKA", location: "BOKOR" },
  { name: "ZULKURNAIN BIN SAHARI", post: "OFFSHORE MEDIC", client: "SKA", location: "BOKOR" },
  { name: "ANSLEM CLARENCE ANAK GAUP", post: "OFFSHORE MEDIC", client: "SKA", location: "D35" },
  { name: "MOHD HANS AIQAL ABDULLAH", post: "OFFSHORE MEDIC", client: "SKA", location: "D35" },
  { name: "ZAINAB BINTI SUIF", post: "ESCORT MEDIC", client: "SKA", location: "MIRI" },
  { name: "PETRUS MEROM ANAK NGELAI", post: "ESCORT MEDIC", client: "SKA", location: "MIRI" },
  { name: "MOHD LUTFI BIN MOHAMAD MORTABZA", post: "ESCORT MEDIC", client: "SKA", location: "MIRI" },
  { name: "DEXTER NGILAH ANAK DENNEL", post: "ESCORT MEDIC", client: "SKA", location: "BINTULU" },
  { name: "ROGER WATSON AJENG JOK", post: "ESCORT MEDIC", client: "SKA", location: "BINTULU" },
];

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

  // Add Staff Modal State
  const [addStaffModal, setAddStaffModal] = useState<{
    client: string;
    post: string;
    location: string;
  } | null>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<typeof MASTER_STAFF_LIST[0] | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const rosterData = await getRosterData();
    setData(rosterData);
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
    // If date field is cleared, set to null
    const finalValue = value === "" ? null : value;
    
    // Optimistic update
    const updatedData = data.map((r) =>
      r.id === id ? { ...r, [field]: finalValue } : r
    );
    setData(updatedData);
    setIsSyncing(true);
    
    // Persist to Supabase (send null for cleared dates)
    const result = await updateRosterRow(id, { [field]: finalValue });
    setIsSyncing(false);
    
    if (result.success) {
      setLastSynced(new Date());
      showNotification("Update Synced", "success");
    } else {
      showNotification(result.error || "Update failed", "error");
      // Revert on failure
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

  const saveNote = () => {
    if (activeNote) {
      const key = `${activeNote.id}-${activeNote.rotationIdx}`;
      setNotesStore((prev) => ({ ...prev, [key]: activeNote.note }));
      showNotification("Note Saved", "success");
      setActiveNote(null);
    }
  };

  const deleteNote = () => {
    if (activeNote) {
      const key = `${activeNote.id}-${activeNote.rotationIdx}`;
      const newStore = { ...notesStore };
      delete newStore[key];
      setNotesStore(newStore);
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

  // Check if staff already exists in current roster (for Relief logic)
  const isStaffInRoster = (staffName: string) => {
    const baseName = staffName.replace(/\s*\([PSRS12]+\)\s*$/i, "").trim();
    return data.some((row) => {
      const rowBaseName = row.crew_name.replace(/\s*\([PSRS12]+\)\s*$/i, "").replace(/\s*\(R\)\s*$/i, "").trim();
      return rowBaseName.toLowerCase() === baseName.toLowerCase();
    });
  };

  // Add new staff to roster
  const handleAddStaff = async () => {
    if (!selectedStaff || !addStaffModal) return;

    setIsSyncing(true);

    // Check if this is a relief (staff exists but being added to different location/post)
    const isRelief = isStaffInRoster(selectedStaff.name);
    const staffName = isRelief 
      ? `${selectedStaff.name} (R)` 
      : selectedStaff.name;

    // Create new roster row with empty rotation fields
    const newRow: Omit<RosterRow, 'id'> = {
      crew_name: staffName,
      post: addStaffModal.post,
      client: addStaffModal.client,
      location: addStaffModal.location,
      roles_em: "",
      // Initialize with empty rotation fields for immediate editing
      m1: null,
      d1: null,
    };

    const result = await createRosterRow(newRow);
    setIsSyncing(false);

    if (result.success && result.data) {
      // Add to local data immediately
      setData((prev) => [...prev, result.data!]);
      setLastSynced(new Date());
      showNotification(`${staffName} added successfully`, "success");
    } else {
      showNotification(result.error || "Failed to add staff", "error");
    }

    // Close modal and reset
    setAddStaffModal(null);
    setSelectedStaff(null);
    setStaffSearchQuery("");
  };

  // Filter master list for modal
  const filteredMasterList = useMemo(() => {
    if (!addStaffModal) return [];
    
    return MASTER_STAFF_LIST.filter((staff) => {
      const matchesSearch = staff.name.toLowerCase().includes(staffSearchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [addStaffModal, staffSearchQuery]);

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
      <div className="flex flex-col h-full max-h-[calc(100vh-100px)] mt-4 relative">
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
        <div className="flex flex-col lg:flex-row lg:items-end justify-between border-b border-border pb-4 flex-shrink-0 gap-6">
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
            <div className="flex flex-wrap items-center gap-3 bg-muted p-2 rounded-2xl border border-border shadow-inner">
              <div className="flex flex-col px-3 border-r border-border">
                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">
                  Grade
                </span>
                <select
                  value={tradeFilter}
                  onChange={(e) =>
                    setTradeFilter(e.target.value as TradeType | "ALL")
                  }
                  className="bg-transparent text-[10px] font-black uppercase outline-none cursor-pointer"
                >
                  <option value="ALL">ALL TRADES</option>
                  <option value="OM">OM</option>
                  <option value="EM">EM</option>
                  <option value="IMP/OHN">OHN</option>
                </select>
              </div>
              <div className="flex flex-col px-3 border-r border-border">
                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">
                  Site
                </span>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase outline-none cursor-pointer max-w-[150px]"
                >
                  <option value="ALL">ALL SITES</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col px-3">
                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">
                  Search
                </span>
                <input
                  type="text"
                  placeholder="..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent border-none p-0 text-[10px] font-black uppercase outline-none w-28"
                />
              </div>
            </div>

            
          </div>
        </div>

        {/* TIMELINE NAVIGATION */}
        <div className="bg-card/50 backdrop-blur-md p-2 border-b border-border flex items-center gap-4 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3 flex-grow px-4">
            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.2em]">
              Matrix View Shift
            </span>
            <input
              type="range"
              min="0"
              max={maxScroll}
              value={scrollPos}
              onChange={handleSliderChange}
              className="flex-grow h-4 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 rounded-full appearance-none cursor-pointer shadow-inner border border-slate-400"
              style={{
                WebkitAppearance: 'none',
              }}
            />
            <style jsx>{`
              input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 28px;
                height: 28px;
                background: linear-gradient(145deg, #1e3a5f, #0f172a);
                border-radius: 50%;
                cursor: grab;
                box-shadow: 
                  0 4px 8px rgba(0, 0, 0, 0.4),
                  0 2px 4px rgba(0, 0, 0, 0.3),
                  inset 0 2px 4px rgba(255, 255, 255, 0.1),
                  inset 0 -2px 4px rgba(0, 0, 0, 0.2);
                border: 3px solid #334155;
                transition: all 0.2s ease;
              }
              input[type="range"]::-webkit-slider-thumb:hover {
                transform: scale(1.1);
                background: linear-gradient(145deg, #2563eb, #1e40af);
              }
              input[type="range"]::-webkit-slider-thumb:active {
                cursor: grabbing;
                transform: scale(0.95);
              }
              input[type="range"]::-moz-range-thumb {
                width: 28px;
                height: 28px;
                background: linear-gradient(145deg, #1e3a5f, #0f172a);
                border-radius: 50%;
                cursor: grab;
                box-shadow: 
                  0 4px 8px rgba(0, 0, 0, 0.4),
                  0 2px 4px rgba(0, 0, 0, 0.3),
                  inset 0 2px 4px rgba(255, 255, 255, 0.1),
                  inset 0 -2px 4px rgba(0, 0, 0, 0.2);
                border: 3px solid #334155;
              }
            `}</style>
            <span className="text-[9px] font-black text-foreground tabular-nums w-10 text-right">
              {Math.round((scrollPos / (maxScroll || 1)) * 100)}%
            </span>
          </div>
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
                          <td className="px-6 py-2.5 sticky left-0 z-[95] bg-slate-900 border-r border-slate-800">
                            <div className="flex items-center gap-3">
                              <div className="text-[9px] font-black text-white uppercase tracking-widest truncate leading-none">
                                {row.client} / {shortenPost(row.post)} /{" "}
                                {row.location}
                              </div>
                              <button
                                type="button"
                                onClick={() => setAddStaffModal({
                                  client: row.client,
                                  post: row.post,
                                  location: row.location,
                                })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[8px] font-black uppercase tracking-wide transition-all shadow-lg hover:shadow-emerald-500/30"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                Add Staff
                              </button>
                            </div>
                          </td>
                          <td className="bg-slate-900 py-2.5 h-10 w-full" />
                        </tr>
                      )}
                      <tr className="transition-colors group h-14 hover:bg-blue-50/20">
                        <td className="px-6 py-2 sticky left-0 bg-card group-hover:bg-muted/50 z-50 border-r border-border shadow-sm">
                          <span className="font-black text-foreground text-[11px] uppercase leading-tight block tracking-tight whitespace-normal break-words">
                            {row.crew_name}
                          </span>
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
                                    className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all ${
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
            className="fixed z-[3000] bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/10 pointer-events-none max-w-xs animate-in zoom-in duration-200"
            style={{ left: hoveredNote.x + 10, top: hoveredNote.y + 10 }}
          >
            <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">
              Rotation Note Preview
            </p>
            <p className="text-[10px] font-bold leading-relaxed">
              {hoveredNote.text}
            </p>
          </div>
        )}

        {/* NOTE MODAL */}
        {activeNote && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-lg z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-card rounded-[3rem] w-full max-w-xl shadow-2xl p-10 border border-border">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-3xl font-black uppercase italic text-foreground leading-none">
                    {activeNote.name}
                  </h3>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mt-3 italic">
                    Rotation Cycle {activeNote.rotationIdx} Log
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNote(null)}
                  className="text-muted-foreground hover:text-foreground text-3xl font-light"
                >
                  x
                </button>
              </div>

              <textarea
                value={activeNote.note}
                onChange={(e) =>
                  setActiveNote({ ...activeNote, note: e.target.value })
                }
                placeholder="Enter rotation notes, observations, or special instructions..."
                className="w-full h-40 bg-muted border border-border rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              />

              <div className="flex justify-end gap-3 mt-6">
                {notesStore[`${activeNote.id}-${activeNote.rotationIdx}`] && (
                  <button
                    type="button"
                    onClick={deleteNote}
                    className="px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-widest transition-all"
                  >
                    Delete Note
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveNote}
                  className="px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-[10px] uppercase tracking-widest transition-all"
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ADD STAFF MODAL */}
        {addStaffModal && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-lg z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-card rounded-[3rem] w-full max-w-2xl shadow-2xl p-10 border border-border">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-3xl font-black uppercase italic text-foreground leading-none">
                    Add Staff
                  </h3>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] mt-3 italic">
                    {addStaffModal.client} / {shortenPost(addStaffModal.post)} / {addStaffModal.location}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddStaffModal(null);
                    setSelectedStaff(null);
                    setStaffSearchQuery("");
                  }}
                  className="text-muted-foreground hover:text-foreground text-3xl font-light"
                >
                  x
                </button>
              </div>

              {/* Search Input */}
              <div className="mb-6">
                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                  Search Master List
                </label>
                <input
                  type="text"
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                  placeholder="Type staff name..."
                  className="w-full bg-muted border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {/* Staff List */}
              <div className="h-64 overflow-y-auto bg-muted/50 rounded-2xl border border-border p-2 mb-6">
                {filteredMasterList.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No staff found
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredMasterList.map((staff, idx) => {
                      const isSelected = selectedStaff?.name === staff.name;
                      const alreadyInRoster = isStaffInRoster(staff.name);
                      
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedStaff(staff)}
                          className={`flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all ${
                            isSelected
                              ? "bg-emerald-600 text-white"
                              : "bg-card hover:bg-muted border border-border"
                          }`}
                        >
                          <div>
                            <span className="font-black text-[11px] uppercase block">
                              {staff.name}
                            </span>
                            <span className={`text-[9px] ${isSelected ? "text-emerald-100" : "text-muted-foreground"}`}>
                              {staff.post} - {staff.location}
                            </span>
                          </div>
                          {alreadyInRoster && (
                            <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${
                              isSelected ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-700"
                            }`}>
                              Will add as (R)
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Relief Notice */}
              {selectedStaff && isStaffInRoster(selectedStaff.name) && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-wide">
                    Relief Assignment Notice
                  </p>
                  <p className="text-[11px] text-amber-600 mt-1">
                    {selectedStaff.name} already exists in the roster. They will be added as <strong>{selectedStaff.name} (R)</strong> to indicate relief status.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAddStaffModal(null);
                    setSelectedStaff(null);
                    setStaffSearchQuery("");
                  }}
                  className="px-6 py-3 rounded-2xl bg-muted hover:bg-muted/80 text-foreground font-black text-[10px] uppercase tracking-widest transition-all border border-border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddStaff}
                  disabled={!selectedStaff}
                  className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                    selectedStaff
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  Add to Roster
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
