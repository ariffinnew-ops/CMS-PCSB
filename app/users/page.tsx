"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import {
  getUser,
  getStoredUsers,
  saveUsers,
  ROLE_LABELS,
  getPermissionMatrix,
  savePermissionMatrix,
  getPermission,
  type AuthUser,
  type UserRole,
  type ProjectKey,
  type StoredUser,
  type PermissionLevel,
} from "@/lib/auth";
import {
  getLoginLogs,
  getSupabaseUsers,
  upsertCmsUser,
  deleteCmsUser,
  type LoginLogEntry,
} from "@/lib/actions";
import { mergeSupabaseUsers } from "@/lib/auth";
import { useRouter } from "next/navigation";

const ALL_ROLES: UserRole[] = ["L1", "L2A", "L2B", "L4", "L5A", "L5B", "L6", "L7"];
const ALL_PROJECTS: ProjectKey[] = ["PCSB", "OTHERS"];

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/roster": "Roster",
  "/training": "Training",
  "/staff": "Staff",
  "/statement": "Statement",
  "/financial": "Financial",
  "/admin": "Data Mgr",
  "/users": "User Mgmt",
};

const PAGES = Object.keys(PAGE_LABELS);

export default function UsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [matrixProject, setMatrixProject] = useState<ProjectKey>("PCSB");
  const [matrix, setMatrix] = useState(() => getPermissionMatrix());
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [loginLogs, setLoginLogs] = useState<LoginLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Form state
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFullName, setFormFullName] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("L2A");
  const [formProject, setFormProject] = useState<ProjectKey>("PCSB");

  // Load user, sync from Supabase, and fetch login logs
  useEffect(() => {
    const currentUser = getUser();
    if (!currentUser || currentUser.role !== "L1") {
      router.push("/dashboard");
      return;
    }
    setUser(currentUser);

    // Fetch users from Supabase and merge (Supabase is source of truth)
    setSyncing(true);
    getSupabaseUsers().then(sbUsers => {
      if (sbUsers.length > 0) {
        const merged = mergeSupabaseUsers(sbUsers);
        setUsers(merged);
      } else {
        // Supabase empty or unavailable -- fall back to local
        setUsers(getStoredUsers());
      }
      setSyncing(false);
    }).catch(() => {
      setUsers(getStoredUsers());
      setSyncing(false);
    });

    getLoginLogs().then(logs => {
      setLoginLogs(logs);
      setLogsLoading(false);
    });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimUser = formUsername.trim().toLowerCase();
    const trimName = formFullName.trim();

    if (!trimUser || !formPassword || !trimName) {
      showNotif("All fields are required.", "error");
      return;
    }

    const existing = [...users];

    if (editingIdx !== null) {
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

      // Sync to Supabase
      await upsertCmsUser({
        username: trimUser,
        password: formPassword,
        full_name: trimName,
        role: formRole,
        default_project: formProject,
      });

      showNotif(`User "${trimUser}" updated (synced to Supabase).`, "success");
    } else {
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

      // Sync to Supabase
      await upsertCmsUser({
        username: trimUser,
        password: formPassword,
        full_name: trimName,
        role: formRole,
        default_project: formProject,
      });

      showNotif(`User "${trimUser}" created (synced to Supabase).`, "success");
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

  const handleDelete = async (idx: number) => {
    const u = users[idx];
    if (u.username === user?.username) {
      showNotif("Cannot delete your own account.", "error");
      return;
    }
    const updated = users.filter((_, i) => i !== idx);
    saveUsers(updated);
    setUsers(updated);

    // Sync to Supabase
    await deleteCmsUser(u.username);

    showNotif(`User "${u.username}" deleted (synced to Supabase).`, "success");
  };

  const getPermBadge = (level: PermissionLevel) => {
    if (level === "EDIT") return "bg-emerald-600 text-white";
    if (level === "VIEW") return "bg-blue-600/80 text-white";
    return "bg-slate-800 text-slate-500";
  };

  // Cycle permission: EDIT -> VIEW -> NONE -> EDIT  (L1 always stays EDIT)
  const cyclePermission = (page: string, role: UserRole) => {
    if (role === "L1") return; // L1 always EDIT
    const current = matrix[page]?.[matrixProject]?.[role] ?? "NONE";
    const next: PermissionLevel = current === "EDIT" ? "VIEW" : current === "VIEW" ? "NONE" : "EDIT";
    setMatrix(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated[page]) return prev;
      updated[page][matrixProject][role] = next;
      return updated;
    });
    setMatrixDirty(true);
  };

  const handleSaveMatrix = () => {
    savePermissionMatrix(matrix);
    setMatrixDirty(false);
    showNotif("Access matrix saved successfully.", "success");
  };

  const handleResetMatrix = () => {
    const fresh = getPermissionMatrix();
    setMatrix(fresh);
    setMatrixDirty(false);
  };

  const getRoleBadge = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      L1: "bg-amber-500/15 text-amber-400 border-amber-500/40",
      L2A: "bg-blue-500/15 text-blue-400 border-blue-500/40",
      L2B: "bg-indigo-500/15 text-indigo-400 border-indigo-500/40",
      L4: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
      L5A: "bg-purple-500/15 text-purple-400 border-purple-500/40",
      L5B: "bg-violet-500/15 text-violet-400 border-violet-500/40",
      L6: "bg-cyan-500/15 text-cyan-400 border-cyan-500/40",
      L7: "bg-teal-500/15 text-teal-400 border-teal-500/40",
    };
    return colors[role] || "bg-slate-500/15 text-slate-400 border-slate-500/40";
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
            {syncing && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="animate-spin rounded-full h-3 w-3 border-t border-b border-blue-500" />
                <span className="text-[10px] font-bold text-blue-400">Syncing from Supabase...</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-lg hover:shadow-blue-500/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </button>
        </div>

        {/* Notification */}
        {notification && (
          <div
            className={`px-4 py-3 rounded-lg text-sm font-bold border animate-in fade-in slide-in-from-top-2 duration-300 ${
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
            <div className="bg-card rounded-2xl w-full max-w-lg shadow-2xl border border-border flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-blue-600 rounded-t-2xl">
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  {editingIdx !== null ? "Edit User" : "Create New User"}
                </h3>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-white/80 hover:text-white text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  {/* Username */}
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">
                      Username
                    </label>
                    <input
                      type="text"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                      placeholder="e.g. john.doe"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">
                      Password
                    </label>
                    <input
                      type="text"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                      placeholder="Initial password"
                      required
                    />
                  </div>
                </div>

                {/* Full Name */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                    placeholder="Full display name"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Role */}
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">
                      User Role
                    </label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value as UserRole)}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
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
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">
                      Default Project
                    </label>
                    <select
                      value={formProject}
                      onChange={(e) => setFormProject(e.target.value as ProjectKey)}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                    >
                      {ALL_PROJECTS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-5 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold text-xs uppercase tracking-wider transition-all border border-border"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg hover:shadow-blue-500/30"
                  >
                    {editingIdx !== null ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Users Table - large, easy to read */}
        <div className="bg-card rounded-xl border border-border shadow-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-xs font-black text-white uppercase tracking-widest">
                Active Users
              </h2>
              <span className="text-[8px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                Source: Supabase / cms_users
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">
              {users.length} {users.length === 1 ? "user" : "users"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b-2 border-border">
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground w-12">#</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Username</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Full Name</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Role</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Project</th>
                  <th className="px-5 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u, i) => (
                  <tr
                    key={u.username}
                    className="hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors group"
                  >
                    <td className="px-5 py-4 text-sm font-bold text-muted-foreground tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xs uppercase shrink-0">
                          {u.username.charAt(0)}
                        </div>
                        <span className="text-sm font-bold text-foreground">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-foreground">
                      {u.fullName}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${getRoleBadge(u.role)}`}>
                        {u.role} &middot; {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        u.defaultProject === "PCSB"
                          ? "bg-blue-600/15 text-blue-500 border border-blue-500/30"
                          : "bg-orange-500/15 text-orange-500 border border-orange-500/30"
                      }`}>
                        {u.defaultProject || "PCSB"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(i)}
                          className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-sm hover:shadow-blue-500/20"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(i)}
                          disabled={u.username === user?.username}
                          className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                            u.username === user?.username
                              ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                              : "bg-red-600 hover:bg-red-500 text-white shadow-sm hover:shadow-red-500/20"
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
                    <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                      No users found. Click "Add User" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CMS Access Matrix - Editable (mirrors Supabase cms_access_matrix) */}
        <div className="bg-card rounded-xl border border-border shadow-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <h2 className="text-xs font-black text-white uppercase tracking-widest">
                CMS Access Matrix
              </h2>
              <span className="text-[8px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                Source: Supabase / cms_access_matrix
              </span>
              {matrixDirty && (
                <span className="text-[8px] font-black text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30 animate-pulse">
                  UNSAVED
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {matrixDirty && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleResetMatrix}
                    className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-black uppercase tracking-wider transition-all"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMatrix}
                    className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30"
                  >
                    Save Changes
                  </button>
                </div>
              )}
              <div className="flex items-center bg-slate-800 rounded-md border border-slate-700 p-0.5">
                <button
                  type="button"
                  onClick={() => setMatrixProject("PCSB")}
                  className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${
                    matrixProject === "PCSB"
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  PCSB
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixProject("OTHERS")}
                  className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${
                    matrixProject === "OTHERS"
                      ? "bg-orange-500 text-white shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  OTHERS
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b-2 border-border">
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground sticky left-0 bg-slate-50 dark:bg-slate-900/50 z-10 min-w-[180px]">
                    Role
                  </th>
                  {PAGES.map((page) => (
                    <th key={page} className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground min-w-[80px]">
                      {PAGE_LABELS[page]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ALL_ROLES.map((role) => (
                  <tr key={role} className="hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-card z-10 border-r border-border">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${getRoleBadge(role)}`}>
                        {role}
                      </span>
                      <span className="ml-2 text-xs font-semibold text-muted-foreground">
                        {ROLE_LABELS[role]}
                      </span>
                    </td>
                    {PAGES.map((page) => {
                      const level = matrix[page]?.[matrixProject]?.[role] ?? "NONE";
                      const isLocked = role === "L1"; // L1 always EDIT
                      return (
                        <td key={page} className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => cyclePermission(page, role)}
                            disabled={isLocked}
                            className={`inline-block px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider min-w-[42px] transition-all ${
                              isLocked ? "cursor-default opacity-70" : "cursor-pointer hover:ring-2 hover:ring-blue-400/50 active:scale-95"
                            } ${getPermBadge(level)}`}
                            title={isLocked ? "L1 always has EDIT access" : `Click to change: ${level}`}
                          >
                            {level === "NONE" ? "--" : level}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/30 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-600" />
                <span className="text-[10px] font-bold text-muted-foreground">EDIT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-600/80" />
                <span className="text-[10px] font-bold text-muted-foreground">VIEW</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-800" />
                <span className="text-[10px] font-bold text-muted-foreground">NO ACCESS</span>
              </div>
            </div>
            <span className="text-[9px] text-muted-foreground font-semibold">
              Click any cell to cycle permissions (L1 is locked to EDIT)
            </span>
          </div>
        </div>

        {/* Login Activity Logs */}
        <div className="bg-card rounded-xl border border-border shadow-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xs font-black text-white uppercase tracking-widest">
                Login Activity Logs
              </h2>
              <span className="text-[8px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                Source: Supabase / cms_login_logs
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">
              {loginLogs.length} {loginLogs.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          {logsLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-foreground" />
            </div>
          ) : loginLogs.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground font-medium">No login records found.</p>
              <p className="text-xs text-muted-foreground mt-1">Login activity will appear here after users sign in.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b-2 border-border">
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Time</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Username</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Level</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Project</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loginLogs.map((log, idx) => {
                    // Format: DD/MM HH:mm
                    let timeStr = "-";
                    if (log.created_at) {
                      const d = new Date(log.created_at);
                      const dd = String(d.getDate()).padStart(2, "0");
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const hh = String(d.getHours()).padStart(2, "0");
                      const min = String(d.getMinutes()).padStart(2, "0");
                      timeStr = `${dd}/${mm} ${hh}:${min}`;
                    }
                    const isSuccess = log.login_status === "SUCCESS";
                    return (
                      <tr key={log.id ?? idx} className="hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors">
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{timeStr}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-bold text-foreground">{log.username_attempt}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {isSuccess ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-black text-emerald-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-[10px] font-black text-red-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {log.user_level && log.user_level !== "unknown" ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${getRoleBadge(log.user_level as UserRole)}`}>
                              {log.user_level}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {log.project_scope && log.project_scope !== "-" ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              log.project_scope === "PCSB"
                                ? "bg-blue-600/15 text-blue-500 border border-blue-500/30"
                                : "bg-orange-500/15 text-orange-500 border border-orange-500/30"
                            }`}>
                              {log.project_scope}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {log.error_message ? (
                            <span className="text-[10px] font-semibold text-red-400">{log.error_message}</span>
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
