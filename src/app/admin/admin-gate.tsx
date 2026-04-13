"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifyAdminSecret } from "./actions";

export default function AdminGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError("");

    const result = await verifyAdminSecret(password.trim());
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="min-h-dvh bg-[#09090B] flex items-center justify-center px-4">
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
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
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
          disabled={loading}
          className="w-full rounded-lg bg-[#7B2FF7] px-4 py-3 font-medium text-white hover:bg-[#9D5CFF] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
          {loading ? "Verifying..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
