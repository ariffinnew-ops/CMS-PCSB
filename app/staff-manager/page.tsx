"use client";

import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { RosterRow, TradeType } from "@/lib/types";
import { getRosterData, createRosterRow, updateRosterRow, deleteRosterRow } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
      <div className="flex flex-col gap-6">
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
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-900 hover:bg-slate-900">
                  <TableHead className="text-white font-black text-[10px] uppercase tracking-wider">Name</TableHead>
                  <TableHead className="text-white font-black text-[10px] uppercase tracking-wider">Post</TableHead>
                  <TableHead className="text-white font-black text-[10px] uppercase tracking-wider">Client</TableHead>
                  <TableHead className="text-white font-black text-[10px] uppercase tracking-wider">Location</TableHead>
                  <TableHead className="text-white font-black text-[10px] uppercase tracking-wider">Roles EM</TableHead>
                  <TableHead className="text-white font-black text-[10px] uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No staff found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((staff) => (
                    <TableRow key={staff.id} className="hover:bg-muted/50">
                      <TableCell className="font-bold text-foreground">{staff.crew_name}</TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                            staff.client === "SKA"
                              ? "bg-blue-600 text-white"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {staff.client}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{staff.location || "-"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{staff.roles_em || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(staff)}
                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(staff)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ADD DIALOG */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-black uppercase tracking-tight">Add New Staff</DialogTitle>
              <DialogDescription>
                Fill in the details to add a new staff member.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
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
              <div className="grid gap-2">
                <Label htmlFor="post" className="text-xs font-bold uppercase">
                  Post *
                </Label>
                <Select
                  value={formData.post}
                  onValueChange={(value) => setFormData({ ...formData, post: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select post" />
                  </SelectTrigger>
                  <SelectContent>
                    {POST_OPTIONS.map((post) => (
                      <SelectItem key={post} value={post}>
                        {post}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="client" className="text-xs font-bold uppercase">
                  Client *
                </Label>
                <Select
                  value={formData.client}
                  onValueChange={(value) => setFormData({ ...formData, client: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_OPTIONS.map((client) => (
                      <SelectItem key={client} value={client}>
                        {client}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
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
              <div className="grid gap-2">
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSaving ? "Saving..." : "Add Staff"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* EDIT DIALOG */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-black uppercase tracking-tight">Edit Staff</DialogTitle>
              <DialogDescription>
                Update the staff member details.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit_crew_name" className="text-xs font-bold uppercase">
                  Name *
                </Label>
                <Input
                  id="edit_crew_name"
                  value={formData.crew_name}
                  onChange={(e) => setFormData({ ...formData, crew_name: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_post" className="text-xs font-bold uppercase">
                  Post *
                </Label>
                <Select
                  value={formData.post}
                  onValueChange={(value) => setFormData({ ...formData, post: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select post" />
                  </SelectTrigger>
                  <SelectContent>
                    {POST_OPTIONS.map((post) => (
                      <SelectItem key={post} value={post}>
                        {post}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_client" className="text-xs font-bold uppercase">
                  Client *
                </Label>
                <Select
                  value={formData.client}
                  onValueChange={(value) => setFormData({ ...formData, client: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_OPTIONS.map((client) => (
                      <SelectItem key={client} value={client}>
                        {client}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_location" className="text-xs font-bold uppercase">
                  Location
                </Label>
                <Input
                  id="edit_location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. FPSO PROSPERITY"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_roles_em" className="text-xs font-bold uppercase">
                  Roles EM
                </Label>
                <Input
                  id="edit_roles_em"
                  value={formData.roles_em}
                  onChange={(e) => setFormData({ ...formData, roles_em: e.target.value })}
                  placeholder="Enter roles"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleEdit}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSaving ? "Saving..." : "Update Staff"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DELETE CONFIRMATION */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-black uppercase">Delete Staff?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{selectedStaff?.crew_name}</strong>? 
                This action cannot be undone and will remove all rotation data associated with this staff member.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                {isSaving ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
