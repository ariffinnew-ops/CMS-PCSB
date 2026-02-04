"use client";

import React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, isAuthenticated } from "@/lib/auth";
import { recordLoginLog } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated()) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Small delay for UX
    await new Promise((resolve) => setTimeout(resolve, 500));

    const user = login(username, password);

    // Record login attempt to Supabase
    await recordLoginLog({
      username: username.toLowerCase(),
      role: user?.role || "unknown",
      timestamp: new Date().toISOString(),
      success: !!user,
    });

    if (user) {
      toast({
        title: "Login Successful",
        description: `Welcome back, ${user.username}!`,
      });
      router.push("/dashboard");
    } else {
      toast({
        title: "Invalid Credentials",
        description: "Please check your username and password.",
        variant: "destructive",
      });
    }

    setIsLoading(false);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZ2LTRoLTJ2NGgyek0zNCAyNGgtMnY0aDJ2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20" />
      
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/80 backdrop-blur-sm shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 bg-slate-800 p-3 rounded-xl w-fit">
            <div className="bg-white p-2 rounded-lg">
              <span className="text-slate-900 font-black text-lg">BOSH</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-black text-white tracking-tight">
            CMS Portal
          </CardTitle>
          <CardDescription className="text-slate-400">
            Crewing Management System
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300 text-sm font-medium">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300 text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                required
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 mt-2"
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

          <div className="mt-6 pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-500 text-center mb-2">
              Demo Credentials
            </p>
            <div className="space-y-2 text-xs">
              <div className="bg-slate-800/50 rounded-lg p-2 flex justify-between">
                <span className="text-amber-400 font-medium">Admin:</span>
                <span className="text-slate-300">admin / admin999</span>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 flex justify-between">
                <span className="text-blue-400 font-medium">Data Logger:</span>
                <span className="text-slate-300">datalogger / data999</span>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 flex justify-between">
                <span className="text-slate-400 font-medium">Guest:</span>
                <span className="text-slate-300">guest / guest999</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
