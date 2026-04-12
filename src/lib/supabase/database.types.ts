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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      artists: {
        Row: {
          bio: string | null
          booking_email: string | null
          created_at: string
          default_fee: number | null
          deleted_at: string | null
          genre: string[] | null
          id: string
          instagram: string | null
          metadata: Json | null
          name: string
          phone: string | null
          photo_url: string | null
          slug: string
          soundcloud: string | null
          spotify: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          booking_email?: string | null
          created_at?: string
          default_fee?: number | null
          deleted_at?: string | null
          genre?: string[] | null
          id?: string
          instagram?: string | null
          metadata?: Json | null
          name: string
          phone?: string | null
          photo_url?: string | null
          slug: string
          soundcloud?: string | null
          spotify?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          booking_email?: string | null
          created_at?: string
          default_fee?: number | null
          deleted_at?: string | null
          genre?: string[] | null
          id?: string
          instagram?: string | null
          metadata?: Json | null
          name?: string
          phone?: string | null
          photo_url?: string | null
          slug?: string
          soundcloud?: string | null
          spotify?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendee_profiles: {
        Row: {
          collective_id: string | null
          created_at: string
          email: string | null
          favorite_genre: string | null
          favorite_venue_id: string | null
          first_event_at: string | null
          first_purchase_at: string | null
          full_name: string | null
          id: string
          last_event_at: string | null
          last_purchase_at: string | null
          metadata: Json | null
          phone: string | null
          referral_count: number | null
          segment: string | null
          tags: string[] | null
          total_events: number | null
          total_spend: number | null
          total_spent: number | null
          total_tickets: number | null
          updated_at: string
          user_id: string | null
          vip_status: boolean | null
        }
        Insert: {
          collective_id?: string | null
          created_at?: string
          email?: string | null
          favorite_genre?: string | null
          favorite_venue_id?: string | null
          first_event_at?: string | null
          first_purchase_at?: string | null
          full_name?: string | null
          id?: string
          last_event_at?: string | null
          last_purchase_at?: string | null
          metadata?: Json | null
          phone?: string | null
          referral_count?: number | null
          segment?: string | null
          tags?: string[] | null
          total_events?: number | null
          total_spend?: number | null
          total_spent?: number | null
          total_tickets?: number | null
          updated_at?: string
          user_id?: string | null
          vip_status?: boolean | null
        }
        Update: {
          collective_id?: string | null
          created_at?: string
          email?: string | null
          favorite_genre?: string | null
          favorite_venue_id?: string | null
          first_event_at?: string | null
          first_purchase_at?: string | null
          full_name?: string | null
          id?: string
          last_event_at?: string | null
          last_purchase_at?: string | null
          metadata?: Json | null
          phone?: string | null
          referral_count?: number | null
          segment?: string | null
          tags?: string[] | null
          total_events?: number | null
          total_spend?: number | null
          total_spent?: number | null
          total_tickets?: number | null
          updated_at?: string
          user_id?: string | null
          vip_status?: boolean | null
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
            foreignKeyName: "attendee_profiles_favorite_venue_id_fkey"
            columns: ["favorite_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendee_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          collective_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          collective_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_segments: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          segment_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          segment_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_segments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_segments_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          is_online: boolean
          joined_at: string
          last_seen_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          is_online?: boolean
          joined_at?: string
          last_seen_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          is_online?: boolean
          joined_at?: string
          last_seen_at?: string | null
          role?: string
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
        ]
      }
      channels: {
        Row: {
          collective_id: string
          created_at: string | null
          event_id: string | null
          id: string
          metadata: Json | null
          name: string
          partner_collective_id: string | null
          type: string
        }
        Insert: {
          collective_id: string
          created_at?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json | null
          name: string
          partner_collective_id?: string | null
          type?: string
        }
        Update: {
          collective_id?: string
          created_at?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          partner_collective_id?: string | null
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
            foreignKeyName: "channels_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "channels_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_partner_collective_id_fkey"
            columns: ["partner_collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_members: {
        Row: {
          collective_id: string
          created_at: string
          deleted_at: string | null
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["collective_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          collective_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["collective_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          collective_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["collective_role"]
          updated_at?: string
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
            foreignKeyName: "collective_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
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
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          metadata: Json | null
          name: string
          referral_code: string | null
          slug: string
          stripe_account_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          bio?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          metadata?: Json | null
          name: string
          referral_code?: string | null
          slug: string
          stripe_account_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          bio?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          referral_code?: string | null
          slug?: string
          stripe_account_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          artist_id: string | null
          collective_id: string
          contact_type: string
          created_at: string
          deleted_at: string | null
          email: string | null
          first_seen_at: string | null
          follow_up_at: string | null
          full_name: string | null
          id: string
          instagram: string | null
          last_seen_at: string | null
          marketplace_profile_id: string | null
          metadata: Json | null
          notes: string | null
          phone: string | null
          role: string | null
          source: string
          source_detail: string | null
          tags: string[] | null
          total_events: number | null
          total_spend: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          artist_id?: string | null
          collective_id: string
          contact_type?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_seen_at?: string | null
          follow_up_at?: string | null
          full_name?: string | null
          id?: string
          instagram?: string | null
          last_seen_at?: string | null
          marketplace_profile_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          source?: string
          source_detail?: string | null
          tags?: string[] | null
          total_events?: number | null
          total_spend?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          artist_id?: string | null
          collective_id?: string
          contact_type?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_seen_at?: string | null
          follow_up_at?: string | null
          full_name?: string | null
          id?: string
          instagram?: string | null
          last_seen_at?: string | null
          marketplace_profile_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          source?: string
          source_detail?: string | null
          tags?: string[] | null
          total_events?: number | null
          total_spend?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          body_html: string | null
          body_text: string | null
          clicks: number | null
          collective_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string | null
          id: string
          metadata: Json | null
          name: string
          opens: number | null
          recipients: number | null
          scheduled_at: string | null
          send_to_all: boolean | null
          sent_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          clicks?: number | null
          collective_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json | null
          name: string
          opens?: number | null
          recipients?: number | null
          scheduled_at?: string | null
          send_to_all?: boolean | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          clicks?: number | null
          collective_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          opens?: number | null
          recipients?: number | null
          scheduled_at?: string | null
          send_to_all?: boolean | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string
          updated_at?: string
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
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
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
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_activity_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_activity_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
          avg_ticket_price: number | null
          capacity_percentage: number | null
          checkout_completions: number | null
          checkout_starts: number | null
          conversion_rate: number | null
          event_id: string
          gross_revenue: number | null
          id: string
          net_revenue: number | null
          page_views: number | null
          promo_redemptions: number | null
          referral_count: number | null
          tickets_refunded: number | null
          tickets_sold: number | null
          tier_clicks: number | null
          unique_visitors: number | null
          updated_at: string | null
        }
        Insert: {
          avg_ticket_price?: number | null
          capacity_percentage?: number | null
          checkout_completions?: number | null
          checkout_starts?: number | null
          conversion_rate?: number | null
          event_id: string
          gross_revenue?: number | null
          id?: string
          net_revenue?: number | null
          page_views?: number | null
          promo_redemptions?: number | null
          referral_count?: number | null
          tickets_refunded?: number | null
          tickets_sold?: number | null
          tier_clicks?: number | null
          unique_visitors?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_ticket_price?: number | null
          capacity_percentage?: number | null
          checkout_completions?: number | null
          checkout_starts?: number | null
          conversion_rate?: number | null
          event_id?: string
          gross_revenue?: number | null
          id?: string
          net_revenue?: number | null
          page_views?: number | null
          promo_redemptions?: number | null
          referral_count?: number | null
          tickets_refunded?: number | null
          tickets_sold?: number | null
          tier_clicks?: number | null
          unique_visitors?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_analytics_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
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
          artist_id: string
          booked_by: string | null
          created_at: string
          event_id: string
          fee: number | null
          fee_currency: string | null
          flight_cost: number | null
          hotel_cost: number | null
          id: string
          notes: string | null
          set_duration: number | null
          set_time: string | null
          status: Database["public"]["Enums"]["booking_status"]
          transport_cost: number | null
          travel_notes: string | null
          updated_at: string
        }
        Insert: {
          artist_id: string
          booked_by?: string | null
          created_at?: string
          event_id: string
          fee?: number | null
          fee_currency?: string | null
          flight_cost?: number | null
          hotel_cost?: number | null
          id?: string
          notes?: string | null
          set_duration?: number | null
          set_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          transport_cost?: number | null
          travel_notes?: string | null
          updated_at?: string
        }
        Update: {
          artist_id?: string
          booked_by?: string | null
          created_at?: string
          event_id?: string
          fee?: number | null
          fee_currency?: string | null
          flight_cost?: number | null
          hotel_cost?: number | null
          id?: string
          notes?: string | null
          set_duration?: number | null
          set_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          transport_cost?: number | null
          travel_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_artists_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cards: {
        Row: {
          card_type: string
          content: string | null
          created_at: string
          deleted_at: string | null
          event_id: string
          id: string
          metadata: Json | null
          position: number | null
          title: string | null
          updated_at: string
        }
        Insert: {
          card_type: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          position?: number | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          card_type?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          position?: number | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_cards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_collectives: {
        Row: {
          collective_id: string
          created_at: string
          event_id: string
          id: string
          revenue_share_pct: number | null
          role: Database["public"]["Enums"]["event_collective_role"]
        }
        Insert: {
          collective_id: string
          created_at?: string
          event_id: string
          id?: string
          revenue_share_pct?: number | null
          role?: Database["public"]["Enums"]["event_collective_role"]
        }
        Update: {
          collective_id?: string
          created_at?: string
          event_id?: string
          id?: string
          revenue_share_pct?: number | null
          role?: Database["public"]["Enums"]["event_collective_role"]
        }
        Relationships: [
          {
            foreignKeyName: "event_collectives_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_collectives_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_collectives_event_id_fkey"
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
          deleted_at: string | null
          description: string | null
          event_id: string
          id: string
          metadata: Json | null
          receipt_url: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          receipt_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          receipt_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
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
      event_reactions: {
        Row: {
          created_at: string
          emoji: string
          event_id: string
          fingerprint: string
          id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          event_id: string
          fingerprint: string
          id?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          event_id?: string
          fingerprint?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_reactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_revenue: {
        Row: {
          amount: number
          category: string
          collective_id: string
          created_at: string
          description: string
          event_id: string
          id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string
          collective_id: string
          created_at?: string
          description: string
          event_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          collective_id?: string
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_revenue_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_revenue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_revenue_event_id_fkey"
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
          deleted_at: string | null
          description: string | null
          due_at: string | null
          event_id: string
          id: string
          metadata: Json | null
          priority: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          priority?: string | null
          status?: string | null
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
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
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
      event_updates: {
        Row: {
          author_id: string
          body: string
          created_at: string
          email_sent: boolean
          emailed_at: string | null
          event_id: string
          id: string
          recipient_count: number
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          email_sent?: boolean
          emailed_at?: string | null
          event_id: string
          id?: string
          recipient_count?: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          email_sent?: boolean
          emailed_at?: string | null
          event_id?: string
          id?: string
          recipient_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_updates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_updates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actual_bar_revenue: number | null
          bar_minimum: number | null
          collective_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          doors_at: string | null
          ends_at: string | null
          estimated_bar_revenue: number | null
          event_mode: string
          flyer_url: string | null
          id: string
          is_free: boolean | null
          metadata: Json | null
          min_age: number | null
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          ticket_capacity: number | null
          ticket_price: number | null
          title: string
          updated_at: string
          venue_cost: number | null
          venue_deposit: number | null
          venue_id: string | null
          vibe_tags: string[] | null
        }
        Insert: {
          actual_bar_revenue?: number | null
          bar_minimum?: number | null
          collective_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          doors_at?: string | null
          ends_at?: string | null
          estimated_bar_revenue?: number | null
          event_mode?: string
          flyer_url?: string | null
          id?: string
          is_free?: boolean | null
          metadata?: Json | null
          min_age?: number | null
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          ticket_capacity?: number | null
          ticket_price?: number | null
          title: string
          updated_at?: string
          venue_cost?: number | null
          venue_deposit?: number | null
          venue_id?: string | null
          vibe_tags?: string[] | null
        }
        Update: {
          actual_bar_revenue?: number | null
          bar_minimum?: number | null
          collective_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          doors_at?: string | null
          ends_at?: string | null
          estimated_bar_revenue?: number | null
          event_mode?: string
          flyer_url?: string | null
          id?: string
          is_free?: boolean | null
          metadata?: Json | null
          min_age?: number | null
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          ticket_capacity?: number | null
          ticket_price?: number | null
          title?: string
          updated_at?: string
          venue_cost?: number | null
          venue_deposit?: number | null
          venue_id?: string | null
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
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          collective_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          event_id: string
          id: string
          metadata: Json | null
          paid_by: string | null
          receipt_url: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          collective_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          paid_by?: string | null
          receipt_url?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          collective_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          paid_by?: string | null
          receipt_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_events: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          event_date: string | null
          external_url: string
          flyer_url: string | null
          id: string
          metadata: Json | null
          platform: string | null
          promoter_id: string
          title: string
          updated_at: string | null
          venue_name: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          event_date?: string | null
          external_url: string
          flyer_url?: string | null
          id?: string
          metadata?: Json | null
          platform?: string | null
          promoter_id: string
          title: string
          updated_at?: string | null
          venue_name?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          event_date?: string | null
          external_url?: string
          flyer_url?: string | null
          id?: string
          metadata?: Json | null
          platform?: string | null
          promoter_id?: string
          title?: string
          updated_at?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_events_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_list: {
        Row: {
          added_by: string | null
          checked_in_at: string | null
          created_at: string
          email: string | null
          event_id: string
          id: string
          metadata: Json | null
          name: string
          notes: string | null
          phone: string | null
          plus_ones: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          checked_in_at?: string | null
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          name: string
          notes?: string | null
          phone?: string | null
          plus_ones?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          checked_in_at?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          name?: string
          notes?: string | null
          phone?: string | null
          plus_ones?: number | null
          status?: string | null
          updated_at?: string
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
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "guest_list_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          collective_id: string
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: string
          status: string
          token: string | null
          type: string
        }
        Insert: {
          collective_id: string
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          token?: string | null
          type?: string
        }
        Update: {
          collective_id?: string
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          token?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_inquiries: {
        Row: {
          created_at: string | null
          event_id: string | null
          from_user_id: string
          id: string
          inquiry_type: string
          message: string | null
          status: string
          to_profile_id: string
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          from_user_id: string
          id?: string
          inquiry_type?: string
          message?: string | null
          status?: string
          to_profile_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          from_user_id?: string
          id?: string
          inquiry_type?: string
          message?: string | null
          status?: string
          to_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_inquiries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "marketplace_inquiries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_inquiries_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_inquiries_to_profile_id_fkey"
            columns: ["to_profile_id"]
            isOneToOne: false
            referencedRelation: "marketplace_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_profiles: {
        Row: {
          availability: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          cover_photo_url: string | null
          created_at: string | null
          display_name: string
          genres: string[] | null
          id: string
          instagram_handle: string | null
          is_active: boolean | null
          is_verified: boolean | null
          past_venues: string[] | null
          portfolio_urls: string[] | null
          rate_range: string | null
          services: string[] | null
          slug: string
          soundcloud_url: string | null
          spotify_url: string | null
          updated_at: string | null
          user_id: string
          user_type: string
          website_url: string | null
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          cover_photo_url?: string | null
          created_at?: string | null
          display_name: string
          genres?: string[] | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean | null
          is_verified?: boolean | null
          past_venues?: string[] | null
          portfolio_urls?: string[] | null
          rate_range?: string | null
          services?: string[] | null
          slug: string
          soundcloud_url?: string | null
          spotify_url?: string | null
          updated_at?: string | null
          user_id: string
          user_type: string
          website_url?: string | null
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          cover_photo_url?: string | null
          created_at?: string | null
          display_name?: string
          genres?: string[] | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean | null
          is_verified?: boolean | null
          past_venues?: string[] | null
          portfolio_urls?: string[] | null
          rate_range?: string | null
          services?: string[] | null
          slug?: string
          soundcloud_url?: string | null
          spotify_url?: string | null
          updated_at?: string | null
          user_id?: string
          user_type?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_saved: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_saved_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "marketplace_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_saved_user_id_fkey"
            columns: ["user_id"]
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
          created_at: string | null
          id: string
          metadata: Json | null
          type: string
          user_id: string | null
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          type?: string
          user_id?: string | null
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          type?: string
          user_id?: string | null
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
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount_cents: number | null
          buyer_email: string | null
          created_at: string | null
          currency: string | null
          error_message: string | null
          event_id: string | null
          event_type: string
          id: string
          metadata: Json | null
          payment_intent_id: string | null
          quantity: number | null
          tier_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          buyer_email?: string | null
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          payment_intent_id?: string | null
          quantity?: number | null
          tier_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          buyer_email?: string | null
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          payment_intent_id?: string | null
          quantity?: number | null
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "payment_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          collective_id: string
          completed_at: string | null
          created_at: string
          currency: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          initiated_at: string | null
          metadata: Json | null
          recipient_user_id: string | null
          recipient_venue_id: string | null
          settlement_id: string
          status: Database["public"]["Enums"]["payout_status"]
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          collective_id: string
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          initiated_at?: string | null
          metadata?: Json | null
          recipient_user_id?: string | null
          recipient_venue_id?: string | null
          settlement_id: string
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          collective_id?: string
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          initiated_at?: string | null
          metadata?: Json | null
          recipient_user_id?: string | null
          recipient_venue_id?: string | null
          settlement_id?: string
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
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
            foreignKeyName: "payouts_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_recipient_venue_id_fkey"
            columns: ["recipient_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
          default_assignee_role: string | null
          description: string | null
          due_offset_hours: number | null
          id: string
          metadata: Json | null
          playbook_id: string
          position: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_assignee_role?: string | null
          description?: string | null
          due_offset_hours?: number | null
          id?: string
          metadata?: Json | null
          playbook_id: string
          position?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_assignee_role?: string | null
          description?: string | null
          due_offset_hours?: number | null
          id?: string
          metadata?: Json | null
          playbook_id?: string
          position?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_task_templates_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbook_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_templates: {
        Row: {
          category: string | null
          collective_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_global: boolean | null
          metadata: Json | null
          name: string
          tasks: Json | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          collective_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_global?: boolean | null
          metadata?: Json | null
          name: string
          tasks?: Json | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          collective_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_global?: boolean | null
          metadata?: Json | null
          name?: string
          tasks?: Json | null
          updated_at?: string
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
          clicked_at: string | null
          id: string
          promo_link_id: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string | null
          id?: string
          promo_link_id: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string | null
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
      promo_codes: {
        Row: {
          code: string
          collective_id: string
          created_at: string
          current_uses: number | null
          discount_type: string | null
          discount_value: number | null
          event_id: string | null
          id: string
          max_uses: number | null
          promoter_id: string
          updated_at: string
          uses_count: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          collective_id: string
          created_at?: string
          current_uses?: number | null
          discount_type?: string | null
          discount_value?: number | null
          event_id?: string | null
          id?: string
          max_uses?: number | null
          promoter_id: string
          updated_at?: string
          uses_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          collective_id?: string
          created_at?: string
          current_uses?: number | null
          discount_type?: string | null
          discount_value?: number | null
          event_id?: string | null
          id?: string
          max_uses?: number | null
          promoter_id?: string
          updated_at?: string
          uses_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "promo_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_links: {
        Row: {
          click_count: number | null
          created_at: string | null
          event_id: string | null
          external_event_id: string | null
          id: string
          promoter_id: string
          token: string
        }
        Insert: {
          click_count?: number | null
          created_at?: string | null
          event_id?: string | null
          external_event_id?: string | null
          id?: string
          promoter_id: string
          token: string
        }
        Update: {
          click_count?: number | null
          created_at?: string | null
          event_id?: string | null
          external_event_id?: string | null
          id?: string
          promoter_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "promo_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_links_external_event_id_fkey"
            columns: ["external_event_id"]
            isOneToOne: false
            referencedRelation: "external_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_links_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          action_items: string | null
          audio_url: string
          collective_id: string
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          id: string
          key_decisions: string | null
          metadata: Json | null
          status: string | null
          summary: string | null
          title: string | null
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_items?: string | null
          audio_url: string
          collective_id: string
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          key_decisions?: string | null
          metadata?: Json | null
          status?: string | null
          summary?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_items?: string | null
          audio_url?: string
          collective_id?: string
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          key_decisions?: string | null
          metadata?: Json | null
          status?: string | null
          summary?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
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
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_venues: {
        Row: {
          collective_id: string
          created_at: string
          id: string
          metadata: Json | null
          notes: string | null
          rating: number | null
          venue_id: string
        }
        Insert: {
          collective_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          rating?: number | null
          venue_id: string
        }
        Update: {
          collective_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          rating?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_venues_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_members: {
        Row: {
          added_at: string
          attendee_profile_id: string
          id: string
          segment_id: string
        }
        Insert: {
          added_at?: string
          attendee_profile_id: string
          id?: string
          segment_id: string
        }
        Update: {
          added_at?: string
          attendee_profile_id?: string
          id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_members_attendee_profile_id_fkey"
            columns: ["attendee_profile_id"]
            isOneToOne: false
            referencedRelation: "attendee_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          collective_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          filter_rules: Json | null
          id: string
          is_dynamic: boolean | null
          member_count: number | null
          name: string
          updated_at: string
        }
        Insert: {
          collective_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          filter_rules?: Json | null
          id?: string
          is_dynamic?: boolean | null
          member_count?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          collective_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          filter_rules?: Json | null
          id?: string
          is_dynamic?: boolean | null
          member_count?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_lines: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string
          id: string
          metadata: Json | null
          settlement_id: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          settlement_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_lines_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          artist_fees_total: number | null
          collective_id: string
          created_at: string
          event_id: string
          gross_revenue: number | null
          id: string
          metadata: Json | null
          net_profit: number | null
          net_revenue: number | null
          notes: string | null
          other_costs: number | null
          platform_fee: number | null
          profit: number | null
          refunds_total: number | null
          status: Database["public"]["Enums"]["settlement_status"]
          stripe_fees: number | null
          total_artist_fees: number | null
          total_costs: number | null
          updated_at: string
          venue_fee: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          artist_fees_total?: number | null
          collective_id: string
          created_at?: string
          event_id: string
          gross_revenue?: number | null
          id?: string
          metadata?: Json | null
          net_profit?: number | null
          net_revenue?: number | null
          notes?: string | null
          other_costs?: number | null
          platform_fee?: number | null
          profit?: number | null
          refunds_total?: number | null
          status?: Database["public"]["Enums"]["settlement_status"]
          stripe_fees?: number | null
          total_artist_fees?: number | null
          total_costs?: number | null
          updated_at?: string
          venue_fee?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          artist_fees_total?: number | null
          collective_id?: string
          created_at?: string
          event_id?: string
          gross_revenue?: number | null
          id?: string
          metadata?: Json | null
          net_profit?: number | null
          net_revenue?: number | null
          notes?: string | null
          other_costs?: number | null
          platform_fee?: number | null
          profit?: number | null
          refunds_total?: number | null
          status?: Database["public"]["Enums"]["settlement_status"]
          stripe_fees?: number | null
          total_artist_fees?: number | null
          total_costs?: number | null
          updated_at?: string
          venue_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
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
            isOneToOne: true
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "settlements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      split_items: {
        Row: {
          amount: number
          collective_id: string | null
          created_at: string
          id: string
          label: string
          payout_id: string | null
          percentage: number | null
          settlement_id: string
          type: string
          updated_at: string
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          amount: number
          collective_id?: string | null
          created_at?: string
          id?: string
          label: string
          payout_id?: string | null
          percentage?: number | null
          settlement_id: string
          type: string
          updated_at?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          amount?: number
          collective_id?: string | null
          created_at?: string
          id?: string
          label?: string
          payout_id?: string | null
          percentage?: number | null
          settlement_id?: string
          type?: string
          updated_at?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_split_items_payout"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_items_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
          name: string
          price: number
          sales_end: string | null
          sales_start: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          name: string
          price: number
          sales_end?: string | null
          sales_start?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          name?: string
          price?: number
          sales_end?: string | null
          sales_start?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
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
          event_id: string
          id: string
          name: string | null
          notified_at: string | null
          tier_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          id?: string
          name?: string | null
          notified_at?: string | null
          tier_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          name?: string | null
          notified_at?: string | null
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "ticket_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
          attendee_name: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          currency: string | null
          event_id: string
          id: string
          metadata: Json | null
          price_paid: number
          promo_code_id: string | null
          qr_code: string | null
          referred_by: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          stripe_payment_intent_id: string | null
          ticket_tier_id: string | null
          ticket_token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attendee_name?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          currency?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          price_paid: number
          promo_code_id?: string | null
          qr_code?: string | null
          referred_by?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          stripe_payment_intent_id?: string | null
          ticket_tier_id?: string | null
          ticket_token?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attendee_name?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          currency?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          price_paid?: number
          promo_code_id?: string | null
          qr_code?: string | null
          referred_by?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          stripe_payment_intent_id?: string | null
          ticket_tier_id?: string | null
          ticket_token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          collective_id: string
          created_at: string
          currency: string | null
          description: string | null
          event_id: string | null
          id: string
          metadata: Json | null
          settlement_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          stripe_transfer_id: string | null
          ticket_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          collective_id: string
          created_at?: string
          currency?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json | null
          settlement_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_transfer_id?: string | null
          ticket_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          collective_id?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json | null
          settlement_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_transfer_id?: string | null
          ticket_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string
          full_name: string
          id: string
          is_approved: boolean
          is_denied: boolean | null
          metadata: Json | null
          phone: string | null
          stripe_account_id: string | null
          updated_at: string
          user_type: string
        }
        Insert: {
          auth_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email: string
          full_name: string
          id?: string
          is_approved?: boolean
          is_denied?: boolean | null
          metadata?: Json | null
          phone?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_type?: string
        }
        Update: {
          auth_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          is_denied?: boolean | null
          metadata?: Json | null
          phone?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_type?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          instagram: string | null
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          name: string
          postal_code: string | null
          slug: string
          state: string | null
          stripe_account_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          instagram?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          name: string
          postal_code?: string | null
          slug: string
          state?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          instagram?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          name?: string
          postal_code?: string | null
          slug?: string
          state?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          created_at: string
          email: string
          event_id: string
          id: string
          metadata: Json | null
          name: string | null
          notified_at: string | null
          phone: string | null
          status: string | null
          tier_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          id?: string
          metadata?: Json | null
          name?: string | null
          notified_at?: string | null
          phone?: string | null
          status?: string | null
          tier_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          metadata?: Json | null
          name?: string | null
          notified_at?: string | null
          phone?: string | null
          status?: string | null
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "waitlist_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_dashboard: {
        Row: {
          checked_in: number | null
          collective_id: string | null
          confirmed_artists: number | null
          event_id: string | null
          gross_revenue: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"] | null
          tickets_sold: number | null
          title: string | null
          total_artist_fees: number | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvp_counts: {
        Row: {
          count: number | null
          event_id: string | null
          plus_ones_total: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      promoter_performance: {
        Row: {
          code: string | null
          collective_id: string | null
          event_id: string | null
          event_title: string | null
          promoter_id: string | null
          promoter_name: string | null
          revenue_generated: number | null
          tickets_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_dashboard"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "promo_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acquire_ticket_lock: { Args: { p_tier_id: string }; Returns: boolean }
      check_and_reserve_capacity: {
        Args: { p_quantity: number; p_tier_id: string }
        Returns: Json
      }
      claim_promo_code: {
        Args: { p_code_id: string; p_quantity?: number }
        Returns: undefined
      }
      fulfill_tickets_atomic: {
        Args: {
          p_buyer_email?: string
          p_currency: string
          p_event_id: string
          p_metadata?: Json
          p_payment_intent_id: string
          p_price_paid: number
          p_quantity: number
          p_referrer_token?: string
          p_tier_id: string
        }
        Returns: Json
      }
      get_user_collectives: { Args: never; Returns: string[] }
      has_collective_role: {
        Args: {
          p_collective_id: string
          p_roles: Database["public"]["Enums"]["collective_role"][]
        }
        Returns: boolean
      }
      increment_analytics_counter: {
        Args: { p_column: string; p_event_id: string; p_value?: number }
        Returns: undefined
      }
      increment_attendee_profile: {
        Args: { p_collective_id: string; p_email: string; p_spent: number }
        Returns: undefined
      }
      increment_promo_click: { Args: { p_link_id: string }; Returns: undefined }
      track_ticket_refund: {
        Args: { p_amount: number; p_event_id: string; p_quantity: number }
        Returns: undefined
      }
      track_ticket_sale: {
        Args: { p_event_id: string; p_quantity: number; p_revenue: number }
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
      event_collective_role: "primary" | "co_host" | "sponsor"
      event_status:
        | "draft"
        | "published"
        | "cancelled"
        | "completed"
        | "upcoming"
        | "settled"
      payout_status: "pending" | "processing" | "completed" | "failed"
      settlement_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "paid_out"
        | "disputed"
        | "sent"
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
      event_collective_role: ["primary", "co_host", "sponsor"],
      event_status: [
        "draft",
        "published",
        "cancelled",
        "completed",
        "upcoming",
        "settled",
      ],
      payout_status: ["pending", "processing", "completed", "failed"],
      settlement_status: [
        "draft",
        "pending_approval",
        "approved",
        "paid_out",
        "disputed",
        "sent",
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

