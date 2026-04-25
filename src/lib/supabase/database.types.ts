export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      artist_profiles: {
        Row: {
          availability: string | null
          bio: string | null
          booking_email: string | null
          cover_photo_url: string | null
          created_at: string
          default_fee: number | null
          deleted_at: string | null
          genre: string[] | null
          id: string
          is_active: boolean
          is_verified: boolean
          party_id: string
          past_venues: string[] | null
          photo_url: string | null
          portfolio_urls: string[] | null
          rate_range: string | null
          services: string[] | null
          slug: string
          spotify: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          bio?: string | null
          booking_email?: string | null
          cover_photo_url?: string | null
          created_at?: string
          default_fee?: number | null
          deleted_at?: string | null
          genre?: string[] | null
          id?: string
          is_active?: boolean
          is_verified?: boolean
          party_id: string
          past_venues?: string[] | null
          photo_url?: string | null
          portfolio_urls?: string[] | null
          rate_range?: string | null
          services?: string[] | null
          slug: string
          spotify?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          bio?: string | null
          booking_email?: string | null
          cover_photo_url?: string | null
          created_at?: string
          default_fee?: number | null
          deleted_at?: string | null
          genre?: string[] | null
          id?: string
          is_active?: boolean
          is_verified?: boolean
          party_id?: string
          past_venues?: string[] | null
          photo_url?: string | null
          portfolio_urls?: string[] | null
          rate_range?: string | null
          services?: string[] | null
          slug?: string
          spotify?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      attendee_profiles: {
        Row: {
          collective_id: string
          created_at: string
          email: string | null
          first_seen_at: string | null
          full_name: string | null
          id: string
          last_seen_at: string | null
          metadata: Json | null
          party_id: string | null
          total_events: number
          total_spend: number
          total_tickets: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          collective_id: string
          created_at?: string
          email?: string | null
          first_seen_at?: string | null
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          party_id?: string | null
          total_events?: number
          total_spend?: number
          total_tickets?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          collective_id?: string
          created_at?: string
          email?: string | null
          first_seen_at?: string | null
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          party_id?: string | null
          total_events?: number
          total_spend?: number
          total_tickets?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendee_profiles_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendee_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendee_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          collective_id: string | null
          created_at: string
          event_id: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          collective_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          collective_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          collective_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string | null
          type: string
        }
        Insert: {
          collective_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          type?: string
        }
        Update: {
          collective_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_members: {
        Row: {
          collective_id: string
          deleted_at: string | null
          id: string
          joined_at: string
          party_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          collective_id: string
          deleted_at?: string | null
          id?: string
          joined_at?: string
          party_id?: string | null
          role?: string
          user_id: string
        }
        Update: {
          collective_id?: string
          deleted_at?: string | null
          id?: string
          joined_at?: string
          party_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_members_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      collectives: {
        Row: {
          bio: string | null
          city: string | null
          cover_url: string | null
          created_at: string
          genre_tags: string[] | null
          id: string
          is_active: boolean
          is_approved: boolean
          logo_url: string | null
          name: string
          party_id: string | null
          slug: string
          stripe_account_id: string | null
          updated_at: string
          vibe: string | null
        }
        Insert: {
          bio?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string
          genre_tags?: string[] | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          logo_url?: string | null
          name: string
          party_id?: string | null
          slug: string
          stripe_account_id?: string | null
          updated_at?: string
          vibe?: string | null
        }
        Update: {
          bio?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string
          genre_tags?: string[] | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          logo_url?: string | null
          name?: string
          party_id?: string | null
          slug?: string
          stripe_account_id?: string | null
          updated_at?: string
          vibe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collectives_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          body: string
          collective_id: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          sent_at: string | null
          sent_to: number
          subject: string
        }
        Insert: {
          body: string
          collective_id: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          sent_at?: string | null
          sent_to?: number
          subject: string
        }
        Update: {
          body?: string
          collective_id?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          sent_at?: string | null
          sent_to?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_activity: {
        Row: {
          action: string
          created_at: string
          description: string | null
          event_id: string
          id: string
          metadata: Json | null
          party_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          party_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          party_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_activity_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_activity_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      event_analytics: {
        Row: {
          created_at: string
          event_id: string
          id: string
          page_views: number
          shares: number
          ticket_page_views: number
          unique_visitors: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          page_views?: number
          shares?: number
          ticket_page_views?: number
          unique_visitors?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          page_views?: number
          shares?: number
          ticket_page_views?: number
          unique_visitors?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_analytics_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_artists: {
        Row: {
          created_at: string
          event_id: string
          fee: number | null
          id: string
          name: string
          notes: string | null
          party_id: string | null
          role: string | null
          set_length: number | null
          set_time: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          event_id: string
          fee?: number | null
          id?: string
          name: string
          notes?: string | null
          party_id?: string | null
          role?: string | null
          set_length?: number | null
          set_time?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          fee?: number | null
          id?: string
          name?: string
          notes?: string | null
          party_id?: string | null
          role?: string | null
          set_length?: number | null
          set_time?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_artists_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cards: {
        Row: {
          content: Json
          created_at: string
          event_id: string
          id: string
          sort_order: number
          type: string
        }
        Insert: {
          content?: Json
          created_at?: string
          event_id: string
          id?: string
          sort_order?: number
          type: string
        }
        Update: {
          content?: Json
          created_at?: string
          event_id?: string
          id?: string
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string
          id: string
          is_paid: boolean
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id: string
          id?: string
          is_paid?: boolean
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string
          id?: string
          is_paid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_status_log: {
        Row: {
          changed_by: string | null
          event_id: string
          id: string
          note: string | null
          occurred_at: string
          status: Database["public"]["Enums"]["event_status_type"]
        }
        Insert: {
          changed_by?: string | null
          event_id: string
          id?: string
          note?: string | null
          occurred_at?: string
          status: Database["public"]["Enums"]["event_status_type"]
        }
        Update: {
          changed_by?: string | null
          event_id?: string
          id?: string
          note?: string | null
          occurred_at?: string
          status?: Database["public"]["Enums"]["event_status_type"]
        }
        Relationships: [
          {
            foreignKeyName: "event_status_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_status_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          event_id: string
          id: string
          metadata: Json | null
          priority: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          priority?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          priority?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          bar_minimum: number | null
          capacity: number | null
          city: string | null
          collective_id: string
          created_at: string
          currency: string
          description: string | null
          doors_at: string | null
          ends_at: string | null
          flyer_url: string | null
          id: string
          is_free: boolean
          is_published: boolean
          metadata: Json | null
          min_age: number | null
          published_at: string | null
          slug: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
          venue_party_id: string | null
          vibe_tags: string[] | null
        }
        Insert: {
          bar_minimum?: number | null
          capacity?: number | null
          city?: string | null
          collective_id: string
          created_at?: string
          currency?: string
          description?: string | null
          doors_at?: string | null
          ends_at?: string | null
          flyer_url?: string | null
          id?: string
          is_free?: boolean
          is_published?: boolean
          metadata?: Json | null
          min_age?: number | null
          published_at?: string | null
          slug?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          venue_party_id?: string | null
          vibe_tags?: string[] | null
        }
        Update: {
          bar_minimum?: number | null
          capacity?: number | null
          city?: string | null
          collective_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          doors_at?: string | null
          ends_at?: string | null
          flyer_url?: string | null
          id?: string
          is_free?: boolean
          is_published?: boolean
          metadata?: Json | null
          min_age?: number | null
          published_at?: string | null
          slug?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          venue_party_id?: string | null
          vibe_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "events_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_party_id_fkey"
            columns: ["venue_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      external_events: {
        Row: {
          city: string | null
          collective_id: string | null
          id: string
          metadata: Json | null
          scraped_at: string
          source: string | null
          source_url: string | null
          starts_at: string | null
          ticket_price: number | null
          title: string
          venue_name: string | null
        }
        Insert: {
          city?: string | null
          collective_id?: string | null
          id?: string
          metadata?: Json | null
          scraped_at?: string
          source?: string | null
          source_url?: string | null
          starts_at?: string | null
          ticket_price?: number | null
          title: string
          venue_name?: string | null
        }
        Update: {
          city?: string | null
          collective_id?: string | null
          id?: string
          metadata?: Json | null
          scraped_at?: string
          source?: string | null
          source_url?: string | null
          starts_at?: string | null
          ticket_price?: number | null
          title?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_events_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_list: {
        Row: {
          added_by: string | null
          checked_in: boolean
          created_at: string
          email: string | null
          event_id: string
          id: string
          name: string
          notes: string | null
          party_id: string | null
          plus_ones: number
        }
        Insert: {
          added_by?: string | null
          checked_in?: boolean
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          name: string
          notes?: string | null
          party_id?: string | null
          plus_ones?: number
        }
        Update: {
          added_by?: string | null
          checked_in?: boolean
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          name?: string
          notes?: string | null
          party_id?: string | null
          plus_ones?: number
        }
        Relationships: [
          {
            foreignKeyName: "guest_list_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_list_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_list_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          collective_id: string
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          collective_id: string
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          collective_id?: string
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          party_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          party_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          party_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity: number
          refunded_quantity: number
          subtotal: number
          tier_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity: number
          refunded_quantity?: number
          subtotal: number
          tier_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          refunded_quantity?: number
          subtotal?: number
          tier_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          event_id: string
          id: string
          metadata: Json | null
          party_id: string
          platform_fee: number
          promo_code_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_fee: number
          stripe_payment_intent_id: string | null
          subtotal: number
          total: number
        }
        Insert: {
          created_at?: string
          currency?: string
          event_id: string
          id?: string
          metadata?: Json | null
          party_id: string
          platform_fee?: number
          promo_code_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_fee?: number
          stripe_payment_intent_id?: string | null
          subtotal?: number
          total?: number
        }
        Update: {
          created_at?: string
          currency?: string
          event_id?: string
          id?: string
          metadata?: Json | null
          party_id?: string
          platform_fee?: number
          promo_code_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_fee?: number
          stripe_payment_intent_id?: string | null
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          created_at: string
          display_name: string
          id: string
          type: Database["public"]["Enums"]["party_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          type: Database["public"]["Enums"]["party_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
        }
        Relationships: []
      }
      party_contact_methods: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          party_id: string
          type: Database["public"]["Enums"]["contact_method_type"]
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          party_id: string
          type: Database["public"]["Enums"]["contact_method_type"]
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          party_id?: string
          type?: Database["public"]["Enums"]["contact_method_type"]
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_contact_methods_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_roles: {
        Row: {
          collective_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          party_id: string
          role: Database["public"]["Enums"]["party_role_type"]
        }
        Insert: {
          collective_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          party_id: string
          role: Database["public"]["Enums"]["party_role_type"]
        }
        Update: {
          collective_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          party_id?: string
          role?: Database["public"]["Enums"]["party_role_type"]
        }
        Relationships: [
          {
            foreignKeyName: "party_roles_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_roles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          customer_email: string | null
          event_id: string | null
          event_type: string
          id: string
          is_processed: boolean
          metadata: Json | null
          order_id: string | null
          processed_at: string | null
          raw_payload: Json | null
          status: string | null
          stripe_event_id: string
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          is_processed?: boolean
          metadata?: Json | null
          order_id?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          status?: string | null
          stripe_event_id: string
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          is_processed?: boolean
          metadata?: Json | null
          order_id?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          status?: string | null
          stripe_event_id?: string
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          collective_id: string
          created_at: string
          currency: string
          id: string
          method: string | null
          notes: string | null
          paid_at: string | null
          reference: string | null
          settlement_id: string
          status: string
        }
        Insert: {
          amount: number
          collective_id: string
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          settlement_id: string
          status?: string
        }
        Update: {
          amount?: number
          collective_id?: string
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          settlement_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_task_templates: {
        Row: {
          created_at: string
          description: string | null
          due_offset: number | null
          id: string
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_offset?: number | null
          id?: string
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_offset?: number | null
          id?: string
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_task_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "playbook_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_templates: {
        Row: {
          collective_id: string | null
          created_at: string
          description: string | null
          id: string
          is_global: boolean
          name: string
        }
        Insert: {
          collective_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_global?: boolean
          name: string
        }
        Update: {
          collective_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_global?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_templates_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_clicks: {
        Row: {
          created_at: string
          id: string
          promo_link_id: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          promo_link_id: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          promo_link_id?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_clicks_promo_link_id_fkey"
            columns: ["promo_link_id"]
            isOneToOne: false
            referencedRelation: "promo_links"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_usage: {
        Row: {
          id: string
          party_id: string | null
          promo_code_id: string
          ticket_id: string
          used_at: string
        }
        Insert: {
          id?: string
          party_id?: string | null
          promo_code_id: string
          ticket_id: string
          used_at?: string
        }
        Update: {
          id?: string
          party_id?: string | null
          promo_code_id?: string
          ticket_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_usage_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          event_id: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          starts_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type?: string
          discount_value: number
          event_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          starts_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          event_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_links: {
        Row: {
          clicks: number
          code: string
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          label: string | null
        }
        Insert: {
          clicks?: number
          code: string
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          label?: string | null
        }
        Update: {
          clicks?: number
          code?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          key: string
          window_end: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          key: string
          window_end: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          key?: string
          window_end?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          collective_id: string
          created_at: string
          duration_secs: number | null
          id: string
          status: string
          storage_path: string
          summary: string | null
          title: string | null
          transcript: string | null
          user_id: string
        }
        Insert: {
          collective_id: string
          created_at?: string
          duration_secs?: number | null
          id?: string
          status?: string
          storage_path: string
          summary?: string | null
          title?: string | null
          transcript?: string | null
          user_id: string
        }
        Update: {
          collective_id?: string
          created_at?: string
          duration_secs?: number | null
          id?: string
          status?: string
          storage_path?: string
          summary?: string | null
          title?: string | null
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvps: {
        Row: {
          access_token: string
          created_at: string
          email: string | null
          event_id: string
          full_name: string | null
          holder_party_id: string | null
          id: string
          message: string | null
          phone: string | null
          plus_ones: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_token?: string
          created_at?: string
          email?: string | null
          event_id: string
          full_name?: string | null
          holder_party_id?: string | null
          id?: string
          message?: string | null
          phone?: string | null
          plus_ones?: number
          status: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string
          email?: string | null
          event_id?: string
          full_name?: string | null
          holder_party_id?: string | null
          id?: string
          message?: string | null
          phone?: string | null
          plus_ones?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_holder_party_id_fkey"
            columns: ["holder_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_venues: {
        Row: {
          created_at: string
          id: string
          user_id: string
          venue_party_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          venue_party_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          venue_party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_venues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_venues_venue_party_id_fkey"
            columns: ["venue_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_lines: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          settlement_id: string
          ticket_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          settlement_id: string
          ticket_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          settlement_id?: string
          ticket_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_lines_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_lines_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          collective_id: string
          created_at: string
          event_id: string
          finalized_at: string | null
          id: string
          net_payout: number
          platform_fee: number
          status: string
          stripe_fee: number
          total_revenue: number
          updated_at: string
        }
        Insert: {
          collective_id: string
          created_at?: string
          event_id: string
          finalized_at?: string | null
          id?: string
          net_payout?: number
          platform_fee?: number
          status?: string
          stripe_fee?: number
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          collective_id?: string
          created_at?: string
          event_id?: string
          finalized_at?: string | null
          id?: string
          net_payout?: number
          platform_fee?: number
          status?: string
          stripe_fee?: number
          total_revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          event_type: Database["public"]["Enums"]["ticket_event_type"]
          id: string
          metadata: Json | null
          occurred_at: string
          party_id: string | null
          ticket_id: string
        }
        Insert: {
          event_type: Database["public"]["Enums"]["ticket_event_type"]
          id?: string
          metadata?: Json | null
          occurred_at?: string
          party_id?: string | null
          ticket_id: string
        }
        Update: {
          event_type?: Database["public"]["Enums"]["ticket_event_type"]
          id?: string
          metadata?: Json | null
          occurred_at?: string
          party_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tiers: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          name: string
          price: number
          sale_end_at: string | null
          sale_start_at: string | null
          sort_order: number
          tickets_sold: number
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sale_end_at?: string | null
          sale_start_at?: string | null
          sort_order?: number
          tickets_sold?: number
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sale_end_at?: string | null
          sale_start_at?: string | null
          sort_order?: number
          tickets_sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          notified_at: string | null
          party_id: string | null
          tier_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          notified_at?: string | null
          party_id?: string | null
          tier_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          notified_at?: string | null
          party_id?: string | null
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_waitlist_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_waitlist_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          event_id: string
          holder_party_id: string | null
          id: string
          issued_at: string
          order_line_id: string | null
          qr_code: string | null
          status: string
          tier_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          holder_party_id?: string | null
          id?: string
          issued_at?: string
          order_line_id?: string | null
          qr_code?: string | null
          status?: string
          tier_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          holder_party_id?: string | null
          id?: string
          issued_at?: string
          order_line_id?: string | null
          qr_code?: string | null
          status?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_holder_party_id_fkey"
            columns: ["holder_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          collective_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_approved: boolean
          party_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          collective_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_approved?: boolean
          party_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          collective_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_approved?: boolean
          party_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_profiles: {
        Row: {
          address: string | null
          amenities: string[] | null
          capacity: number | null
          city: string | null
          cover_photo_url: string | null
          created_at: string
          id: string
          is_active: boolean
          is_verified: boolean
          name: string
          party_id: string
          photo_url: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          capacity?: number | null
          city?: string | null
          cover_photo_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          name: string
          party_id: string
          photo_url?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          capacity?: number | null
          city?: string | null
          cover_photo_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          name?: string
          party_id?: string
          photo_url?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          city: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          referral: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          referral?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          referral?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_ticket_lock: { Args: { p_tier_id: string }; Returns: undefined }
      check_and_reserve_capacity: {
        Args: { p_quantity: number; p_tier_id: string }
        Returns: boolean
      }
      claim_promo_code: {
        Args: { p_code: string; p_event_id: string }
        Returns: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          event_id: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          starts_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "promo_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fulfill_tickets_atomic: {
        Args: {
          p_event_id: string
          p_holder_party_id: string
          p_order_line_id: string
          p_quantity: number
          p_tier_id: string
        }
        Returns: {
          created_at: string
          event_id: string
          holder_party_id: string | null
          id: string
          issued_at: string
          order_line_id: string | null
          qr_code: string | null
          status: string
          tier_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_collectives: { Args: never; Returns: string[] }
      has_collective_role:
        | {
            Args: { p_collective_id: string; p_role: string }
            Returns: boolean
          }
        | {
            Args: {
              p_collective_id: string
              p_roles: Database["public"]["Enums"]["collective_role"][]
            }
            Returns: boolean
          }
      increment_analytics_counter:
        | { Args: { p_event_id: string; p_field: string }; Returns: undefined }
        | {
            Args: { p_event_id: string; p_field: string; p_value?: number }
            Returns: undefined
          }
      increment_attendee_profile: {
        Args: {
          p_collective_id: string
          p_email: string
          p_name: string
          p_party_id: string
          p_spend: number
          p_ticket_count: number
        }
        Returns: undefined
      }
      increment_promo_click:
        | { Args: { p_code: string }; Returns: undefined }
        | { Args: { p_link_id: string }; Returns: undefined }
      track_ticket_refund: {
        Args: { p_quantity: number; p_tier_id: string }
        Returns: undefined
      }
      track_ticket_sale: {
        Args: { p_quantity: number; p_tier_id: string }
        Returns: undefined
      }
    }
    Enums: {
      audit_action: "INSERT" | "UPDATE" | "DELETE"
      booking_status: "pending" | "confirmed" | "declined" | "cancelled"
      campaign_status: "draft" | "scheduled" | "sending" | "sent" | "cancelled"
      collective_role:
        | "admin"
        | "promoter"
        | "talent_buyer"
        | "door_staff"
        | "member"
        | "owner"
      contact_method_type:
        | "email"
        | "phone"
        | "instagram"
        | "soundcloud"
        | "spotify"
        | "website"
        | "twitter"
      event_collective_role: "primary" | "co_host" | "sponsor"
      event_status:
        | "draft"
        | "published"
        | "cancelled"
        | "completed"
        | "upcoming"
        | "settled"
      event_status_type: "draft" | "published" | "cancelled" | "wrapped"
      order_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
      party_role_type:
        | "artist"
        | "collective"
        | "venue_operator"
        | "platform_user"
        | "contact"
      party_type: "person" | "organization" | "venue"
      payout_status: "pending" | "processing" | "completed" | "failed"
      settlement_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "paid_out"
        | "disputed"
        | "sent"
      ticket_event_type:
        | "purchased"
        | "transferred"
        | "checked_in"
        | "refunded"
        | "voided"
      ticket_status:
        | "reserved"
        | "paid"
        | "checked_in"
        | "refunded"
        | "cancelled"
        | "free"
        | "pending"
      transaction_type:
        | "ticket_sale"
        | "refund"
        | "payout"
        | "adjustment"
        | "platform_fee"
        | "stripe_fee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: ["INSERT", "UPDATE", "DELETE"],
      booking_status: ["pending", "confirmed", "declined", "cancelled"],
      campaign_status: ["draft", "scheduled", "sending", "sent", "cancelled"],
      collective_role: [
        "admin",
        "promoter",
        "talent_buyer",
        "door_staff",
        "member",
        "owner",
      ],
      contact_method_type: [
        "email",
        "phone",
        "instagram",
        "soundcloud",
        "spotify",
        "website",
        "twitter",
      ],
      event_collective_role: ["primary", "co_host", "sponsor"],
      event_status: [
        "draft",
        "published",
        "cancelled",
        "completed",
        "upcoming",
        "settled",
      ],
      event_status_type: ["draft", "published", "cancelled", "wrapped"],
      order_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      party_role_type: [
        "artist",
        "collective",
        "venue_operator",
        "platform_user",
        "contact",
      ],
      party_type: ["person", "organization", "venue"],
      payout_status: ["pending", "processing", "completed", "failed"],
      settlement_status: [
        "draft",
        "pending_approval",
        "approved",
        "paid_out",
        "disputed",
        "sent",
      ],
      ticket_event_type: [
        "purchased",
        "transferred",
        "checked_in",
        "refunded",
        "voided",
      ],
      ticket_status: [
        "reserved",
        "paid",
        "checked_in",
        "refunded",
        "cancelled",
        "free",
        "pending",
      ],
      transaction_type: [
        "ticket_sale",
        "refund",
        "payout",
        "adjustment",
        "platform_fee",
        "stripe_fee",
      ],
    },
  },
} as const
