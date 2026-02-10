"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import {
  getUser,
  getStoredUsers,
  saveUsers,
  ROLE_LABELS,
  type AuthUser,
  type UserRole,
  type ProjectKey,
  type StoredUser,
} from "@/lib/auth";
import { useRouter } from "next/navigation";

const ALL_ROLES: UserRole[] = ["L1", "L2A", "L2B", "L4", "L5", "L6", "L7"];
const ALL_PROJECTS: ProjectKey[] = ["PCSB", "OTHERS"];

export default function UsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFullName, setFormFullName] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("L2A");
  const [formProject, setFormProject] = useState<ProjectKey>("PCSB");

  useEffect(() => {
    const currentUser = getUser();
    if (!currentUser || currentUser.role !== "L1") {
      router.push("/dashboard");
      return;
    }
    setUser(currentUser);
    setUsers(getStoredUsers());
  }, [router]);

  const showNotif = useCallback((message: string, type: "success" | "error") => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const resetForm = () => {
    setFormUsername("");
    setFormPassword("");
    setFormFullName("");
    setFormRole("L2A");
    setFormProject("PCSB");
    setEditingIdx(null);
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimUser = formUsername.trim().toLowerCase();
    const trimName = formFullName.trim();

    if (!trimUser || !formPassword || !trimName) {
      showNotif("All fields are required.", "error");
      return;
    }

    const existing = [...users];

    if (editingIdx !== null) {
      // Update existing
      existing[editingIdx] = {
        ...existing[editingIdx],
        username: trimUser,
        password: formPassword,
        fullName: trimName,
        role: formRole,
        defaultProject: formProject,
      };
      saveUsers(existing);
      setUsers(existing);
      showNotif(`User "${trimUser}" updated.`, "success");
    } else {
      // Check duplicate username
      if (existing.some((u) => u.username.toLowerCase() === trimUser)) {
        showNotif(`Username "${trimUser}" already exists.`, "error");
        return;
      }
      const newUser: StoredUser = {
        username: trimUser,
        password: formPassword,
        fullName: trimName,
        role: formRole,
        defaultProject: formProject,
      };
      const updated = [...existing, newUser];
      saveUsers(updated);
      setUsers(updated);
      showNotif(`User "${trimUser}" created.`, "success");
    }
    resetForm();
  };

  const handleEdit = (idx: number) => {
    const u = users[idx];
    setFormUsername(u.username);
    setFormPassword(u.password);
    setFormFullName(u.fullName);
    setFormRole(u.role);
    setFormProject(u.defaultProject || "PCSB");
    setEditingIdx(idx);
    setShowForm(true);
  };

  const handleDelete = (idx: number) => {
    const u = users[idx];
    if (u.username === user?.username) {
      showNotif("Cannot delete your own account.", "error");
      return;
    }
    const updated = users.filter((_, i) => i !== idx);
    saveUsers(updated);
    setUsers(updated);
    showNotif(`User "${u.username}" deleted.`, "success");
  };

  const getRoleBadge = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      L1: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      L2A: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      L2B: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      L4: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      L5: "bg-purple-500/20 text-purple-300 border-purple-500/30",
      L6: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      L7: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    };
    return colors[role] || "bg-slate-500/20 text-slate-300 border-slate-500/30";
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">
              User Management
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage system users and role assignments. L1 access only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-lg hover:shadow-blue-500/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </button>
        </div>

        {/* Notification */}
        {notification && (
          <div
            className={`px-4 py-2.5 rounded-lg text-xs font-bold border animate-in fade-in slide-in-from-top-2 duration-300 ${
              notification.type === "success"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/15 text-red-400 border-red-500/30"
            }`}
          >
            {notification.message}
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl border border-border flex flex-col">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-blue-600 rounded-t-2xl">
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  {editingIdx !== null ? "Edit User" : "Create New User"}
                </h3>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-white/80 hover:text-white text-lg font-bold w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                {/* Username */}
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 block">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="e.g. john.doe"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 block">
                    Password
                  </label>
                  <input
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Initial password"
                    required
                  />
                </div>

                {/* Full Name */}
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Full display name"
                    required
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 block">
                    User Role
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r} - {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Default Project */}
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 block">
                    Default Project
                  </label>
                  <select
                    value={formProject}
                    onChange={(e) => setFormProject(e.target.value as ProjectKey)}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {ALL_PROJECTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold text-[10px] uppercase tracking-wider transition-all border border-border"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-wider transition-all shadow-lg hover:shadow-blue-500/30"
                  >
                    {editingIdx !== null ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-card rounded-xl border border-border shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">#</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Username</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Full Name</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Role</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Default Project</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.username}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-bold text-foreground">
                      {u.username}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-foreground">
                      {u.fullName}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getRoleBadge(u.role)}`}
                      >
                        {u.role} - {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-bold text-muted-foreground">
                      {u.defaultProject || "-"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(i)}
                          className="px-2 py-1 rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[9px] font-black uppercase tracking-wider border border-blue-400/30 transition-all"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(i)}
                          disabled={u.username === user?.username}
                          className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border transition-all ${
                            u.username === user?.username
                              ? "bg-slate-500/10 text-slate-500 border-slate-500/20 cursor-not-allowed"
                              : "bg-red-500/20 hover:bg-red-500/30 text-red-400 border-red-400/30"
                          }`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      No users found. Click "Add User" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Permission Matrix Reference */}
        <div className="bg-card rounded-xl border border-border shadow-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 border-b border-border">
            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">
              Role Permission Matrix (Reference)
            </h2>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-[9px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">Role</th>
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">Dashboard</th>
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">Roster</th>
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">Training</th>
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">Staff</th>
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">Statement</th>
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">Financial</th>
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">Data Mgr</th>
                  <th className="px-2 py-2 font-black uppercase tracking-widest text-muted-foreground">User Mgmt</th>
                </tr>
              </thead>
              <tbody>
                {ALL_ROLES.map((role) => (
                  <tr key={role} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-2 py-1.5 font-black text-foreground">
                      {role} - {ROLE_LABELS[role]}
                    </td>
                    {["/dashboard", "/roster", "/training", "/staff", "/statement", "/financial", "/admin", "/users"].map((page) => {
                      const pcsbPerm = (() => {
                        const pm = { "/dashboard": "VIEW", "/roster": "VIEW", "/training": role === "L1" || role === "L2A" || role === "L4" ? "EDIT" : "VIEW", "/staff": role === "L1" || role === "L2A" || role === "L4" ? "EDIT" : "VIEW", "/statement": "VIEW", "/financial": "VIEW", "/admin": role === "L1" || role === "L2A" ? "EDIT" : "VIEW", "/users": role === "L1" ? "EDIT" : "NONE" } as Record<string, string>;
                        return pm[page] || "NONE";
                      })();
                      return (
                        <td key={page} className="px-2 py-1.5 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                              pcsbPerm === "EDIT"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : pcsbPerm === "VIEW"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {pcsbPerm === "NONE" ? "-" : pcsbPerm}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[8px] text-muted-foreground mt-2 italic">
              * Permissions may vary by selected project (PCSB vs OTHERS). This table shows PCSB defaults.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
