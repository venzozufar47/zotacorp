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
      attendance_locations: {
        Row: {
          created_at: string
          id: string
          latitude: number
          longitude: number
          name: string
          radius_m: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          name: string
          radius_m: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          radius_m?: number
          updated_at?: string
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          bonus_day: boolean
          checked_in_at: string
          checked_out_at: string | null
          checkout_latitude: number | null
          checkout_longitude: number | null
          checkout_outside_note: string | null
          created_at: string
          date: string
          id: string
          is_early_arrival: boolean
          is_overtime: boolean
          late_checkout_reason: string | null
          late_minutes: number
          late_proof_admin_note: string | null
          late_proof_reason: string | null
          late_proof_status: string | null
          late_proof_url: string | null
          latitude: number | null
          longitude: number | null
          matched_location_id: string | null
          overtime_minutes: number
          overtime_status: string | null
          selfie_path: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_day?: boolean
          checked_in_at: string
          checked_out_at?: string | null
          checkout_latitude?: number | null
          checkout_longitude?: number | null
          checkout_outside_note?: string | null
          created_at?: string
          date: string
          id?: string
          is_early_arrival?: boolean
          is_overtime?: boolean
          late_checkout_reason?: string | null
          late_minutes?: number
          late_proof_admin_note?: string | null
          late_proof_reason?: string | null
          late_proof_status?: string | null
          late_proof_url?: string | null
          latitude?: number | null
          longitude?: number | null
          matched_location_id?: string | null
          overtime_minutes?: number
          overtime_status?: string | null
          selfie_path?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_day?: boolean
          checked_in_at?: string
          checked_out_at?: string | null
          checkout_latitude?: number | null
          checkout_longitude?: number | null
          checkout_outside_note?: string | null
          created_at?: string
          date?: string
          id?: string
          is_early_arrival?: boolean
          is_overtime?: boolean
          late_checkout_reason?: string | null
          late_minutes?: number
          late_proof_admin_note?: string | null
          late_proof_reason?: string | null
          late_proof_status?: string | null
          late_proof_url?: string | null
          latitude?: number | null
          longitude?: number | null
          matched_location_id?: string | null
          overtime_minutes?: number
          overtime_status?: string | null
          selfie_path?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_matched_location_id_fkey"
            columns: ["matched_location_id"]
            isOneToOne: false
            referencedRelation: "attendance_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_settings: {
        Row: {
          created_at: string
          grace_period_min: number
          id: string
          timezone: string
          ui_theme: string
          updated_at: string
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          created_at?: string
          grace_period_min?: number
          id?: string
          timezone?: string
          ui_theme?: string
          updated_at?: string
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          created_at?: string
          grace_period_min?: number
          id?: string
          timezone?: string
          ui_theme?: string
          updated_at?: string
          work_end_time?: string
          work_start_time?: string
        }
        Relationships: []
      }
      backup_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          manifest: Json | null
          status: string
          storage_prefix: string
          trigger: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          manifest?: Json | null
          status?: string
          storage_prefix: string
          trigger: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          manifest?: Json | null
          status?: string
          storage_prefix?: string
          trigger?: string
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          cadence: string
          enabled: boolean
          id: number
          retention_days: number
          updated_at: string
        }
        Insert: {
          cadence?: string
          enabled?: boolean
          id?: number
          retention_days?: number
          updated_at?: string
        }
        Update: {
          cadence?: string
          enabled?: boolean
          id?: number
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      bank_account_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          bank_account_id: string
          scope: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          bank_account_id: string
          scope?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          bank_account_id?: string
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_account_assignees_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_account_assignees_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_account_assignees_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_account_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_account_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string | null
          bank: string
          business_unit: string
          created_at: string
          created_by: string | null
          custom_categories: Json | null
          default_branch: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          opname_authorizer_id: string | null
          pdf_password: string | null
          pos_enabled: boolean
          production_authorizer_id: string | null
          source_sheet: string | null
          source_url: string | null
          updated_at: string
          withdrawal_authorizer_id: string | null
        }
        Insert: {
          account_name: string
          account_number?: string | null
          bank: string
          business_unit: string
          created_at?: string
          created_by?: string | null
          custom_categories?: Json | null
          default_branch?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          opname_authorizer_id?: string | null
          pdf_password?: string | null
          pos_enabled?: boolean
          production_authorizer_id?: string | null
          source_sheet?: string | null
          source_url?: string | null
          updated_at?: string
          withdrawal_authorizer_id?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string | null
          bank?: string
          business_unit?: string
          created_at?: string
          created_by?: string | null
          custom_categories?: Json | null
          default_branch?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          opname_authorizer_id?: string | null
          pdf_password?: string | null
          pos_enabled?: boolean
          production_authorizer_id?: string | null
          source_sheet?: string | null
          source_url?: string | null
          updated_at?: string
          withdrawal_authorizer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_opname_authorizer_id_fkey"
            columns: ["opname_authorizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_opname_authorizer_id_fkey"
            columns: ["opname_authorizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_production_authorizer_id_fkey"
            columns: ["production_authorizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_production_authorizer_id_fkey"
            columns: ["production_authorizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_withdrawal_authorizer_id_fkey"
            columns: ["withdrawal_authorizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_withdrawal_authorizer_id_fkey"
            columns: ["withdrawal_authorizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bu_metric_comments: {
        Row: {
          author_id: string
          author_role: string
          body: string
          business_unit: string
          created_at: string
          id: string
          metric_id: string
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          business_unit: string
          created_at?: string
          id?: string
          metric_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          business_unit?: string
          created_at?: string
          id?: string
          metric_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bu_metric_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bu_metric_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bu_monthly_metrics: {
        Row: {
          business_unit: string
          created_at: string
          id: string
          notes: string | null
          orders_count: number | null
          period_month: number
          period_year: number
          production_capacity_max: number | null
          unique_customers: number | null
          updated_at: string
          updated_by: string | null
          utilization_pct: number | null
        }
        Insert: {
          business_unit: string
          created_at?: string
          id?: string
          notes?: string | null
          orders_count?: number | null
          period_month: number
          period_year: number
          production_capacity_max?: number | null
          unique_customers?: number | null
          updated_at?: string
          updated_by?: string | null
          utilization_pct?: number | null
        }
        Update: {
          business_unit?: string
          created_at?: string
          id?: string
          notes?: string | null
          orders_count?: number | null
          period_month?: number
          period_year?: number
          production_capacity_max?: number | null
          unique_customers?: number | null
          updated_at?: string
          updated_by?: string | null
          utilization_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bu_monthly_metrics_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bu_monthly_metrics_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      business_unit_roles: {
        Row: {
          business_unit_id: string
          created_at: string
          id: string
          role_name: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          id?: string
          role_name: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          id?: string
          role_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_unit_roles_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      business_units: {
        Row: {
          created_at: string
          default_needs_assignment_user_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_needs_assignment_user_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_needs_assignment_user_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_units_default_needs_assignment_user_id_fkey"
            columns: ["default_needs_assignment_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_units_default_needs_assignment_user_id_fkey"
            columns: ["default_needs_assignment_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cake_access_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          branch: string | null
          id: string
          production_role: string | null
          scope: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          branch?: string | null
          id?: string
          production_role?: string | null
          scope: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          branch?: string | null
          id?: string
          production_role?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cake_access_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_access_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_access_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_access_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cake_base_diameter_prices: {
        Row: {
          base_option_id: string
          diameter_id: string
          price_pare_idr: number | null
          price_semarang_idr: number | null
          updated_at: string
        }
        Insert: {
          base_option_id: string
          diameter_id: string
          price_pare_idr?: number | null
          price_semarang_idr?: number | null
          updated_at?: string
        }
        Update: {
          base_option_id?: string
          diameter_id?: string
          price_pare_idr?: number | null
          price_semarang_idr?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cake_base_diameter_prices_base_option_id_fkey"
            columns: ["base_option_id"]
            isOneToOne: false
            referencedRelation: "cake_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_base_diameter_prices_diameter_id_fkey"
            columns: ["diameter_id"]
            isOneToOne: false
            referencedRelation: "cake_diameter_options"
            referencedColumns: ["id"]
          },
        ]
      }
      cake_diameter_options: {
        Row: {
          created_at: string
          diameter_cm: number
          id: string
          is_active: boolean
          label: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          diameter_cm: number
          id?: string
          is_active?: boolean
          label?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          diameter_cm?: number
          id?: string
          is_active?: boolean
          label?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      cake_options: {
        Row: {
          base_price_idr: number | null
          created_at: string
          id: string
          is_active: boolean
          is_custom_freeform: boolean
          kind: string
          label: string
          needs_address: boolean
          sort_order: number
        }
        Insert: {
          base_price_idr?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_custom_freeform?: boolean
          kind: string
          label: string
          needs_address?: boolean
          sort_order?: number
        }
        Update: {
          base_price_idr?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_custom_freeform?: boolean
          kind?: string
          label?: string
          needs_address?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      cake_order_attachments: {
        Row: {
          cake_order_id: string
          created_at: string
          field: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          cake_order_id: string
          created_at?: string
          field: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          cake_order_id?: string
          created_at?: string
          field?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cake_order_attachments_cake_order_id_fkey"
            columns: ["cake_order_id"]
            isOneToOne: false
            referencedRelation: "cake_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_order_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_order_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cake_order_payments: {
        Row: {
          amount_idr: number
          attachment_id: string | null
          cake_order_id: string
          created_at: string
          created_by: string
          id: string
          kind: string
          label: string
          notes: string | null
          paid_at: string
          payment_option_id: string
        }
        Insert: {
          amount_idr: number
          attachment_id?: string | null
          cake_order_id: string
          created_at?: string
          created_by: string
          id?: string
          kind: string
          label: string
          notes?: string | null
          paid_at?: string
          payment_option_id: string
        }
        Update: {
          amount_idr?: number
          attachment_id?: string | null
          cake_order_id?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          label?: string
          notes?: string | null
          paid_at?: string
          payment_option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cake_order_payments_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "cake_order_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_order_payments_cake_order_id_fkey"
            columns: ["cake_order_id"]
            isOneToOne: false
            referencedRelation: "cake_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_order_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_order_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_order_payments_payment_option_id_fkey"
            columns: ["payment_option_id"]
            isOneToOne: false
            referencedRelation: "cake_options"
            referencedColumns: ["id"]
          },
        ]
      }
      cake_orders: {
        Row: {
          accessories_notes: string | null
          add_ons_breakdown: Json | null
          add_ons_idr: number
          archived_at: string | null
          base_cake_option_id: string
          base_price_idr: number
          branch: string
          color_notes: string | null
          created_at: string
          created_by: string
          customer_name: string
          customer_phone: string | null
          decorating_started_at: string | null
          decoration_notes: string | null
          delivery_address: string | null
          delivery_fee_idr: number
          delivery_option_id: string
          dimension_cm: number | null
          discount_idr: number
          discount_kind: string
          discount_value: number
          filling_option_id: string | null
          greeting_card: string | null
          id: string
          paid_at: string | null
          paid_idr: number
          payment_option_id: string | null
          payment_status: string
          production_done_at: string | null
          production_started_at: string | null
          production_status: string
          refund_idr: number
          refund_notes: string | null
          refunded_at: string | null
          scheduled_at: string
          shape_custom: string | null
          shape_option_id: string
          status: string
          texture_notes: string | null
          total_idr: number
          updated_at: string
        }
        Insert: {
          accessories_notes?: string | null
          add_ons_breakdown?: Json | null
          add_ons_idr?: number
          archived_at?: string | null
          base_cake_option_id: string
          base_price_idr: number
          branch?: string
          color_notes?: string | null
          created_at?: string
          created_by: string
          customer_name: string
          customer_phone?: string | null
          decorating_started_at?: string | null
          decoration_notes?: string | null
          delivery_address?: string | null
          delivery_fee_idr?: number
          delivery_option_id: string
          dimension_cm?: number | null
          discount_idr?: number
          discount_kind?: string
          discount_value?: number
          filling_option_id?: string | null
          greeting_card?: string | null
          id?: string
          paid_at?: string | null
          paid_idr?: number
          payment_option_id?: string | null
          payment_status?: string
          production_done_at?: string | null
          production_started_at?: string | null
          production_status?: string
          refund_idr?: number
          refund_notes?: string | null
          refunded_at?: string | null
          scheduled_at: string
          shape_custom?: string | null
          shape_option_id: string
          status?: string
          texture_notes?: string | null
          total_idr: number
          updated_at?: string
        }
        Update: {
          accessories_notes?: string | null
          add_ons_breakdown?: Json | null
          add_ons_idr?: number
          archived_at?: string | null
          base_cake_option_id?: string
          base_price_idr?: number
          branch?: string
          color_notes?: string | null
          created_at?: string
          created_by?: string
          customer_name?: string
          customer_phone?: string | null
          decorating_started_at?: string | null
          decoration_notes?: string | null
          delivery_address?: string | null
          delivery_fee_idr?: number
          delivery_option_id?: string
          dimension_cm?: number | null
          discount_idr?: number
          discount_kind?: string
          discount_value?: number
          filling_option_id?: string | null
          greeting_card?: string | null
          id?: string
          paid_at?: string | null
          paid_idr?: number
          payment_option_id?: string | null
          payment_status?: string
          production_done_at?: string | null
          production_started_at?: string | null
          production_status?: string
          refund_idr?: number
          refund_notes?: string | null
          refunded_at?: string | null
          scheduled_at?: string
          shape_custom?: string | null
          shape_option_id?: string
          status?: string
          texture_notes?: string | null
          total_idr?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cake_orders_base_cake_option_id_fkey"
            columns: ["base_cake_option_id"]
            isOneToOne: false
            referencedRelation: "cake_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_orders_delivery_option_id_fkey"
            columns: ["delivery_option_id"]
            isOneToOne: false
            referencedRelation: "cake_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_orders_filling_option_id_fkey"
            columns: ["filling_option_id"]
            isOneToOne: false
            referencedRelation: "cake_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_orders_payment_option_id_fkey"
            columns: ["payment_option_id"]
            isOneToOne: false
            referencedRelation: "cake_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_orders_shape_option_id_fkey"
            columns: ["shape_option_id"]
            isOneToOne: false
            referencedRelation: "cake_options"
            referencedColumns: ["id"]
          },
        ]
      }
      cake_production_slip_items: {
        Row: {
          cake_order_id: string
          override_notes: string | null
          slip_id: string
          sort_order: number
        }
        Insert: {
          cake_order_id: string
          override_notes?: string | null
          slip_id: string
          sort_order?: number
        }
        Update: {
          cake_order_id?: string
          override_notes?: string | null
          slip_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "cake_production_slip_items_cake_order_id_fkey"
            columns: ["cake_order_id"]
            isOneToOne: false
            referencedRelation: "cake_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_production_slip_items_slip_id_fkey"
            columns: ["slip_id"]
            isOneToOne: false
            referencedRelation: "cake_production_slips"
            referencedColumns: ["id"]
          },
        ]
      }
      cake_production_slips: {
        Row: {
          branch: string
          closed_at: string | null
          diff_acknowledged_at: string | null
          id: string
          last_sent_snapshot: Json | null
          notes: string | null
          pending_diff: Json | null
          prepared_at: string
          prepared_by: string | null
          received_at: string | null
          received_by: string | null
          sent_at: string | null
          sent_by: string | null
          sent_count: number
          status: string
          target_date: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          branch?: string
          closed_at?: string | null
          diff_acknowledged_at?: string | null
          id?: string
          last_sent_snapshot?: Json | null
          notes?: string | null
          pending_diff?: Json | null
          prepared_at?: string
          prepared_by?: string | null
          received_at?: string | null
          received_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_count?: number
          status?: string
          target_date: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          branch?: string
          closed_at?: string | null
          diff_acknowledged_at?: string | null
          id?: string
          last_sent_snapshot?: Json | null
          notes?: string | null
          pending_diff?: Json | null
          prepared_at?: string
          prepared_by?: string | null
          received_at?: string | null
          received_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_count?: number
          status?: string
          target_date?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cake_production_slips_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_production_slips_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_production_slips_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_production_slips_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_production_slips_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_production_slips_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_production_slips_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_production_slips_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_pusat_allocations: {
        Row: {
          business_unit: string
          category: string
          created_at: string
          id: string
          locked: boolean
          locked_pusat_total: number | null
          pare_amount: number
          period_month: number
          period_year: number
          semarang_amount: number
          side: string
          updated_at: string
        }
        Insert: {
          business_unit: string
          category: string
          created_at?: string
          id?: string
          locked?: boolean
          locked_pusat_total?: number | null
          pare_amount?: number
          period_month: number
          period_year: number
          semarang_amount?: number
          side: string
          updated_at?: string
        }
        Update: {
          business_unit?: string
          category?: string
          created_at?: string
          id?: string
          locked?: boolean
          locked_pusat_total?: number | null
          pare_amount?: number
          period_month?: number
          period_year?: number
          semarang_amount?: number
          side?: string
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_rules: {
        Row: {
          active: boolean
          bank_account_id: string
          case_sensitive: boolean
          column_scope: string
          created_at: string
          extra_conditions: Json
          id: string
          is_fallback: boolean
          match_type: string
          match_value: string
          priority: number
          set_branch: string | null
          set_category: string | null
          side_filter: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          bank_account_id: string
          case_sensitive?: boolean
          column_scope: string
          created_at?: string
          extra_conditions?: Json
          id?: string
          is_fallback?: boolean
          match_type: string
          match_value: string
          priority: number
          set_branch?: string | null
          set_category?: string | null
          side_filter?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          bank_account_id?: string
          case_sensitive?: boolean
          column_scope?: string
          created_at?: string
          extra_conditions?: Json
          id?: string
          is_fallback?: boolean
          match_type?: string
          match_value?: string
          priority?: number
          set_branch?: string | null
          set_category?: string | null
          side_filter?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_rules_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_statements: {
        Row: {
          bank_account_id: string
          closing_balance: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          opening_balance: number
          pdf_path: string | null
          period_month: number
          period_year: number
          status: string
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          opening_balance?: number
          pdf_path?: string | null
          period_month: number
          period_year: number
          status?: string
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          opening_balance?: number
          pdf_path?: string | null
          period_month?: number
          period_year?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_statements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_statements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_statements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_statements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_statements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_transactions: {
        Row: {
          assigned_to_user_id: string | null
          attachment_path: string | null
          branch: string | null
          category: string | null
          created_at: string
          credit: number
          custom_cake_included: boolean | null
          debit: number
          description: string
          effective_period_month: number | null
          effective_period_year: number | null
          id: string
          notes: string | null
          running_balance: number | null
          sort_order: number
          source_destination: string | null
          statement_id: string
          transaction_date: string
          transaction_details: string | null
          transaction_time: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          attachment_path?: string | null
          branch?: string | null
          category?: string | null
          created_at?: string
          credit?: number
          custom_cake_included?: boolean | null
          debit?: number
          description: string
          effective_period_month?: number | null
          effective_period_year?: number | null
          id?: string
          notes?: string | null
          running_balance?: number | null
          sort_order?: number
          source_destination?: string | null
          statement_id: string
          transaction_date: string
          transaction_details?: string | null
          transaction_time?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          attachment_path?: string | null
          branch?: string | null
          category?: string | null
          created_at?: string
          credit?: number
          custom_cake_included?: boolean | null
          debit?: number
          description?: string
          effective_period_month?: number | null
          effective_period_year?: number | null
          id?: string
          notes?: string | null
          running_balance?: number | null
          sort_order?: number
          source_destination?: string | null
          statement_id?: string
          transaction_date?: string
          transaction_details?: string | null
          transaction_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_transactions_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_transactions_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "cashflow_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      celebration_messages: {
        Row: {
          author_id: string
          body: string
          celebrant_id: string
          created_at: string
          event_type: string
          event_year: number
          id: string
          kind: string
          parent_id: string | null
        }
        Insert: {
          author_id: string
          body: string
          celebrant_id: string
          created_at?: string
          event_type: string
          event_year: number
          id?: string
          kind: string
          parent_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          celebrant_id?: string
          created_at?: string
          event_type?: string
          event_year?: number
          id?: string
          kind?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "celebration_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_messages_celebrant_id_fkey"
            columns: ["celebrant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_messages_celebrant_id_fkey"
            columns: ["celebrant_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "celebration_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_branch_map: {
        Row: {
          branch: string
          business_unit: string
          created_at: string
          created_by: string | null
          id: string
          name_keyword: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          branch: string
          business_unit: string
          created_at?: string
          created_by?: string | null
          id?: string
          name_keyword: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string
          business_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name_keyword?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_branch_map_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_branch_map_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_locations: {
        Row: {
          created_at: string
          employee_id: string
          location_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          location_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_locations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_locations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "attendance_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_work_kind_assignments: {
        Row: {
          created_at: string
          kind_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          kind_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          kind_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_work_kind_assignments_kind_id_fkey"
            columns: ["kind_id"]
            isOneToOne: false
            referencedRelation: "extra_work_kinds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_work_kind_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_work_kind_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_work_kinds: {
        Row: {
          active: boolean
          created_at: string
          daily_multiplier: number
          fixed_rate_idr: number
          formula_kind: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_multiplier?: number
          fixed_rate_idr?: number
          formula_kind?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_multiplier?: number
          fixed_rate_idr?: number
          formula_kind?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      extra_work_logs: {
        Row: {
          created_at: string
          custom_rate_idr: number | null
          date: string
          formula_override: string | null
          id: string
          kind: string
          multiplier_override: number | null
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_rate_idr?: number | null
          date: string
          formula_override?: string | null
          id?: string
          kind: string
          multiplier_override?: number | null
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          custom_rate_idr?: number | null
          date?: string
          formula_override?: string | null
          id?: string
          kind?: string
          multiplier_override?: number | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_work_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_work_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_business_unit_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          business_unit: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          business_unit: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          business_unit?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_business_unit_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_business_unit_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_business_unit_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_business_unit_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_contracts: {
        Row: {
          bagi_hasil_pct: number
          bep_target_idr: number
          business_unit: string
          contract_ref: string | null
          created_at: string
          created_by: string | null
          durasi_bulan: number | null
          id: string
          notes: string | null
          payout_bank_name: string | null
          payout_rekening_label: string | null
          payout_rekening_number: string | null
          start_date: string
          total_invest_idr: number
          user_id: string
        }
        Insert: {
          bagi_hasil_pct: number
          bep_target_idr: number
          business_unit: string
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          durasi_bulan?: number | null
          id?: string
          notes?: string | null
          payout_bank_name?: string | null
          payout_rekening_label?: string | null
          payout_rekening_number?: string | null
          start_date: string
          total_invest_idr: number
          user_id: string
        }
        Update: {
          bagi_hasil_pct?: number
          bep_target_idr?: number
          business_unit?: string
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          durasi_bulan?: number | null
          id?: string
          notes?: string | null
          payout_bank_name?: string | null
          payout_rekening_label?: string | null
          payout_rekening_number?: string | null
          start_date?: string
          total_invest_idr?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_contracts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_contracts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_payouts: {
        Row: {
          amount_idr: number
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string | null
          period_month: number
          period_year: number
          ref: string | null
        }
        Insert: {
          amount_idr: number
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_month: number
          period_year: number
          ref?: string | null
        }
        Update: {
          amount_idr?: number
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_month?: number
          period_year?: number
          ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_payouts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "investor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_requests: {
        Row: {
          admin_note: string | null
          attendance_log_id: string
          created_at: string
          date: string
          id: string
          overtime_minutes: number
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          attendance_log_id: string
          created_at?: string
          date: string
          id?: string
          overtime_minutes: number
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          attendance_log_id?: string
          created_at?: string
          date?: string
          id?: string
          overtime_minutes?: number
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_requests_attendance_log_id_fkey"
            columns: ["attendance_log_id"]
            isOneToOne: true
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_deliverables: {
        Row: {
          created_at: string | null
          id: string
          name: string
          payslip_id: string
          realization: number
          sort_order: number
          target: number
          updated_at: string | null
          weight_pct: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          payslip_id: string
          realization?: number
          sort_order?: number
          target?: number
          updated_at?: string | null
          weight_pct?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          payslip_id?: string
          realization?: number
          sort_order?: number
          target?: number
          updated_at?: string | null
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslip_deliverables_payslip_id_fkey"
            columns: ["payslip_id"]
            isOneToOne: false
            referencedRelation: "payslips"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_settings: {
        Row: {
          attendance_weight_pct: number
          calculation_basis: string
          created_at: string | null
          deliverables_weight_pct: number
          expected_days_mode: string
          expected_weekdays: number[]
          expected_work_days: number
          extra_work_rate_idr: number
          finalized_at: string | null
          id: string
          is_finalized: boolean
          late_penalty_amount: number
          late_penalty_interval_min: number
          late_penalty_mode: string
          monthly_fixed_amount: number
          ot_first_hour_rate: number
          ot_fixed_daily_rate: number
          ot_next_hour_rate: number
          overtime_mode: string
          standard_working_hours: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendance_weight_pct?: number
          calculation_basis?: string
          created_at?: string | null
          deliverables_weight_pct?: number
          expected_days_mode?: string
          expected_weekdays?: number[]
          expected_work_days?: number
          extra_work_rate_idr?: number
          finalized_at?: string | null
          id?: string
          is_finalized?: boolean
          late_penalty_amount?: number
          late_penalty_interval_min?: number
          late_penalty_mode?: string
          monthly_fixed_amount?: number
          ot_first_hour_rate?: number
          ot_fixed_daily_rate?: number
          ot_next_hour_rate?: number
          overtime_mode?: string
          standard_working_hours?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attendance_weight_pct?: number
          calculation_basis?: string
          created_at?: string | null
          deliverables_weight_pct?: number
          expected_days_mode?: string
          expected_weekdays?: number[]
          expected_work_days?: number
          extra_work_rate_idr?: number
          finalized_at?: string | null
          id?: string
          is_finalized?: boolean
          late_penalty_amount?: number
          late_penalty_interval_min?: number
          late_penalty_mode?: string
          monthly_fixed_amount?: number
          ot_first_hour_rate?: number
          ot_fixed_daily_rate?: number
          ot_next_hour_rate?: number
          overtime_mode?: string
          standard_working_hours?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslip_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_settings_disputes: {
        Row: {
          admin_response: string | null
          created_at: string
          current_value: string | null
          field: string
          id: string
          message: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          current_value?: string | null
          field: string
          id?: string
          message: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          current_value?: string | null
          field?: string
          id?: string
          message?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslip_settings_disputes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_settings_disputes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          actual_work_days: number
          base_salary: number
          breakdown_json: Json | null
          created_at: string | null
          debt_deduction: number
          debt_deduction_auto: number
          debt_deduction_manual: number
          debt_deduction_note: string | null
          deliverables_achievement_pct: number
          deliverables_pay: number
          employee_response: string
          employee_response_at: string | null
          employee_response_message: string | null
          expected_work_days: number
          extra_day_bonus: number
          extra_work_pay: number
          id: string
          inputs_signature: string | null
          late_penalty: number
          month: number
          monthly_bonus: number
          monthly_bonus_note: string | null
          net_total: number
          other_penalty: number
          other_penalty_note: string | null
          overtime_pay: number
          payment_at: string | null
          payment_note: string | null
          payment_status: string
          prorated_salary: number
          status: string
          total_late_minutes: number
          total_overtime_minutes: number
          updated_at: string | null
          user_id: string
          year: number
        }
        Insert: {
          actual_work_days?: number
          base_salary?: number
          breakdown_json?: Json | null
          created_at?: string | null
          debt_deduction?: number
          debt_deduction_auto?: number
          debt_deduction_manual?: number
          debt_deduction_note?: string | null
          deliverables_achievement_pct?: number
          deliverables_pay?: number
          employee_response?: string
          employee_response_at?: string | null
          employee_response_message?: string | null
          expected_work_days?: number
          extra_day_bonus?: number
          extra_work_pay?: number
          id?: string
          inputs_signature?: string | null
          late_penalty?: number
          month: number
          monthly_bonus?: number
          monthly_bonus_note?: string | null
          net_total?: number
          other_penalty?: number
          other_penalty_note?: string | null
          overtime_pay?: number
          payment_at?: string | null
          payment_note?: string | null
          payment_status?: string
          prorated_salary?: number
          status?: string
          total_late_minutes?: number
          total_overtime_minutes?: number
          updated_at?: string | null
          user_id: string
          year: number
        }
        Update: {
          actual_work_days?: number
          base_salary?: number
          breakdown_json?: Json | null
          created_at?: string | null
          debt_deduction?: number
          debt_deduction_auto?: number
          debt_deduction_manual?: number
          debt_deduction_note?: string | null
          deliverables_achievement_pct?: number
          deliverables_pay?: number
          employee_response?: string
          employee_response_at?: string | null
          employee_response_message?: string | null
          expected_work_days?: number
          extra_day_bonus?: number
          extra_work_pay?: number
          id?: string
          inputs_signature?: string | null
          late_penalty?: number
          month?: number
          monthly_bonus?: number
          monthly_bonus_note?: string | null
          net_total?: number
          other_penalty?: number
          other_penalty_note?: string | null
          overtime_pay?: number
          payment_at?: string | null
          payment_note?: string | null
          payment_status?: string
          prorated_salary?: number
          status?: string
          total_late_minutes?: number
          total_overtime_minutes?: number
          updated_at?: string | null
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_discount_campaigns: {
        Row: {
          bank_account_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          note: string | null
          percent_off: number
          rounding_mode: string
          rounding_unit: number
          start_date: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          note?: string | null
          percent_off: number
          rounding_mode?: string
          rounding_unit?: number
          start_date: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          note?: string | null
          percent_off?: number
          rounding_mode?: string
          rounding_unit?: number
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_discount_campaigns_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_discount_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_discount_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_variants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price: number
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price: number
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price?: number
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_products: {
        Row: {
          active: boolean
          bank_account_id: string
          created_at: string
          id: string
          is_open_price: boolean
          name: string
          notes: string | null
          price: number
          sort_order: number
          stock_aggregate_variants: boolean
          track_stock: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          bank_account_id: string
          created_at?: string
          id?: string
          is_open_price?: boolean
          name: string
          notes?: string | null
          price: number
          sort_order?: number
          stock_aggregate_variants?: boolean
          track_stock?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          bank_account_id?: string
          created_at?: string
          id?: string
          is_open_price?: boolean
          name?: string
          notes?: string | null
          price?: number
          sort_order?: number
          stock_aggregate_variants?: boolean
          track_stock?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_products_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_items: {
        Row: {
          fulfillment_type: string | null
          id: string
          product_id: string | null
          product_name: string
          qty: number
          sale_id: string
          subtotal: number
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          fulfillment_type?: string | null
          id?: string
          product_id?: string | null
          product_name: string
          qty: number
          sale_id: string
          subtotal: number
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          fulfillment_type?: string | null
          id?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          sale_id?: string
          subtotal?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "pos_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          bank_account_id: string
          cashflow_transaction_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          discount_amount: number
          discount_campaign_id: string | null
          fulfillment_type: string | null
          gross_total: number | null
          id: string
          payment_method: string
          payment_status: string
          pending_at: string | null
          sale_date: string
          sale_time: string
          settled_at: string | null
          settled_by: string | null
          settled_via: string | null
          total: number
          voided_at: string | null
        }
        Insert: {
          bank_account_id: string
          cashflow_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount_amount?: number
          discount_campaign_id?: string | null
          fulfillment_type?: string | null
          gross_total?: number | null
          id?: string
          payment_method: string
          payment_status?: string
          pending_at?: string | null
          sale_date: string
          sale_time?: string
          settled_at?: string | null
          settled_by?: string | null
          settled_via?: string | null
          total: number
          voided_at?: string | null
        }
        Update: {
          bank_account_id?: string
          cashflow_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount_amount?: number
          discount_campaign_id?: string | null
          fulfillment_type?: string | null
          gross_total?: number | null
          id?: string
          payment_method?: string
          payment_status?: string
          pending_at?: string | null
          sale_date?: string
          sale_time?: string
          settled_at?: string | null
          settled_by?: string | null
          settled_via?: string | null
          total?: number
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_cashflow_transaction_id_fkey"
            columns: ["cashflow_transaction_id"]
            isOneToOne: false
            referencedRelation: "cashflow_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_discount_campaign_id_fkey"
            columns: ["discount_campaign_id"]
            isOneToOne: false
            referencedRelation: "pos_discount_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_movements: {
        Row: {
          bank_account_id: string
          created_at: string
          created_by: string | null
          id: string
          movement_date: string
          movement_time: string | null
          notes: string | null
          product_id: string
          qty: number
          type: string
          variant_id: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date: string
          movement_time?: string | null
          notes?: string | null
          product_id: string
          qty: number
          type: string
          variant_id?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          movement_time?: string | null
          notes?: string | null
          product_id?: string
          qty?: number
          type?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_movements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "pos_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_opname_items: {
        Row: {
          expected_count: number
          id: string
          opname_id: string
          physical_count: number
          product_id: string
          product_name_snapshot: string
          unit_price_snapshot: number
          variant_id: string | null
          variant_name_snapshot: string | null
        }
        Insert: {
          expected_count: number
          id?: string
          opname_id: string
          physical_count: number
          product_id: string
          product_name_snapshot: string
          unit_price_snapshot: number
          variant_id?: string | null
          variant_name_snapshot?: string | null
        }
        Update: {
          expected_count?: number
          id?: string
          opname_id?: string
          physical_count?: number
          product_id?: string
          product_name_snapshot?: string
          unit_price_snapshot?: number
          variant_id?: string | null
          variant_name_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_opname_items_opname_id_fkey"
            columns: ["opname_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_opnames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_opname_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_opname_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "pos_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_opnames: {
        Row: {
          bank_account_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          opname_date: string
          opname_time: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opname_date: string
          opname_time?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opname_date?: string
          opname_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_opnames_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          anniversary_last_greeted: string | null
          asal_alamat: string | null
          asal_kecamatan: string | null
          asal_kelurahan: string | null
          asal_kota: string | null
          asal_provinsi: string | null
          avatar_seed: string | null
          avatar_url: string | null
          birthday_last_greeted: string | null
          business_unit: string | null
          created_at: string
          current_city: string | null
          date_of_birth: string | null
          department: string
          domisili_alamat: string | null
          domisili_kecamatan: string | null
          domisili_kelurahan: string | null
          domisili_kota: string | null
          domisili_provinsi: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_whatsapp: string | null
          extra_work_enabled: boolean
          first_day_of_work: string | null
          full_name: string
          gender: string | null
          grace_period_min: number
          id: string
          is_active: boolean
          is_flexible_schedule: boolean
          is_probation: boolean
          job_role: string | null
          motto: string | null
          nickname: string | null
          npwp: string | null
          payslip_excluded: boolean
          place_of_birth: string | null
          pos_pin_hash: string | null
          position: string
          resigned_at: string | null
          resigned_by: string | null
          role: string
          shirt_size: string | null
          streak_last_milestone: number
          streak_personal_best: number
          updated_at: string
          whatsapp_number: string | null
          work_end_time: string
          work_start_time: string
          workday_check_enabled: boolean
          workdays: number
        }
        Insert: {
          anniversary_last_greeted?: string | null
          asal_alamat?: string | null
          asal_kecamatan?: string | null
          asal_kelurahan?: string | null
          asal_kota?: string | null
          asal_provinsi?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          birthday_last_greeted?: string | null
          business_unit?: string | null
          created_at?: string
          current_city?: string | null
          date_of_birth?: string | null
          department?: string
          domisili_alamat?: string | null
          domisili_kecamatan?: string | null
          domisili_kelurahan?: string | null
          domisili_kota?: string | null
          domisili_provinsi?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_whatsapp?: string | null
          extra_work_enabled?: boolean
          first_day_of_work?: string | null
          full_name?: string
          gender?: string | null
          grace_period_min?: number
          id: string
          is_active?: boolean
          is_flexible_schedule?: boolean
          is_probation?: boolean
          job_role?: string | null
          motto?: string | null
          nickname?: string | null
          npwp?: string | null
          payslip_excluded?: boolean
          place_of_birth?: string | null
          pos_pin_hash?: string | null
          position?: string
          resigned_at?: string | null
          resigned_by?: string | null
          role?: string
          shirt_size?: string | null
          streak_last_milestone?: number
          streak_personal_best?: number
          updated_at?: string
          whatsapp_number?: string | null
          work_end_time?: string
          work_start_time?: string
          workday_check_enabled?: boolean
          workdays?: number
        }
        Update: {
          anniversary_last_greeted?: string | null
          asal_alamat?: string | null
          asal_kecamatan?: string | null
          asal_kelurahan?: string | null
          asal_kota?: string | null
          asal_provinsi?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          birthday_last_greeted?: string | null
          business_unit?: string | null
          created_at?: string
          current_city?: string | null
          date_of_birth?: string | null
          department?: string
          domisili_alamat?: string | null
          domisili_kecamatan?: string | null
          domisili_kelurahan?: string | null
          domisili_kota?: string | null
          domisili_provinsi?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_whatsapp?: string | null
          extra_work_enabled?: boolean
          first_day_of_work?: string | null
          full_name?: string
          gender?: string | null
          grace_period_min?: number
          id?: string
          is_active?: boolean
          is_flexible_schedule?: boolean
          is_probation?: boolean
          job_role?: string | null
          motto?: string | null
          nickname?: string | null
          npwp?: string | null
          payslip_excluded?: boolean
          place_of_birth?: string | null
          pos_pin_hash?: string | null
          position?: string
          resigned_at?: string | null
          resigned_by?: string | null
          role?: string
          shirt_size?: string | null
          streak_last_milestone?: number
          streak_personal_best?: number
          updated_at?: string
          whatsapp_number?: string | null
          work_end_time?: string
          work_start_time?: string
          workday_check_enabled?: boolean
          workdays?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_resigned_by_fkey"
            columns: ["resigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_resigned_by_fkey"
            columns: ["resigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_allocations: {
        Row: {
          amount: number
          branch: string
          created_at: string
          created_by: string | null
          employee_name: string
          id: string
          transaction_id: string
        }
        Insert: {
          amount: number
          branch: string
          created_at?: string
          created_by?: string | null
          employee_name: string
          id?: string
          transaction_id: string
        }
        Update: {
          amount?: number
          branch?: string
          created_at?: string
          created_by?: string | null
          employee_name?: string
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_allocations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "cashflow_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_month_allocations: {
        Row: {
          amount: number
          branch: string
          business_unit: string
          created_at: string
          created_by: string | null
          id: string
          period_month: number
          period_year: number
          updated_at: string
        }
        Insert: {
          amount: number
          branch: string
          business_unit: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: number
          period_year: number
          updated_at?: string
        }
        Update: {
          amount?: number
          branch?: string
          business_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: number
          period_year?: number
          updated_at?: string
        }
        Relationships: []
      }
      voice_room_presence: {
        Row: {
          joined_at: string
          last_seen: string
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          last_seen?: string
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          last_seen?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_room_presence_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "voice_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_room_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_room_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_rooms: {
        Row: {
          business_unit: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          business_unit?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          business_unit?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      whatsapp_notification_recipients: {
        Row: {
          created_at: string
          id: string
          label: string
          phone_e164: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          phone_e164: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          phone_e164?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_send_logs: {
        Row: {
          error_message: string | null
          event_type: string
          fonnte_id: string | null
          id: string
          message_body: string
          recipient_phone: string
          recipient_profile_id: string | null
          sent_at: string
          status: string
        }
        Insert: {
          error_message?: string | null
          event_type: string
          fonnte_id?: string | null
          id?: string
          message_body: string
          recipient_phone: string
          recipient_profile_id?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          error_message?: string | null
          event_type?: string
          fonnte_id?: string | null
          id?: string
          message_body?: string
          recipient_phone?: string
          recipient_profile_id?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_send_logs_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_send_logs_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          template_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_booth_admins: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_booth_admins_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_admins_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_booth_booking_freelance: {
        Row: {
          assigned_at: string
          booking_id: string
          freelance_id: string
        }
        Insert: {
          assigned_at?: string
          booking_id: string
          freelance_id: string
        }
        Update: {
          assigned_at?: string
          booking_id?: string
          freelance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_booth_booking_freelance_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "yeobo_booth_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_booking_freelance_freelance_id_fkey"
            columns: ["freelance_id"]
            isOneToOne: false
            referencedRelation: "yeobo_booth_freelance"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_booth_bookings: {
        Row: {
          cancellation_kind: string | null
          catatan: string | null
          created_at: string
          created_by: string | null
          dp_bank_account_id: string | null
          dp_cashflow_transaction_id: string | null
          dp_nominal: number | null
          dp_tanggal: string | null
          harga_total: number
          id: string
          jam_mulai: string
          jam_selesai: string
          lokasi_event: string | null
          nama_klien: string
          no_hp_klien: string | null
          payment_status: string
          pelunasan_bank_account_id: string | null
          pelunasan_cashflow_transaction_id: string | null
          pelunasan_nominal: number | null
          pelunasan_tanggal: string | null
          status: string
          tanggal: string
          updated_at: string
        }
        Insert: {
          cancellation_kind?: string | null
          catatan?: string | null
          created_at?: string
          created_by?: string | null
          dp_bank_account_id?: string | null
          dp_cashflow_transaction_id?: string | null
          dp_nominal?: number | null
          dp_tanggal?: string | null
          harga_total: number
          id?: string
          jam_mulai: string
          jam_selesai: string
          lokasi_event?: string | null
          nama_klien: string
          no_hp_klien?: string | null
          payment_status?: string
          pelunasan_bank_account_id?: string | null
          pelunasan_cashflow_transaction_id?: string | null
          pelunasan_nominal?: number | null
          pelunasan_tanggal?: string | null
          status?: string
          tanggal: string
          updated_at?: string
        }
        Update: {
          cancellation_kind?: string | null
          catatan?: string | null
          created_at?: string
          created_by?: string | null
          dp_bank_account_id?: string | null
          dp_cashflow_transaction_id?: string | null
          dp_nominal?: number | null
          dp_tanggal?: string | null
          harga_total?: number
          id?: string
          jam_mulai?: string
          jam_selesai?: string
          lokasi_event?: string | null
          nama_klien?: string
          no_hp_klien?: string | null
          payment_status?: string
          pelunasan_bank_account_id?: string | null
          pelunasan_cashflow_transaction_id?: string | null
          pelunasan_nominal?: number | null
          pelunasan_tanggal?: string | null
          status?: string
          tanggal?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_booth_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_bookings_dp_bank_account_id_fkey"
            columns: ["dp_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_bookings_dp_cashflow_transaction_id_fkey"
            columns: ["dp_cashflow_transaction_id"]
            isOneToOne: false
            referencedRelation: "cashflow_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_bookings_pelunasan_bank_account_id_fkey"
            columns: ["pelunasan_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_bookings_pelunasan_cashflow_transaction_id_fkey"
            columns: ["pelunasan_cashflow_transaction_id"]
            isOneToOne: false
            referencedRelation: "cashflow_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_booth_freelance: {
        Row: {
          aktif: boolean
          catatan: string | null
          created_at: string
          created_by: string | null
          fee_per_sesi: number | null
          id: string
          nama: string
          no_hp: string | null
          updated_at: string
        }
        Insert: {
          aktif?: boolean
          catatan?: string | null
          created_at?: string
          created_by?: string | null
          fee_per_sesi?: number | null
          id?: string
          nama: string
          no_hp?: string | null
          updated_at?: string
        }
        Update: {
          aktif?: boolean
          catatan?: string | null
          created_at?: string
          created_by?: string | null
          fee_per_sesi?: number | null
          id?: string
          nama?: string
          no_hp?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_booth_freelance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_freelance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_booth_reminder_logs: {
        Row: {
          booking_id: string
          checkpoint: string
          error_message: string | null
          id: string
          recipient_count: number
          sent_at: string
          status: string
        }
        Insert: {
          booking_id: string
          checkpoint: string
          error_message?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string
          status?: string
        }
        Update: {
          booking_id?: string
          checkpoint?: string
          error_message?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_booth_reminder_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "yeobo_booth_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_celebrations_public: {
        Row: {
          avatar_seed: string | null
          avatar_url: string | null
          dob_month_day: string | null
          first_day_of_work: string | null
          full_name: string | null
          id: string | null
          is_probation: boolean | null
          nickname: string | null
        }
        Insert: {
          avatar_seed?: string | null
          avatar_url?: string | null
          dob_month_day?: never
          first_day_of_work?: string | null
          full_name?: string | null
          id?: string | null
          is_probation?: boolean | null
          nickname?: string | null
        }
        Update: {
          avatar_seed?: string | null
          avatar_url?: string | null
          dob_month_day?: never
          first_day_of_work?: string | null
          full_name?: string | null
          id?: string | null
          is_probation?: boolean | null
          nickname?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_yeobo_booth: { Args: never; Returns: boolean }
      count_my_needs_assignments: { Args: never; Returns: number }
      get_intercom_presence: {
        Args: { room_ids: string[] }
        Returns: {
          avatar_seed: string
          avatar_url: string
          full_name: string
          joined_at: string
          room_id: string
          user_id: string
        }[]
      }
      get_my_needs_assignments: {
        Args: never
        Returns: {
          assigned_to_user_id: string
          bank_account_id: string
          bank_account_name: string
          branch: string
          business_unit: string
          category: string
          credit: number
          debit: number
          description: string
          effective_period_month: number
          effective_period_year: number
          id: string
          notes: string
          source_destination: string
          transaction_date: string
          transaction_details: string
        }[]
      }
      get_ui_theme: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_assignee: { Args: { account_id: string }; Returns: boolean }
      is_admin_or_pos_assignee: {
        Args: { account_id: string }
        Returns: boolean
      }
      is_investor_for_business_unit: { Args: { bu: string }; Returns: boolean }
      is_yeobo_booth_admin: { Args: never; Returns: boolean }
      resolve_assignment: {
        Args: {
          p_row_id: string
          p_category: string
          p_branch: string
          p_effective_period_month?: number | null
          p_effective_period_year?: number | null
        }
        Returns: boolean
      }
      voice_sweep_stale_presence: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const


/** Per-day transparency snapshot for payslips.breakdown_json. */
export type PayslipBreakdown = {
  overtime_mode: 'hourly_tiered' | 'fixed_per_day';
  late_penalty_mode: 'per_minutes' | 'per_day' | 'none';
  grace_period_min: number;
  overtime_days: Array<{ date: string; minutes: number; pay: number }>;
  late_days: Array<{ date: string; raw_minutes: number; after_grace_minutes: number; penalty: number; excused: boolean; penalty_pre_cap?: number; excuse_note?: string | null }>;
  late_penalty_daily_cap?: number;
  extra_work_days?: Array<{ date: string; kind: string; pay: number }>;
  extra_work_rate_idr?: number;
  /** Hari hadir karyawan dalam periode — ditambah dari sibling chat
   *  slip-gaji untuk render daftar attendance di PayslipPdfDocument. */
  attendance_days?: Array<{ date: string }>;
};
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type AttendanceLog = Database['public']['Tables']['attendance_logs']['Row'];
export type AttendanceSettings = Database['public']['Tables']['attendance_settings']['Row'];
export type OvertimeRequest = Database['public']['Tables']['overtime_requests']['Row'];
export type PayslipSettings = Database['public']['Tables']['payslip_settings']['Row'];
export type Payslip = Database['public']['Tables']['payslips']['Row'];
export type PayslipDeliverable = Database['public']['Tables']['payslip_deliverables']['Row'];
export type ExtraWorkLog = Database['public']['Tables']['extra_work_logs']['Row'];
export type AttendanceLocation = Database['public']['Tables']['attendance_locations']['Row'];
export type EmployeeLocation = Database['public']['Tables']['employee_locations']['Row'];
export type WhatsAppNotificationRecipient = Database['public']['Tables']['whatsapp_notification_recipients']['Row'];
export type CelebrationMessageRow = Database['public']['Tables']['celebration_messages']['Row'];
