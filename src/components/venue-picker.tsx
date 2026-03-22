"use client";

import { useCallback, useEffect, useState } from "react";
import { searchVenues, type VenueResult, type VenueType } from "@/lib/venues-api";
import { Input } from "@/components/ui/input";
import {
  Search,
  Star,
  MapPin,
  Users,
  Check,
  X,
  Loader2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SelectedVenue {
  name: string;
  address: string;
  city: string;
  capacity: number;
}

interface VenuePickerProps {
  onSelect: (venue: SelectedVenue) => void;
  onCustom: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

type FilterChip = "All" | VenueType;

const FILTERS: FilterChip[] = [
  "All",
  "Club",
  "Bar",
  "Warehouse",
  "Gallery",
  "Rooftop",
];

const TYPE_COLORS: Record<string, string> = {
  Club: "bg-purple-500/20 text-purple-300",
  Bar: "bg-amber-500/20 text-amber-300",
  Warehouse: "bg-emerald-500/20 text-emerald-300",
  Gallery: "bg-pink-500/20 text-pink-300",
  Rooftop: "bg-sky-500/20 text-sky-300",
};

// ─── VenuePicker ────────────────────────────────────────────────────────────

export default function VenuePicker({ onSelect, onCustom }: VenuePickerProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterChip>("All");
  const [venues, setVenues] = useState<VenueResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Search ──────────────────────────────────────────────────────────────

  const fetchVenues = useCallback(async () => {
    setLoading(true);
    const results = await searchVenues(query, filter);
    setVenues(results);
    setLoading(false);
  }, [query, filter]);

  useEffect(() => {
    const timer = setTimeout(fetchVenues, 200);
    return () => clearTimeout(timer);
  }, [fetchVenues]);

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleSelect(venue: VenueResult) {
    setSelectedId(venue.place_id);
    // Small delay so the user sees the selection highlight
    setTimeout(() => {
      onSelect({
        name: venue.name,
        address: venue.address,
        city: venue.city,
        capacity: venue.capacity ?? 0,
      });
    }, 300);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="ml-11 rounded-xl border border-white/5 bg-zinc-900/80 overflow-hidden animate-fade-in-up">
      {/* Search bar */}
      <div className="p-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search venues..."
            className="h-9 pl-9 pr-8 text-sm bg-zinc-800 border-white/10 focus:border-[#7B2FF7]/50"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-600 text-zinc-300 hover:bg-zinc-500"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips — horizontally scrollable */}
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-[#7B2FF7] text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Venue list */}
      <div className="max-h-[240px] overflow-y-auto border-t border-white/5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-[#7B2FF7] animate-spin" />
          </div>
        ) : venues.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">
            No venues found
          </div>
        ) : (
          venues.map((venue) => {
            const isSelected = selectedId === venue.place_id;
            return (
              <button
                key={venue.place_id}
                onClick={() => handleSelect(venue)}
                disabled={selectedId !== null}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-white/[0.03] last:border-b-0 ${
                  isSelected
                    ? "bg-[#7B2FF7]/10 border-l-2 border-l-[#7B2FF7]"
                    : "hover:bg-zinc-800/60"
                } ${selectedId !== null && !isSelected ? "opacity-40" : ""}`}
              >
                {/* Venue info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {venue.name}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        TYPE_COLORS[venue.venue_type] ?? "bg-zinc-700 text-zinc-300"
                      }`}
                    >
                      {venue.venue_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <MapPin className="h-3 w-3" />
                      {venue.neighbourhood}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-amber-500">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {venue.rating.toFixed(1)}
                    </span>
                    {venue.capacity && (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Users className="h-3 w-3" />
                        {venue.capacity.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Selection check */}
                {isSelected && (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7B2FF7]">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Custom venue link */}
      <div className="border-t border-white/5 px-3 py-2.5">
        <button
          onClick={onCustom}
          className="text-xs text-[#7B2FF7] hover:text-[#9D5CFF] font-medium transition-colors"
        >
          Or type a custom venue
        </button>
      </div>
    </div>
  );
}
