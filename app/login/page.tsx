"use client";

import React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login, isAuthenticated } from "@/lib/auth";
import { recordLoginLog } from "@/lib/actions";
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
    if (isAuthenticated()) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setNotification(null);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const user = login(username, password);

    // Try to record login log, but don't block login if it fails
    try {
      await recordLoginLog({
        username: username.toLowerCase(),
        role: user?.role || "unknown",
        timestamp: new Date().toISOString(),
        success: !!user,
      });
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
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZ2LTRoLTJ2NGgyek0zNCAyNGgtMnY0aDJ2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20" />
      
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/90 backdrop-blur-sm shadow-2xl">
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
          <p className="text-sm text-slate-400 mt-1">
            Sign in to access your account
          </p>
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

          <p className="text-xs text-slate-500 text-center mt-5">
            Contact your administrator if you need access
          </p>

          {/* Login notification - appears below "contact your admin" */}
          {notification && (
            <div className={`mt-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-center animate-in fade-in slide-in-from-bottom-2 duration-300 ${
              notification.type === "success"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-red-500/15 text-red-400 border border-red-500/30"
            }`}>
              {notification.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
