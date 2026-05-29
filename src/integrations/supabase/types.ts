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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cleaning_available_slots: {
        Row: {
          created_at: string
          current_bookings: number
          date: string
          end_time: string
          id: string
          max_bookings: number
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_bookings?: number
          date: string
          end_time: string
          id?: string
          max_bookings?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_bookings?: number
          date?: string
          end_time?: string
          id?: string
          max_bookings?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      cleaning_bookings: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          slot_id: string
          status: Database["public"]["Enums"]["cleaning_booking_status"]
          subscription_id: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          slot_id: string
          status?: Database["public"]["Enums"]["cleaning_booking_status"]
          subscription_id: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          slot_id?: string
          status?: Database["public"]["Enums"]["cleaning_booking_status"]
          subscription_id?: string
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "cleaning_available_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_bookings_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "cleaning_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_packages: {
        Row: {
          cleanings_per_month: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_per_cleaning_cents: number
          updated_at: string
        }
        Insert: {
          cleanings_per_month: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_per_cleaning_cents?: number
          updated_at?: string
        }
        Update: {
          cleanings_per_month?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_per_cleaning_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      cleaning_subscriptions: {
        Row: {
          cleanings_remaining: number
          billing_period_months: number | null
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          apartment_note: string | null
          monthly_price_cents: number | null
          package_id: string
          paid_until: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          recurring_day_of_week: number | null
          recurring_time: string | null
          service_end_date: string | null
          service_start_date: string | null
          start_date: string
          subscription_status: string | null
          total_price_cents: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cleanings_remaining: number
          billing_period_months?: number | null
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          apartment_note?: string | null
          monthly_price_cents?: number | null
          package_id: string
          paid_until?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          recurring_day_of_week?: number | null
          recurring_time?: string | null
          service_end_date?: string | null
          service_start_date?: string | null
          start_date: string
          subscription_status?: string | null
          total_price_cents?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cleanings_remaining?: number
          billing_period_months?: number | null
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          apartment_note?: string | null
          monthly_price_cents?: number | null
          package_id?: string
          paid_until?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          recurring_day_of_week?: number | null
          recurring_time?: string | null
          service_end_date?: string | null
          service_start_date?: string | null
          start_date?: string
          subscription_status?: string | null
          total_price_cents?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "cleaning_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_meal_choices: {
        Row: {
          choice: Database["public"]["Enums"]["meal_choice"] | null
          created_at: string | null
          customer_notes: string | null
          date: string
          delivery_address: Json | null
          id: string
          locked: boolean | null
          meal_type: Database["public"]["Enums"]["meal_type_slot"]
          status: Database["public"]["Enums"]["meal_status"] | null
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          choice?: Database["public"]["Enums"]["meal_choice"] | null
          created_at?: string | null
          customer_notes?: string | null
          date: string
          delivery_address?: Json | null
          id?: string
          locked?: boolean | null
          meal_type?: Database["public"]["Enums"]["meal_type_slot"]
          status?: Database["public"]["Enums"]["meal_status"] | null
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          choice?: Database["public"]["Enums"]["meal_choice"] | null
          created_at?: string | null
          customer_notes?: string | null
          date?: string
          delivery_address?: Json | null
          id?: string
          locked?: boolean | null
          meal_type?: Database["public"]["Enums"]["meal_type_slot"]
          status?: Database["public"]["Enums"]["meal_status"] | null
          subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_meal_choices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          plan_id: string | null
          restaurant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id?: string | null
          restaurant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string | null
          restaurant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      global_settings: {
        Row: {
          created_at: string | null
          daily_choice_cutoff_hours: number | null
          id: string
          max_subscription_weeks: number | null
          min_subscription_weeks: number | null
          platform_fee_percent: number | null
          platform_lightning_address: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_choice_cutoff_hours?: number | null
          id?: string
          max_subscription_weeks?: number | null
          min_subscription_weeks?: number | null
          platform_fee_percent?: number | null
          platform_lightning_address?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_choice_cutoff_hours?: number | null
          id?: string
          max_subscription_weeks?: number | null
          min_subscription_weeks?: number | null
          platform_fee_percent?: number | null
          platform_lightning_address?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lightning_auth_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          k1: string
          pubkey: string | null
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          k1: string
          pubkey?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          k1?: string
          pubkey?: string | null
          status?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          created_at: string | null
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          description: string | null
          id: string
          image_url: string | null
          meal_type: Database["public"]["Enums"]["meal_type_slot"]
          name: string
          restaurant_id: string
          tags: string[] | null
          updated_at: string | null
          weekly_menu_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          description?: string | null
          id?: string
          image_url?: string | null
          meal_type?: Database["public"]["Enums"]["meal_type_slot"]
          name: string
          restaurant_id: string
          tags?: string[] | null
          updated_at?: string | null
          weekly_menu_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          description?: string | null
          id?: string
          image_url?: string | null
          meal_type?: Database["public"]["Enums"]["meal_type_slot"]
          name?: string
          restaurant_id?: string
          tags?: string[] | null
          updated_at?: string | null
          weekly_menu_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_weekly_menu_id_fkey"
            columns: ["weekly_menu_id"]
            isOneToOne: false
            referencedRelation: "weekly_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price_sats: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price_sats: number
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price_sats?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          customer_notes: string | null
          delivery_address: Json | null
          driver_id: string | null
          id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["order_status"] | null
          total_sats: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          customer_notes?: string | null
          delivery_address?: Json | null
          driver_id?: string | null
          id?: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["order_status"] | null
          total_sats: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          customer_notes?: string | null
          delivery_address?: Json | null
          driver_id?: string | null
          id?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["order_status"] | null
          total_sats?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_sats: number
          created_at: string | null
          id: string
          payment_hash: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_type: Database["public"]["Enums"]["payment_type"]
          reference_id: string
          status: Database["public"]["Enums"]["payment_status"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_sats: number
          created_at?: string | null
          id?: string
          payment_hash?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_type: Database["public"]["Enums"]["payment_type"]
          reference_id: string
          status?: Database["public"]["Enums"]["payment_status"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_sats?: number
          created_at?: string | null
          id?: string
          payment_hash?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_type?: Database["public"]["Enums"]["payment_type"]
          reference_id?: string
          status?: Database["public"]["Enums"]["payment_status"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean | null
          name: string
          price_sats: number
          restaurant_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          name: string
          price_sats: number
          restaurant_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          name?: string
          price_sats?: number
          restaurant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_admins: {
        Row: {
          created_at: string | null
          id: string
          is_owner: boolean | null
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_owner?: boolean | null
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_owner?: boolean | null
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_admins_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          created_at: string | null
          id: string
          lightning_api_key: string | null
          lightning_identifier: string | null
          lightning_type:
            | Database["public"]["Enums"]["lightning_wallet_type"]
            | null
          restaurant_id: string
          test_mode: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          lightning_api_key?: string | null
          lightning_identifier?: string | null
          lightning_type?:
            | Database["public"]["Enums"]["lightning_wallet_type"]
            | null
          restaurant_id: string
          test_mode?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          lightning_api_key?: string | null
          lightning_identifier?: string | null
          lightning_type?:
            | Database["public"]["Enums"]["lightning_wallet_type"]
            | null
          restaurant_id?: string
          test_mode?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_wallets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          opening_hours: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          opening_hours?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          opening_hours?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          max_duration_weeks: number | null
          meal_time: string
          menu_category: Database["public"]["Enums"]["menu_category"] | null
          name: string
          price_per_week_sats: number
          restaurant_id: string
          supports_delivery: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_duration_weeks?: number | null
          meal_time?: string
          menu_category?: Database["public"]["Enums"]["menu_category"] | null
          name: string
          price_per_week_sats: number
          restaurant_id: string
          supports_delivery?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_duration_weeks?: number | null
          meal_time?: string
          menu_category?: Database["public"]["Enums"]["menu_category"] | null
          name?: string
          price_per_week_sats?: number
          restaurant_id?: string
          supports_delivery?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          duration_weeks: number
          end_date: string
          id: string
          is_active: boolean | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          plan_id: string
          restaurant_id: string
          start_date: string
          total_price_sats: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_weeks: number
          end_date: string
          id?: string
          is_active?: boolean | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          plan_id: string
          restaurant_id: string
          start_date: string
          total_price_sats: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_weeks?: number
          end_date?: string
          id?: string
          is_active?: boolean | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          plan_id?: string
          restaurant_id?: string
          start_date?: string
          total_price_sats?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          default_delivery_address: Json | null
          default_meal_type: Database["public"]["Enums"]["meal_type"] | null
          food_preferences: string[] | null
          id: string
          phone_number: string | null
          telegram_username: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          default_delivery_address?: Json | null
          default_meal_type?: Database["public"]["Enums"]["meal_type"] | null
          food_preferences?: string[] | null
          id?: string
          phone_number?: string | null
          telegram_username?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          default_delivery_address?: Json | null
          default_meal_type?: Database["public"]["Enums"]["meal_type"] | null
          food_preferences?: string[] | null
          id?: string
          phone_number?: string | null
          telegram_username?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_provider: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_login_at: string | null
          lightning_pubkey: string | null
          name: string | null
          nwc_connection_string: string | null
          password_hash: string | null
          restaurant_id: string | null
        }
        Insert: {
          auth_provider?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_login_at?: string | null
          lightning_pubkey?: string | null
          name?: string | null
          nwc_connection_string?: string | null
          password_hash?: string | null
          restaurant_id?: string | null
        }
        Update: {
          auth_provider?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_login_at?: string | null
          lightning_pubkey?: string | null
          name?: string | null
          nwc_connection_string?: string | null
          password_hash?: string | null
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_menus: {
        Row: {
          category: Database["public"]["Enums"]["menu_category"]
          created_at: string | null
          id: string
          plan_id: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["menu_status"] | null
          updated_at: string | null
          week_end_date: string
          week_start_date: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["menu_category"]
          created_at?: string | null
          id?: string
          plan_id?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["menu_status"] | null
          updated_at?: string | null
          week_end_date: string
          week_start_date: string
        }
        Update: {
          category?: Database["public"]["Enums"]["menu_category"]
          created_at?: string | null
          id?: string
          plan_id?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["menu_status"] | null
          updated_at?: string | null
          week_end_date?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_menus_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_cleaning_slot: {
        Args: { p_notes?: string; p_slot_id: string; p_subscription_id: string }
        Returns: string
      }
      cancel_cleaning_booking: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      schedule_cleaning_subscription: {
        Args: {
          p_day_of_week: number
          p_notes: string
          p_start_time: string
          p_subscription_id: string
        }
        Returns: Json
      }
      check_user_admin_status: { Args: { p_pubkey: string }; Returns: boolean }
      claim_order_for_delivery: {
        Args: { p_order_id: string; p_pubkey: string }
        Returns: boolean
      }
      create_menu_item_by_pubkey:
        | {
            Args: {
              p_day_of_week: Database["public"]["Enums"]["day_of_week"]
              p_description?: string
              p_image_url?: string
              p_meal_type: Database["public"]["Enums"]["meal_type_slot"]
              p_name: string
              p_pubkey: string
              p_tags?: string[]
              p_weekly_menu_id: string
            }
            Returns: {
              day_of_week: Database["public"]["Enums"]["day_of_week"]
              description: string
              id: string
              image_url: string
              meal_type: Database["public"]["Enums"]["meal_type_slot"]
              name: string
              restaurant_id: string
              tags: string[]
              weekly_menu_id: string
            }[]
          }
        | {
            Args: {
              p_day_of_week: Database["public"]["Enums"]["day_of_week"]
              p_description?: string
              p_image_url?: string
              p_meal_type: Database["public"]["Enums"]["meal_type_slot"]
              p_name: string
              p_pubkey: string
              p_restaurant_id: string
              p_tags?: string[]
              p_weekly_menu_id: string
            }
            Returns: {
              day_of_week: Database["public"]["Enums"]["day_of_week"]
              description: string
              id: string
              image_url: string
              meal_type: Database["public"]["Enums"]["meal_type_slot"]
              name: string
              restaurant_id: string
              tags: string[]
              weekly_menu_id: string
            }[]
          }
      create_order_by_pubkey: {
        Args: {
          p_customer_notes?: string
          p_delivery_address?: Json
          p_items: Json
          p_payment_hash?: string
          p_pubkey: string
          p_restaurant_id: string
          p_total_sats: number
        }
        Returns: {
          created_at: string
          id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["order_status"]
          total_sats: number
          user_id: string
        }[]
      }
      create_product_by_pubkey: {
        Args: {
          p_category?: string
          p_description?: string
          p_image_url?: string
          p_is_available?: boolean
          p_name: string
          p_price_sats: number
          p_pubkey: string
        }
        Returns: {
          category: string
          description: string
          id: string
          image_url: string
          is_available: boolean
          name: string
          price_sats: number
          restaurant_id: string
        }[]
      }
      create_restaurant_for_user: {
        Args: {
          p_address?: string
          p_description?: string
          p_name: string
          p_pubkey: string
        }
        Returns: string
      }
      create_subscription_by_pubkey:
        | {
            Args: {
              p_duration_weeks: number
              p_end_date: string
              p_payment_reference: string
              p_plan_id: string
              p_pubkey: string
              p_restaurant_id: string
              p_start_date: string
              p_total_price_sats: number
            }
            Returns: {
              duration_weeks: number
              end_date: string
              id: string
              is_active: boolean
              payment_reference: string
              payment_status: Database["public"]["Enums"]["payment_status"]
              plan_id: string
              restaurant_id: string
              start_date: string
              total_price_sats: number
              user_id: string
            }[]
          }
        | {
            Args: {
              p_duration_weeks: number
              p_end_date: string
              p_payment_reference: string
              p_payment_status?: string
              p_plan_id: string
              p_pubkey: string
              p_restaurant_id: string
              p_start_date: string
              p_total_price_sats: number
            }
            Returns: {
              duration_weeks: number
              end_date: string
              id: string
              is_active: boolean
              payment_reference: string
              payment_status: Database["public"]["Enums"]["payment_status"]
              plan_id: string
              restaurant_id: string
              start_date: string
              total_price_sats: number
              user_id: string
            }[]
          }
      create_subscription_plan_by_pubkey:
        | {
            Args: {
              p_description?: string
              p_is_active?: boolean
              p_max_duration_weeks?: number
              p_meal_time?: string
              p_menu_category?: Database["public"]["Enums"]["menu_category"]
              p_name: string
              p_price_per_week_sats: number
              p_pubkey: string
              p_supports_delivery?: boolean
            }
            Returns: {
              description: string
              id: string
              is_active: boolean
              max_duration_weeks: number
              meal_time: string
              menu_category: Database["public"]["Enums"]["menu_category"]
              name: string
              price_per_week_sats: number
              restaurant_id: string
              supports_delivery: boolean
            }[]
          }
        | {
            Args: {
              p_description?: string
              p_is_active?: boolean
              p_max_duration_weeks?: number
              p_meal_time?: string
              p_menu_category?: Database["public"]["Enums"]["menu_category"]
              p_name: string
              p_price_per_week_sats: number
              p_pubkey: string
              p_restaurant_id?: string
              p_supports_delivery?: boolean
            }
            Returns: {
              description: string
              id: string
              is_active: boolean
              max_duration_weeks: number
              meal_time: string
              menu_category: Database["public"]["Enums"]["menu_category"]
              name: string
              price_per_week_sats: number
              restaurant_id: string
              supports_delivery: boolean
            }[]
          }
      create_weekly_menu_by_pubkey:
        | {
            Args: {
              p_category?: Database["public"]["Enums"]["menu_category"]
              p_pubkey: string
              p_restaurant_id: string
              p_week_end_date: string
              p_week_start_date: string
            }
            Returns: {
              category: Database["public"]["Enums"]["menu_category"]
              created_at: string | null
              id: string
              plan_id: string | null
              restaurant_id: string
              status: Database["public"]["Enums"]["menu_status"] | null
              updated_at: string | null
              week_end_date: string
              week_start_date: string
            }[]
            SetofOptions: {
              from: "*"
              to: "weekly_menus"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: {
              p_category?: Database["public"]["Enums"]["menu_category"]
              p_pubkey: string
              p_week_end_date: string
              p_week_start_date: string
            }
            Returns: {
              category: Database["public"]["Enums"]["menu_category"]
              id: string
              restaurant_id: string
              status: Database["public"]["Enums"]["menu_status"]
              week_end_date: string
              week_start_date: string
            }[]
          }
      delete_menu_item_by_pubkey: {
        Args: { p_item_id: string; p_pubkey: string }
        Returns: boolean
      }
      delete_product_by_pubkey: {
        Args: { p_product_id: string; p_pubkey: string }
        Returns: boolean
      }
      delete_subscription_plan_by_pubkey: {
        Args: { p_plan_id: string; p_pubkey: string }
        Returns: boolean
      }
      generate_meal_choices_for_subscription: {
        Args: { p_subscription_id: string }
        Returns: undefined
      }
      get_available_orders_for_driver: {
        Args: never
        Returns: {
          created_at: string
          customer_notes: string
          delivery_address: Json
          id: string
          items: Json
          restaurant_address: string
          restaurant_id: string
          restaurant_name: string
          status: Database["public"]["Enums"]["order_status"]
          total_sats: number
        }[]
      }
      get_current_user_data: {
        Args: never
        Returns: {
          auth_provider: string
          avatar_url: string
          display_name: string
          email: string
          id: string
          lightning_pubkey: string
          name: string
          restaurant_id: string
        }[]
      }
      get_current_user_id: { Args: never; Returns: string }
      get_daily_meal_choices_by_pubkey: {
        Args: { p_pubkey: string; p_subscription_id: string }
        Returns: {
          choice: Database["public"]["Enums"]["meal_choice"] | null
          created_at: string | null
          customer_notes: string | null
          date: string
          delivery_address: Json | null
          id: string
          locked: boolean | null
          meal_type: Database["public"]["Enums"]["meal_type_slot"]
          status: Database["public"]["Enums"]["meal_status"] | null
          subscription_id: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_meal_choices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_driver_delivery_history: {
        Args: { p_pubkey: string }
        Returns: {
          created_at: string
          customer_name: string
          id: string
          restaurant_name: string
          status: Database["public"]["Enums"]["order_status"]
          total_sats: number
          updated_at: string
        }[]
      }
      get_driver_orders_by_pubkey: {
        Args: { p_pubkey: string }
        Returns: {
          created_at: string
          customer_name: string
          customer_notes: string
          delivery_address: Json
          id: string
          items: Json
          restaurant_address: string
          restaurant_id: string
          restaurant_name: string
          status: Database["public"]["Enums"]["order_status"]
          total_sats: number
          updated_at: string
          user_id: string
        }[]
      }
      get_products_by_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: {
          category: string
          description: string
          id: string
          image_url: string
          is_available: boolean
          name: string
          price_sats: number
          restaurant_id: string
        }[]
      }
      get_restaurant_orders_by_pubkey: {
        Args: { p_pubkey: string }
        Returns: {
          created_at: string
          customer_notes: string
          delivery_address: Json
          id: string
          items: Json
          status: Database["public"]["Enums"]["order_status"]
          total_sats: number
          user_id: string
          user_name: string
        }[]
      }
      get_restaurant_settings: {
        Args: { p_pubkey: string }
        Returns: {
          created_at: string
          id: string
          lightning_api_key: string
          lightning_identifier: string
          lightning_type: Database["public"]["Enums"]["lightning_wallet_type"]
          restaurant_id: string
          test_mode: boolean
          updated_at: string
        }[]
      }
      get_subscription_detail_by_pubkey: {
        Args: { p_pubkey: string; p_subscription_id: string }
        Returns: {
          created_at: string
          duration_weeks: number
          end_date: string
          id: string
          is_active: boolean
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          plan_id: string
          plan_meal_time: string
          plan_name: string
          plan_supports_delivery: boolean
          restaurant_address: string
          restaurant_id: string
          restaurant_logo_url: string
          restaurant_name: string
          start_date: string
          total_price_sats: number
          updated_at: string
          user_id: string
        }[]
      }
      get_subscription_plans_by_pubkey: {
        Args: { p_pubkey: string }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          max_duration_weeks: number
          meal_time: string
          menu_category: Database["public"]["Enums"]["menu_category"]
          name: string
          price_per_week_sats: number
          restaurant_id: string
          supports_delivery: boolean
          updated_at: string
        }[]
      }
      get_subscription_plans_by_restaurant: {
        Args: { p_pubkey: string; p_restaurant_id: string }
        Returns: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          max_duration_weeks: number | null
          meal_time: string
          menu_category: Database["public"]["Enums"]["menu_category"] | null
          name: string
          price_per_week_sats: number
          restaurant_id: string
          supports_delivery: boolean | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "subscription_plans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_login_history: {
        Args: { p_pubkey: string }
        Returns: {
          id: string
          ip_address: string
          logged_in_at: string
          user_agent: string
          user_id: string
        }[]
      }
      get_user_nwc_connection: { Args: { p_pubkey: string }; Returns: string }
      get_user_orders_by_pubkey: {
        Args: { p_pubkey: string }
        Returns: {
          created_at: string
          id: string
          items: Json
          restaurant_id: string
          restaurant_name: string
          status: Database["public"]["Enums"]["order_status"]
          total_sats: number
        }[]
      }
      get_user_profile: {
        Args: { p_pubkey: string }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          id: string
          last_login_at: string
          lightning_pubkey: string
        }[]
      }
      get_user_restaurant_id: { Args: { p_pubkey: string }; Returns: string }
      get_user_restaurants: {
        Args: { p_user_id: string }
        Returns: {
          address: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_owner: boolean
          logo_url: string
          name: string
        }[]
      }
      get_user_tournament_application: {
        Args: { p_pubkey: string }
        Returns: {
          amount_sats: number
          chess_com_account: string
          created_at: string
          current_rating: number
          email: string
          highest_rating: number
          id: string
          name: string
          payment_status: string
          telegram_username: string
        }[]
      }
      get_weekly_menus_by_pubkey: {
        Args: { p_pubkey: string; p_week_end: string; p_week_start: string }
        Returns: {
          category: Database["public"]["Enums"]["menu_category"]
          id: string
          menu_items: Json
          restaurant_id: string
          status: Database["public"]["Enums"]["menu_status"]
          week_end_date: string
          week_start_date: string
        }[]
      }
      get_weekly_menus_by_restaurant: {
        Args: {
          p_pubkey: string
          p_restaurant_id: string
          p_week_end: string
          p_week_start: string
        }
        Returns: {
          category: Database["public"]["Enums"]["menu_category"]
          created_at: string
          id: string
          menu_items: Json
          plan_id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["menu_status"]
          updated_at: string
          week_end_date: string
          week_start_date: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_restaurant_admin: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      link_user_to_restaurant: {
        Args: { p_pubkey: string; p_restaurant_id: string }
        Returns: undefined
      }
      lock_overdue_meal_choices: { Args: never; Returns: undefined }
      log_login: {
        Args: { p_ip_address?: string; p_pubkey: string; p_user_agent?: string }
        Returns: undefined
      }
      set_lightning_session: { Args: { p_pubkey: string }; Returns: undefined }
      submit_tournament_application: {
        Args: {
          p_amount_sats?: number
          p_chess_com_account: string
          p_current_rating: number
          p_email?: string
          p_highest_rating: number
          p_name: string
          p_payment_hash?: string
          p_pubkey: string
          p_telegram_username?: string
        }
        Returns: undefined
      }
      update_menu_item_by_pubkey: {
        Args: {
          p_description?: string
          p_image_url?: string
          p_item_id: string
          p_name: string
          p_pubkey: string
          p_tags?: string[]
        }
        Returns: boolean
      }
      update_menu_status_by_pubkey: {
        Args: {
          p_menu_id: string
          p_pubkey: string
          p_status: Database["public"]["Enums"]["menu_status"]
        }
        Returns: boolean
      }
      update_order_status_by_driver: {
        Args: {
          p_order_id: string
          p_pubkey: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: boolean
      }
      update_order_status_by_pubkey: {
        Args: {
          p_order_id: string
          p_pubkey: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: boolean
      }
      update_product_by_pubkey: {
        Args: {
          p_category?: string
          p_description?: string
          p_image_url?: string
          p_is_available?: boolean
          p_name: string
          p_price_sats: number
          p_product_id: string
          p_pubkey: string
        }
        Returns: boolean
      }
      update_subscription_plan_by_pubkey: {
        Args: {
          p_description?: string
          p_is_active?: boolean
          p_max_duration_weeks?: number
          p_meal_time?: string
          p_menu_category?: Database["public"]["Enums"]["menu_category"]
          p_name: string
          p_plan_id: string
          p_price_per_week_sats: number
          p_pubkey: string
          p_supports_delivery?: boolean
        }
        Returns: boolean
      }
      update_user_nwc_connection: {
        Args: { p_nwc_connection: string; p_pubkey: string }
        Returns: undefined
      }
      update_user_profile: {
        Args: { p_avatar_url: string; p_display_name: string; p_pubkey: string }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          id: string
          last_login_at: string
          lightning_pubkey: string
        }[]
      }
      upsert_restaurant_settings: {
        Args: {
          p_lightning_api_key?: string
          p_lightning_identifier?: string
          p_lightning_type?: Database["public"]["Enums"]["lightning_wallet_type"]
          p_pubkey: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "restaurant_admin" | "user" | "driver"
      cleaning_booking_status: "booked" | "completed" | "cancelled"
      day_of_week:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
      lightning_wallet_type: "lnurl" | "invoice" | "lnbits" | "other"
      meal_choice: "eat_in" | "delivery" | "cancelled"
      meal_status:
        | "pending"
        | "prepared"
        | "delivered"
        | "completed"
        | "no_show"
      meal_type: "eat_in" | "delivery"
      meal_type_slot: "breakfast" | "lunch" | "dinner"
      menu_category:
        | "standard"
        | "vegetarian"
        | "vegan"
        | "keto"
        | "gluten_free"
        | "lactose_free"
      menu_status: "draft" | "published"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      payment_method: "lightning" | "fiat" | "crypto"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      payment_type: "subscription" | "order"
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
      app_role: ["super_admin", "restaurant_admin", "user", "driver"],
      cleaning_booking_status: ["booked", "completed", "cancelled"],
      day_of_week: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
      lightning_wallet_type: ["lnurl", "invoice", "lnbits", "other"],
      meal_choice: ["eat_in", "delivery", "cancelled"],
      meal_status: ["pending", "prepared", "delivered", "completed", "no_show"],
      meal_type: ["eat_in", "delivery"],
      meal_type_slot: ["breakfast", "lunch", "dinner"],
      menu_category: [
        "standard",
        "vegetarian",
        "vegan",
        "keto",
        "gluten_free",
        "lactose_free",
      ],
      menu_status: ["draft", "published"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      payment_method: ["lightning", "fiat", "crypto"],
      payment_status: ["pending", "paid", "failed", "refunded"],
      payment_type: ["subscription", "order"],
    },
  },
} as const
