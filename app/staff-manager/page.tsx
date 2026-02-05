"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow, TradeType } from "@/lib/types";
import { getRosterData, createRosterRow, updateRosterRow, deleteRosterRow } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const POST_OPTIONS = [
  "OFFSHORE MEDIC",
  "ESCORT MEDIC",
  "IM PRACTITIONER",
  "OHN",
];

const CLIENT_OPTIONS = ["SKA", "SBA"];

export default function StaffManagerPage() {
  const [data, setData] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState<TradeType | "ALL">("ALL");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<RosterRow | null>(null);

  const [formData, setFormData] = useState({
    crew_name: "",
    post: "",
    client: "",
    location: "",
    roles_em: "",
  });

  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const rosterData = await getRosterData();
    setData(rosterData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const locations = useMemo(() => {
    const locs = Array.from(new Set(data.map((r) => r.location))).filter(Boolean);
    return locs.sort();
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      const matchesSearch = row.crew_name?.toLowerCase().includes(search.toLowerCase());
      const matchesTrade =
        tradeFilter === "ALL" ||
        (tradeFilter === "OM" && row.post?.includes("OFFSHORE MEDIC")) ||
        (tradeFilter === "EM" && row.post?.includes("ESCORT MEDIC")) ||
        (tradeFilter === "IMP/OHN" && (row.post?.includes("IM") || row.post?.includes("OHN")));
      const matchesLocation = locationFilter === "ALL" || row.location === locationFilter;
      return matchesSearch && matchesTrade && matchesLocation;
    });
  }, [data, search, tradeFilter, locationFilter]);

  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const resetForm = () => {
    setFormData({
      crew_name: "",
      post: "",
      client: "",
      location: "",
      roles_em: "",
    });
  };

  const handleAdd = async () => {
    if (!formData.crew_name || !formData.post || !formData.client) {
      showNotification("Please fill required fields", "error");
      return;
    }

    setIsSaving(true);
    const result = await createRosterRow({
      crew_name: formData.crew_name,
      post: formData.post,
      client: formData.client,
      location: formData.location,
      roles_em: formData.roles_em,
    } as Omit<RosterRow, "id">);
    setIsSaving(false);

    if (result.success) {
      showNotification("Staff added successfully", "success");
      setIsAddOpen(false);
      resetForm();
      fetchData();
    } else {
      showNotification(result.error || "Failed to add staff", "error");
    }
  };

  const handleEdit = async () => {
    if (!selectedStaff) return;

    setIsSaving(true);
    const result = await updateRosterRow(selectedStaff.id, {
      crew_name: formData.crew_name,
      post: formData.post,
      client: formData.client,
      location: formData.location,
      roles_em: formData.roles_em,
    });
    setIsSaving(false);

    if (result.success) {
      showNotification("Staff updated successfully", "success");
      setIsEditOpen(false);
      setSelectedStaff(null);
      resetForm();
      fetchData();
    } else {
      showNotification(result.error || "Failed to update staff", "error");
    }
  };

  const handleDelete = async () => {
    if (!selectedStaff) return;

    setIsSaving(true);
    const result = await deleteRosterRow(selectedStaff.id);
    setIsSaving(false);

    if (result.success) {
      showNotification("Staff deleted successfully", "success");
      setIsDeleteOpen(false);
      setSelectedStaff(null);
      fetchData();
    } else {
      showNotification(result.error || "Failed to delete staff", "error");
    }
  };

  const openEditDialog = (staff: RosterRow) => {
    setSelectedStaff(staff);
    setFormData({
      crew_name: staff.crew_name || "",
      post: staff.post || "",
      client: staff.client || "",
      location: staff.location || "",
      roles_em: staff.roles_em || "",
    });
    setIsEditOpen(true);
  };

  const openDeleteDialog = (staff: RosterRow) => {
    setSelectedStaff(staff);
    setIsDeleteOpen(true);
  };

  const closeAllDialogs = () => {
    setIsAddOpen(false);
    setIsEditOpen(false);
    setIsDeleteOpen(false);
    setSelectedStaff(null);
    resetForm();
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6 mt-4">
        {/* NOTIFICATION */}
        {notification && (
          <div
            className={`fixed top-24 right-4 z-[2000] px-6 py-3 rounded-2xl shadow-2xl text-white font-black text-[11px] uppercase tracking-widest animate-in slide-in-from-right duration-300 ${
              notification.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {notification.message}
          </div>
        )}

        {/* PAGE HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between border-b border-border pb-4 gap-6">
          <div>
            <h2 className="text-4xl font-black text-foreground uppercase italic tracking-tighter leading-none">
              STAFF MANAGER
            </h2>
            <p className="text-muted-foreground font-black text-[10px] tracking-[0.3em] uppercase italic mt-2">
              Add, Edit & Delete Staff Records
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* FILTERS */}
            <div className="flex flex-wrap items-center gap-3 bg-muted p-2 rounded-2xl border border-border shadow-inner">
              <div className="flex flex-col px-3 border-r border-border">
                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">
                  Grade
                </span>
                <select
                  value={tradeFilter}
                  onChange={(e) => setTradeFilter(e.target.value as TradeType | "ALL")}
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

            {/* ADD BUTTON */}
            <Button
              onClick={() => {
                resetForm();
                setIsAddOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-wider"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Staff
            </Button>
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Staff</div>
            <div className="text-3xl font-black text-foreground mt-1">{data.length}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">SKA</div>
            <div className="text-3xl font-black text-blue-600 mt-1">
              {data.filter((r) => r.client === "SKA").length}
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">SBA</div>
            <div className="text-3xl font-black text-amber-600 mt-1">
              {data.filter((r) => r.client === "SBA").length}
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Filtered</div>
            <div className="text-3xl font-black text-foreground mt-1">{filteredData.length}</div>
          </div>
        </div>

        {/* TABLE */}
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-900">
                  <th className="text-left text-white font-black text-[10px] uppercase tracking-wider px-4 py-3">Name</th>
                  <th className="text-left text-white font-black text-[10px] uppercase tracking-wider px-4 py-3">Post</th>
                  <th className="text-left text-white font-black text-[10px] uppercase tracking-wider px-4 py-3">Client</th>
                  <th className="text-left text-white font-black text-[10px] uppercase tracking-wider px-4 py-3">Location</th>
                  <th className="text-left text-white font-black text-[10px] uppercase tracking-wider px-4 py-3">Roles EM</th>
                  <th className="text-right text-white font-black text-[10px] uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      No staff found
                    </td>
                  </tr>
                ) : (
                  filteredData.map((staff) => (
                    <tr key={staff.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-foreground">{staff.crew_name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                            staff.post?.includes("OFFSHORE MEDIC")
                              ? "bg-blue-100 text-blue-700"
                              : staff.post?.includes("ESCORT MEDIC")
                              ? "bg-purple-100 text-purple-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {staff.post}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                            staff.client === "SKA"
                              ? "bg-blue-600 text-white"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {staff.client}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">{staff.location || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">{staff.roles_em || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditDialog(staff)}
                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md flex items-center justify-center transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => openDeleteDialog(staff)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md flex items-center justify-center transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL OVERLAY */}
        {(isAddOpen || isEditOpen || isDeleteOpen) && (
          <div 
            className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4"
            onClick={closeAllDialogs}
          >
            {/* ADD/EDIT MODAL */}
            {(isAddOpen || isEditOpen) && (
              <div 
                className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-6">
                  <h3 className="text-xl font-black uppercase tracking-tight text-foreground">
                    {isAddOpen ? "Add New Staff" : "Edit Staff"}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isAddOpen ? "Fill in the details to add a new staff member." : "Update the staff member details."}
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="crew_name" className="text-xs font-bold uppercase">
                      Name *
                    </Label>
                    <Input
                      id="crew_name"
                      value={formData.crew_name}
                      onChange={(e) => setFormData({ ...formData, crew_name: e.target.value })}
                      placeholder="Enter full name"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="post" className="text-xs font-bold uppercase">
                      Post *
                    </Label>
                    <select
                      id="post"
                      value={formData.post}
                      onChange={(e) => setFormData({ ...formData, post: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">Select post</option>
                      {POST_OPTIONS.map((post) => (
                        <option key={post} value={post}>
                          {post}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="client" className="text-xs font-bold uppercase">
                      Client *
                    </Label>
                    <select
                      id="client"
                      value={formData.client}
                      onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">Select client</option>
                      {CLIENT_OPTIONS.map((client) => (
                        <option key={client} value={client}>
                          {client}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="location" className="text-xs font-bold uppercase">
                      Location
                    </Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="e.g. FPSO PROSPERITY"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="roles_em" className="text-xs font-bold uppercase">
                      Roles EM
                    </Label>
                    <Input
                      id="roles_em"
                      value={formData.roles_em}
                      onChange={(e) => setFormData({ ...formData, roles_em: e.target.value })}
                      placeholder="Enter roles"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="outline" onClick={closeAllDialogs}>
                    Cancel
                  </Button>
                  <Button
                    onClick={isAddOpen ? handleAdd : handleEdit}
                    disabled={isSaving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSaving ? "Saving..." : isAddOpen ? "Add Staff" : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {isDeleteOpen && selectedStaff && (
              <div 
                className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-6">
                  <h3 className="text-xl font-black uppercase tracking-tight text-foreground">
                    Confirm Delete
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Are you sure you want to delete <strong>{selectedStaff.crew_name}</strong>? This action cannot be undone.
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={closeAllDialogs}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDelete}
                    disabled={isSaving}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isSaving ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
