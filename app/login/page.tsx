"use client";

import React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login, isAuthenticated, mergeSupabaseUsers } from "@/lib/auth";
import { recordLoginLog, getSupabaseUsers } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setMounted(true);

    // TEMPORARY BYPASS: Force L1 admin session directly (always override)
    sessionStorage.setItem("cms_auth_user", JSON.stringify({
      username: "admin",
      fullName: "System Administrator",
      role: "L1",
      defaultProject: "PCSB",
    }));
    sessionStorage.setItem("cms_last_activity", Date.now().toString());
    sessionStorage.setItem("cms_selected_project", "PCSB");
    router.push("/dashboard");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setNotification(null);

    // Ensure latest Supabase users are synced before login attempt
    try {
      const sbUsers = await getSupabaseUsers();
      if (sbUsers.length > 0) mergeSupabaseUsers(sbUsers);
    } catch { /* fallback to local */ }

    await new Promise((resolve) => setTimeout(resolve, 300));

    const user = login(username, password);

    // Record login log to cms_login_logs (non-blocking)
    try {
      if (user) {
        await recordLoginLog({
          username_attempt: username.toLowerCase(),
          login_status: "SUCCESS",
          user_level: user.role,
          project_scope: user.defaultProject || "PCSB",
        });
      } else {
        await recordLoginLog({
          username_attempt: username.toLowerCase(),
          login_status: "FAILED",
          user_level: "unknown",
          project_scope: "-",
          error_message: "Invalid username or password",
        });
      }
    } catch (error) {
      // Silently fail - login logging is optional
      console.warn("Login logging failed:", error);
    }

    if (user) {
      setNotification({ type: "success", message: `Login successful. Welcome back, ${user.username}!` });
      setTimeout(() => router.push("/dashboard"), 800);
    } else {
      setNotification({ type: "error", message: "Login unsuccessful. Please check your username and password." });
    }

    setIsLoading(false);
  };

  if (!mounted) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div
      className="h-screen flex items-center justify-center p-4 overflow-hidden relative"
      style={{
        backgroundImage: `url(https://image2url.com/r2/default/images/1770311131560-2493d85c-5fef-4dbd-96b2-5c844492a9aa.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm" />
      {/* Grid pattern overlay */}
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
      
      <Card className="relative z-10 w-full max-w-md border-slate-800 bg-slate-900/90 backdrop-blur-sm shadow-2xl">
        <CardHeader className="text-center pb-2 pt-6">
          <div className="mx-auto mb-4 bg-white px-8 py-4 rounded-xl shadow-lg inline-block">
            <Image
              src="https://cptffqgvibhwjzvklual.supabase.co/storage/v1/object/public/branding/BOSH%20LOGO-trf.png"
              alt="Company Logo"
              width={280}
              height={70}
              className="h-14 w-auto"
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Crewing Management System
          </h1>
          {notification ? (
            <div className={`mt-1 px-4 py-2 rounded-lg text-sm font-semibold text-center animate-in fade-in slide-in-from-top-2 duration-300 ${
              notification.type === "success"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-red-500/15 text-red-400 border border-red-500/30"
            }`}>
              {notification.message}
            </div>
          ) : (
            <p className="text-sm text-slate-400 mt-1">
              Sign in to access your account
            </p>
          )}
        </CardHeader>
        
        <CardContent className="pt-4 pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300 text-sm font-medium">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 h-11"
                required
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300 text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 h-11"
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 h-11 mt-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

        </CardContent>
      </Card>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 z-10 py-3 text-center">
        <p className="text-[11px] text-white font-normal tracking-wide">
          &copy; {new Date().getFullYear()} kawie - Crewing Management System. All Rights Reserved.
        </p>
        <p className="text-[10px] text-white font-normal tracking-wide mt-0.5 italic">
          version : v2-080226
        </p>
      </div>
    </div>
  );
}
