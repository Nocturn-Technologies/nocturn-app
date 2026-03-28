// Generated database types for Nocturn — inferred from codebase usage.
// Replace with `supabase gen types typescript` output when available.

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          display_name: string | null
          avatar_url: string | null
          phone: string | null
          user_type: string | null
          metadata: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          display_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          user_type?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          display_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          user_type?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      collectives: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          bio: string | null
          logo_url: string | null
          website: string | null
          instagram: string | null
          city: string | null
          stripe_account_id: string | null
          metadata: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          bio?: string | null
          logo_url?: string | null
          website?: string | null
          instagram?: string | null
          city?: string | null
          stripe_account_id?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          bio?: string | null
          logo_url?: string | null
          website?: string | null
          instagram?: string | null
          city?: string | null
          stripe_account_id?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      collective_members: {
        Row: {
          id: string
          collective_id: string
          user_id: string
          role: string
          joined_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          collective_id: string
          user_id: string
          role?: string
          joined_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          collective_id?: string
          user_id?: string
          role?: string
          joined_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
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
            foreignKeyName: "collective_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }

      events: {
        Row: {
          id: string
          collective_id: string
          venue_id: string
          title: string
          slug: string
          description: string | null
          starts_at: string
          ends_at: string | null
          doors_at: string | null
          status: string
          flyer_url: string | null
          vibe_tags: string[] | null
          min_age: number | null
          bar_minimum: number | null
          venue_deposit: number | null
          venue_cost: number | null
          estimated_bar_revenue: number | null
          metadata: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          collective_id: string
          venue_id: string
          title: string
          slug: string
          description?: string | null
          starts_at: string
          ends_at?: string | null
          doors_at?: string | null
          status?: string
          flyer_url?: string | null
          vibe_tags?: string[] | null
          min_age?: number | null
          bar_minimum?: number | null
          venue_deposit?: number | null
          venue_cost?: number | null
          estimated_bar_revenue?: number | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          collective_id?: string
          venue_id?: string
          title?: string
          slug?: string
          description?: string | null
          starts_at?: string
          ends_at?: string | null
          doors_at?: string | null
          status?: string
          flyer_url?: string | null
          vibe_tags?: string[] | null
          min_age?: number | null
          bar_minimum?: number | null
          venue_deposit?: number | null
          venue_cost?: number | null
          estimated_bar_revenue?: number | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
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

      venues: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          address: string | null
          city: string | null
          capacity: number | null
          contact_email: string | null
          contact_phone: string | null
          metadata: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          address?: string | null
          city?: string | null
          capacity?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          address?: string | null
          city?: string | null
          capacity?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      ticket_tiers: {
        Row: {
          id: string
          event_id: string
          name: string
          price: number
          capacity: number
          sort_order: number
          sales_start: string | null
          sales_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          price: number
          capacity: number
          sort_order?: number
          sales_start?: string | null
          sales_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          price?: number
          capacity?: number
          sort_order?: number
          sales_start?: string | null
          sales_end?: string | null
          created_at?: string
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

      tickets: {
        Row: {
          id: string
          event_id: string
          ticket_tier_id: string
          user_id: string | null
          status: string
          price_paid: number
          currency: string
          stripe_payment_intent_id: string | null
          ticket_token: string
          qr_code: string | null
          checked_in_at: string | null
          attendee_name: string | null
          promo_code_id: string | null
          referred_by: string | null
          metadata: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          ticket_tier_id: string
          user_id?: string | null
          status?: string
          price_paid: number
          currency?: string
          stripe_payment_intent_id?: string | null
          ticket_token: string
          qr_code?: string | null
          checked_in_at?: string | null
          attendee_name?: string | null
          promo_code_id?: string | null
          referred_by?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          ticket_tier_id?: string
          user_id?: string | null
          status?: string
          price_paid?: number
          currency?: string
          stripe_payment_intent_id?: string | null
          ticket_token?: string
          qr_code?: string | null
          checked_in_at?: string | null
          attendee_name?: string | null
          promo_code_id?: string | null
          referred_by?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
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

      artists: {
        Row: {
          id: string
          name: string
          slug: string
          bio: string | null
          genre: string[] | null
          instagram: string | null
          soundcloud: string | null
          spotify: string | null
          booking_email: string | null
          default_fee: number | null
          metadata: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          bio?: string | null
          genre?: string[] | null
          instagram?: string | null
          soundcloud?: string | null
          spotify?: string | null
          booking_email?: string | null
          default_fee?: number | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          bio?: string | null
          genre?: string[] | null
          instagram?: string | null
          soundcloud?: string | null
          spotify?: string | null
          booking_email?: string | null
          default_fee?: number | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      event_artists: {
        Row: {
          id: string
          event_id: string
          artist_id: string
          fee: number | null
          set_time: string | null
          set_duration: number | null
          status: string
          booked_by: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          artist_id: string
          fee?: number | null
          set_time?: string | null
          set_duration?: number | null
          status?: string
          booked_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          artist_id?: string
          fee?: number | null
          set_time?: string | null
          set_duration?: number | null
          status?: string
          booked_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
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
            foreignKeyName: "event_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }

      channels: {
        Row: {
          id: string
          collective_id: string
          partner_collective_id: string | null
          event_id: string | null
          name: string
          type: string
          metadata: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          collective_id: string
          partner_collective_id?: string | null
          event_id?: string | null
          name: string
          type?: string
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          collective_id?: string
          partner_collective_id?: string | null
          event_id?: string | null
          name?: string
          type?: string
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }

      messages: {
        Row: {
          id: string
          channel_id: string
          user_id: string
          content: string
          type: string
          voice_url: string | null
          voice_duration: number | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          user_id: string
          content: string
          type?: string
          voice_url?: string | null
          voice_duration?: number | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          user_id?: string
          content?: string
          type?: string
          voice_url?: string | null
          voice_duration?: number | null
          metadata?: Record<string, unknown> | null
          created_at?: string
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

      event_cards: {
        Row: {
          id: string
          event_id: string
          channel_id: string
          lineup: Record<string, unknown>[] | null
          venue_deal: Record<string, unknown> | null
          ticket_pricing: Record<string, unknown>[] | null
          action_items: Record<string, unknown>[] | null
          financials: Record<string, unknown> | null
          last_updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          channel_id: string
          lineup?: Record<string, unknown>[] | null
          venue_deal?: Record<string, unknown> | null
          ticket_pricing?: Record<string, unknown>[] | null
          action_items?: Record<string, unknown>[] | null
          financials?: Record<string, unknown> | null
          last_updated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          channel_id?: string
          lineup?: Record<string, unknown>[] | null
          venue_deal?: Record<string, unknown> | null
          ticket_pricing?: Record<string, unknown>[] | null
          action_items?: Record<string, unknown>[] | null
          financials?: Record<string, unknown> | null
          last_updated_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cards_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }

      event_tasks: {
        Row: {
          id: string
          event_id: string
          title: string
          description: string | null
          category: string | null
          status: string
          priority: string
          assigned_to: string | null
          due_date: string | null
          sort_order: number
          created_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          title: string
          description?: string | null
          category?: string | null
          status?: string
          priority?: string
          assigned_to?: string | null
          due_date?: string | null
          sort_order?: number
          created_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          title?: string
          description?: string | null
          category?: string | null
          status?: string
          priority?: string
          assigned_to?: string | null
          due_date?: string | null
          sort_order?: number
          created_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }

      event_activity: {
        Row: {
          id: string
          event_id: string
          user_id: string | null
          type: string
          content: string | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id?: string | null
          type: string
          content?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string | null
          type?: string
          content?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
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
            foreignKeyName: "event_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }

      playbook_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          event_type: string | null
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          event_type?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          event_type?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      playbook_task_templates: {
        Row: {
          id: string
          playbook_id: string
          title: string
          description: string | null
          category: string | null
          days_before_event: number
          default_role: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          playbook_id: string
          title: string
          description?: string | null
          category?: string | null
          days_before_event: number
          default_role?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          playbook_id?: string
          title?: string
          description?: string | null
          category?: string | null
          days_before_event?: number
          default_role?: string | null
          sort_order?: number
          created_at?: string
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

      recordings: {
        Row: {
          id: string
          user_id: string
          collective_id: string | null
          duration_seconds: number | null
          status: string
          audio_url: string | null
          transcript: string | null
          summary: string | null
          action_items: string[] | null
          key_decisions: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          collective_id?: string | null
          duration_seconds?: number | null
          status?: string
          audio_url?: string | null
          transcript?: string | null
          summary?: string | null
          action_items?: string[] | null
          key_decisions?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          collective_id?: string | null
          duration_seconds?: number | null
          status?: string
          audio_url?: string | null
          transcript?: string | null
          summary?: string | null
          action_items?: string[] | null
          key_decisions?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }

      saved_venues: {
        Row: {
          id: string
          user_id: string
          place_id: string
          name: string
          address: string | null
          city: string | null
          neighbourhood: string | null
          venue_type: string | null
          rating: number | null
          review_count: number | null
          phone: string | null
          website: string | null
          capacity: number | null
          photo_url: string | null
          hours: Record<string, unknown>[] | null
          latitude: number | null
          longitude: number | null
          venue_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          place_id: string
          name: string
          address?: string | null
          city?: string | null
          neighbourhood?: string | null
          venue_type?: string | null
          rating?: number | null
          review_count?: number | null
          phone?: string | null
          website?: string | null
          capacity?: number | null
          photo_url?: string | null
          hours?: Record<string, unknown>[] | null
          latitude?: number | null
          longitude?: number | null
          venue_notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          place_id?: string
          name?: string
          address?: string | null
          city?: string | null
          neighbourhood?: string | null
          venue_type?: string | null
          rating?: number | null
          review_count?: number | null
          phone?: string | null
          website?: string | null
          capacity?: number | null
          photo_url?: string | null
          hours?: Record<string, unknown>[] | null
          latitude?: number | null
          longitude?: number | null
          venue_notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_venues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }

      invitations: {
        Row: {
          id: string
          collective_id: string
          email: string
          role: string
          type: string | null
          status: string
          token: string | null
          invited_by: string | null
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          collective_id: string
          email: string
          role?: string
          type?: string | null
          status?: string
          token?: string | null
          invited_by?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          collective_id?: string
          email?: string
          role?: string
          type?: string | null
          status?: string
          token?: string | null
          invited_by?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
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

      settlements: {
        Row: {
          id: string
          event_id: string
          collective_id: string
          status: string
          gross_revenue: number
          stripe_fees: number
          platform_fee: number
          net_revenue: number
          total_expenses: number
          total_artist_fees: number
          profit: number
          approved_by: string | null
          approved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          collective_id: string
          status?: string
          gross_revenue?: number
          stripe_fees?: number
          platform_fee?: number
          net_revenue?: number
          total_expenses?: number
          total_artist_fees?: number
          profit?: number
          approved_by?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          collective_id?: string
          status?: string
          gross_revenue?: number
          stripe_fees?: number
          platform_fee?: number
          net_revenue?: number
          total_expenses?: number
          total_artist_fees?: number
          profit?: number
          approved_by?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }

      expenses: {
        Row: {
          id: string
          event_id: string
          collective_id: string | null
          category: string
          description: string
          amount: number
          added_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          collective_id?: string | null
          category: string
          description: string
          amount: number
          added_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          collective_id?: string | null
          category?: string
          description?: string
          amount?: number
          added_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }

      event_expenses: {
        Row: {
          id: string
          event_id: string
          collective_id: string | null
          category: string
          description: string
          amount: number
          added_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          collective_id?: string | null
          category: string
          description: string
          amount: number
          added_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          collective_id?: string | null
          category?: string
          description?: string
          amount?: number
          added_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }

      waitlist_entries: {
        Row: {
          id: string
          event_id: string
          ticket_tier_id: string
          email: string
          status: string
          notified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          ticket_tier_id: string
          email: string
          status?: string
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          ticket_tier_id?: string
          email?: string
          status?: string
          notified_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }

      ticket_waitlist: {
        Row: {
          id: string
          event_id: string
          ticket_tier_id: string
          email: string
          status: string
          notified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          ticket_tier_id: string
          email: string
          status?: string
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          ticket_tier_id?: string
          email?: string
          status?: string
          notified_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_waitlist_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }

      promo_codes: {
        Row: {
          id: string
          event_id: string
          code: string
          discount_type: string
          discount_value: number
          max_uses: number | null
          current_uses: number
          promoter_id: string | null
          expires_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          code: string
          discount_type: string
          discount_value: number
          max_uses?: number | null
          current_uses?: number
          promoter_id?: string | null
          expires_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          code?: string
          discount_type?: string
          discount_value?: number
          max_uses?: number | null
          current_uses?: number
          promoter_id?: string | null
          expires_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
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

      audit_logs: {
        Row: {
          id: string
          table_name: string | null
          record_id: string | null
          event_id: string | null
          action: string
          old_data: Record<string, unknown> | null
          new_data: Record<string, unknown> | null
          metadata: Record<string, unknown> | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          table_name?: string | null
          record_id?: string | null
          event_id?: string | null
          action: string
          old_data?: Record<string, unknown> | null
          new_data?: Record<string, unknown> | null
          metadata?: Record<string, unknown> | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          table_name?: string | null
          record_id?: string | null
          event_id?: string | null
          action?: string
          old_data?: Record<string, unknown> | null
          new_data?: Record<string, unknown> | null
          metadata?: Record<string, unknown> | null
          user_id?: string | null
          created_at?: string
        }
        Relationships: []
      }

      settlement_lines: {
        Row: {
          id: string
          settlement_id: string
          type: string
          label: string
          amount: number
          recipient_type: string | null
          recipient_id: string | null
          payout_status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          settlement_id: string
          type: string
          label: string
          amount: number
          recipient_type?: string | null
          recipient_id?: string | null
          payout_status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          settlement_id?: string
          type?: string
          label?: string
          amount?: number
          recipient_type?: string | null
          recipient_id?: string | null
          payout_status?: string | null
          created_at?: string
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

      attendee_profiles: {
        Row: {
          id: string
          user_id: string | null
          email: string | null
          total_events: number
          total_spend: number
          first_event_at: string | null
          last_event_at: string | null
          vip_status: boolean
          tags: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          email?: string | null
          total_events?: number
          total_spend?: number
          first_event_at?: string | null
          last_event_at?: string | null
          vip_status?: boolean
          tags?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          email?: string | null
          total_events?: number
          total_spend?: number
          first_event_at?: string | null
          last_event_at?: string | null
          vip_status?: boolean
          tags?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      guest_list: {
        Row: {
          id: string
          event_id: string
          name: string
          email: string | null
          phone: string | null
          plus_ones: number
          status: string
          notes: string | null
          added_by: string | null
          checked_in_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          email?: string | null
          phone?: string | null
          plus_ones?: number
          status?: string
          notes?: string | null
          added_by?: string | null
          checked_in_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          plus_ones?: number
          status?: string
          notes?: string | null
          added_by?: string | null
          checked_in_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_list_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }

      event_reactions: {
        Row: {
          id: string
          event_id: string
          emoji: string
          fingerprint: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          emoji: string
          fingerprint: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          emoji?: string
          fingerprint?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }

      external_events: {
        Row: {
          id: string
          promoter_id: string
          title: string
          external_url: string
          platform: string | null
          event_date: string | null
          venue_name: string | null
          flyer_url: string | null
          metadata: Record<string, unknown> | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          promoter_id: string
          title: string
          external_url: string
          platform?: string | null
          event_date?: string | null
          venue_name?: string | null
          flyer_url?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          promoter_id?: string
          title?: string
          external_url?: string
          platform?: string | null
          event_date?: string | null
          venue_name?: string | null
          flyer_url?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
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

      promo_links: {
        Row: {
          id: string
          promoter_id: string
          event_id: string | null
          external_event_id: string | null
          token: string
          click_count: number
          created_at: string
        }
        Insert: {
          id?: string
          promoter_id: string
          event_id?: string | null
          external_event_id?: string | null
          token: string
          click_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          promoter_id?: string
          event_id?: string | null
          external_event_id?: string | null
          token?: string
          click_count?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_links_promoter_id_fkey"
            columns: ["promoter_id"]
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
          {
            foreignKeyName: "promo_links_external_event_id_fkey"
            columns: ["external_event_id"]
            isOneToOne: false
            referencedRelation: "external_events"
            referencedColumns: ["id"]
          },
        ]
      }

      promo_clicks: {
        Row: {
          id: string
          promo_link_id: string
          clicked_at: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          promo_link_id: string
          clicked_at?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          promo_link_id?: string
          clicked_at?: string
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

      marketplace_profiles: {
        Row: {
          id: string
          user_id: string
          user_type: string
          display_name: string
          slug: string
          bio: string | null
          avatar_url: string | null
          cover_photo_url: string | null
          city: string | null
          instagram_handle: string | null
          website_url: string | null
          soundcloud_url: string | null
          spotify_url: string | null
          genres: string[] | null
          services: string[] | null
          rate_range: string | null
          availability: string | null
          portfolio_urls: string[] | null
          past_venues: string[] | null
          created_at: string
          updated_at: string
          is_verified: boolean
          is_active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          user_type: string
          display_name: string
          slug: string
          bio?: string | null
          avatar_url?: string | null
          cover_photo_url?: string | null
          city?: string | null
          instagram_handle?: string | null
          website_url?: string | null
          soundcloud_url?: string | null
          spotify_url?: string | null
          genres?: string[] | null
          services?: string[] | null
          rate_range?: string | null
          availability?: string | null
          portfolio_urls?: string[] | null
          past_venues?: string[] | null
          created_at?: string
          updated_at?: string
          is_verified?: boolean
          is_active?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          user_type?: string
          display_name?: string
          slug?: string
          bio?: string | null
          avatar_url?: string | null
          cover_photo_url?: string | null
          city?: string | null
          instagram_handle?: string | null
          website_url?: string | null
          soundcloud_url?: string | null
          spotify_url?: string | null
          genres?: string[] | null
          services?: string[] | null
          rate_range?: string | null
          availability?: string | null
          portfolio_urls?: string[] | null
          past_venues?: string[] | null
          created_at?: string
          updated_at?: string
          is_verified?: boolean
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }

      marketplace_inquiries: {
        Row: {
          id: string
          from_user_id: string
          to_profile_id: string
          event_id: string | null
          message: string | null
          inquiry_type: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          from_user_id: string
          to_profile_id: string
          event_id?: string | null
          message?: string | null
          inquiry_type?: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          from_user_id?: string
          to_profile_id?: string
          event_id?: string | null
          message?: string | null
          inquiry_type?: string
          status?: string
          created_at?: string
        }
        Relationships: [
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
          {
            foreignKeyName: "marketplace_inquiries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }

      marketplace_saved: {
        Row: {
          id: string
          user_id: string
          profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          profile_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          profile_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_saved_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_saved_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "marketplace_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }

    Views: Record<string, never>

    Functions: {
      increment_promo_click: {
        Args: { p_link_id: string }
        Returns: void
      }
      increment_promo_uses: {
        Args: { code_id: string }
        Returns: void
      }
      claim_promo_code: {
        Args: { p_code_id: string; p_quantity: number }
        Returns: void
      }
      acquire_ticket_lock: {
        Args: { p_tier_id: string }
        Returns: void
      }
    }

    Enums: Record<string, never>

    CompositeTypes: Record<string, never>
  }
}

// Helper types for convenience
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]

export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
