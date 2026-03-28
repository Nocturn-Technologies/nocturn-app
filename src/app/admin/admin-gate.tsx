"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminGate() {
  const [password, setPassword] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.trim()) {
      router.push(`/admin?secret=${encodeURIComponent(password.trim())}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4"
      >
        <h1 className="text-2xl font-semibold text-white text-center font-[var(--font-heading)]">
          Nocturn Admin
        </h1>
        <p className="text-sm text-zinc-400 text-center">
          Enter the admin password to continue.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-500 focus:border-[#7B2FF7] focus:outline-none focus:ring-1 focus:ring-[#7B2FF7]"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-[#7B2FF7] px-4 py-3 font-medium text-white hover:bg-[#9D5CFF] transition-colors"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
