// Core entity types — will be replaced by Supabase generated types
// once the database schema is set up

export type UserRole = "admin" | "promoter" | "talent_buyer" | "door_staff" | "member";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Collective {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  logo_url: string | null;
  website: string | null;
  instagram: string | null;
  city: string;
  created_at: string;
  updated_at: string;
}

export interface CollectiveMember {
  id: string;
  collective_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  capacity: number;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
}

export interface Event {
  id: string;
  collective_id: string;
  venue_id: string;
  title: string;
  slug: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  doors_at: string | null;
  capacity: number;
  status: "draft" | "published" | "cancelled" | "completed";
  flyer_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketTier {
  id: string;
  event_id: string;
  name: string;
  price: number;
  capacity: number;
  sold: number;
  sort_order: number;
}

export interface Ticket {
  id: string;
  event_id: string;
  tier_id: string;
  attendee_id: string;
  stripe_payment_intent_id: string | null;
  status: "pending" | "confirmed" | "checked_in" | "refunded";
  qr_code: string;
  checked_in_at: string | null;
  created_at: string;
}

export interface EventArtist {
  id: string;
  event_id: string;
  artist_name: string;
  fee: number | null;
  set_time: string | null;
  status: "pending" | "confirmed" | "declined";
}

export interface Settlement {
  id: string;
  event_id: string;
  total_revenue: number;
  total_costs: number;
  net_profit: number;
  status: "pending" | "approved" | "paid";
  created_at: string;
}

export interface SplitItem {
  id: string;
  settlement_id: string;
  recipient_type: "member" | "artist" | "venue" | "platform";
  recipient_id: string;
  amount: number;
  percentage: number;
  stripe_transfer_id: string | null;
  status: "pending" | "paid";
}
