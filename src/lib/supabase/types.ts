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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      allocation_archives: {
        Row: {
          archived_at: string
          archived_by: string | null
          business_unit: string
          kind: string
          ref_key: string
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          business_unit: string
          kind: string
          ref_key: string
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          business_unit?: string
          kind?: string
          ref_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_archives_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_archives_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          alternative: string | null
          category: string
          created_at: string
          deadline_at: string | null
          decided_at: string | null
          has_safety_or_sanction_impact: boolean
          id: string
          nominal: number | null
          owner_note: string | null
          proposal: string
          reason: string
          requested_by: string
          status: string
        }
        Insert: {
          alternative?: string | null
          category: string
          created_at?: string
          deadline_at?: string | null
          decided_at?: string | null
          has_safety_or_sanction_impact?: boolean
          id?: string
          nominal?: number | null
          owner_note?: string | null
          proposal: string
          reason: string
          requested_by: string
          status?: string
        }
        Update: {
          alternative?: string | null
          category?: string
          created_at?: string
          deadline_at?: string | null
          decided_at?: string | null
          has_safety_or_sanction_impact?: boolean
          id?: string
          nominal?: number | null
          owner_note?: string | null
          proposal?: string
          reason?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      assigned_task_attachments: {
        Row: {
          created_at: string
          id: string
          kind: string
          photo_path: string | null
          photo_purged_at: string | null
          round: number
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          photo_path?: string | null
          photo_purged_at?: string | null
          round?: number
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          photo_path?: string | null
          photo_purged_at?: string | null
          round?: number
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assigned_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assigned_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      assigned_task_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      assigned_task_completions: {
        Row: {
          completed_at: string
          id: string
          item_id: string
          latitude: number | null
          longitude: number | null
          photo_path: string | null
          photo_purged_at: string | null
          round: number
          task_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          item_id: string
          latitude?: number | null
          longitude?: number | null
          photo_path?: string | null
          photo_purged_at?: string | null
          round: number
          task_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          item_id?: string
          latitude?: number | null
          longitude?: number | null
          photo_path?: string | null
          photo_purged_at?: string | null
          round?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assigned_task_completions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "assigned_task_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assigned_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      assigned_task_deferrals: {
        Row: {
          created_at: string
          for_date: string
          id: string
          reason: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          for_date: string
          id?: string
          reason: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          for_date?: string
          id?: string
          reason?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assigned_task_deferrals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assigned_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_task_deferrals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_task_deferrals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      assigned_task_extra_photos: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          photo_path: string | null
          photo_purged_at: string | null
          round: number
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          photo_path?: string | null
          photo_purged_at?: string | null
          round: number
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          photo_path?: string | null
          photo_purged_at?: string | null
          round?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assigned_task_extra_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assigned_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      assigned_task_items: {
        Row: {
          id: string
          note: string | null
          sort_order: number
          task_id: string
          title: string
        }
        Insert: {
          id?: string
          note?: string | null
          sort_order?: number
          task_id: string
          title: string
        }
        Update: {
          id?: string
          note?: string | null
          sort_order?: number
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assigned_task_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assigned_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      assigned_task_reviews: {
        Row: {
          decision: string
          id: string
          note: string | null
          reviewed_at: string
          reviewed_by: string | null
          round: number
          task_id: string
        }
        Insert: {
          decision: string
          id?: string
          note?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          round: number
          task_id: string
        }
        Update: {
          decision?: string
          id?: string
          note?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          round?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assigned_task_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assigned_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      assigned_tasks: {
        Row: {
          assignee_id: string | null
          batch_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          current_round: number
          description: string | null
          id: string
          last_reminded_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string | null
          start_notified_at: string | null
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          batch_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_round?: number
          description?: string | null
          id?: string
          last_reminded_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          start_notified_at?: string | null
          status?: string
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          batch_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_round?: number
          description?: string | null
          id?: string
          last_reminded_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          start_notified_at?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assigned_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "assigned_task_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_break_logs: {
        Row: {
          attendance_log_id: string
          break_in_at: string | null
          break_in_latitude: number | null
          break_in_longitude: number | null
          break_in_matched_location_id: string | null
          break_in_selfie_path: string | null
          break_out_at: string
          break_out_latitude: number | null
          break_out_longitude: number | null
          break_out_matched_location_id: string | null
          break_out_selfie_path: string | null
          created_at: string
          date: string
          id: string
          late_return: boolean
          updated_at: string
          user_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          attendance_log_id: string
          break_in_at?: string | null
          break_in_latitude?: number | null
          break_in_longitude?: number | null
          break_in_matched_location_id?: string | null
          break_in_selfie_path?: string | null
          break_out_at: string
          break_out_latitude?: number | null
          break_out_longitude?: number | null
          break_out_matched_location_id?: string | null
          break_out_selfie_path?: string | null
          created_at?: string
          date: string
          id?: string
          late_return?: boolean
          updated_at?: string
          user_id: string
          window_end: string
          window_start: string
        }
        Update: {
          attendance_log_id?: string
          break_in_at?: string | null
          break_in_latitude?: number | null
          break_in_longitude?: number | null
          break_in_matched_location_id?: string | null
          break_in_selfie_path?: string | null
          break_out_at?: string
          break_out_latitude?: number | null
          break_out_longitude?: number | null
          break_out_matched_location_id?: string | null
          break_out_selfie_path?: string | null
          created_at?: string
          date?: string
          id?: string
          late_return?: boolean
          updated_at?: string
          user_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_break_logs_attendance_log_id_fkey"
            columns: ["attendance_log_id"]
            isOneToOne: false
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_break_logs_break_in_matched_location_id_fkey"
            columns: ["break_in_matched_location_id"]
            isOneToOne: false
            referencedRelation: "attendance_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_break_logs_break_out_matched_location_id_fkey"
            columns: ["break_out_matched_location_id"]
            isOneToOne: false
            referencedRelation: "attendance_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_break_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_break_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
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
          selfie_ai_attempts: number
          selfie_ai_flag: string | null
          selfie_ai_note: string | null
          selfie_ai_reviewed_at: string | null
          selfie_ai_verdict: string | null
          selfie_path: string | null
          selfie_purged_at: string | null
          status: string
          total_break_minutes: number
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
          selfie_ai_attempts?: number
          selfie_ai_flag?: string | null
          selfie_ai_note?: string | null
          selfie_ai_reviewed_at?: string | null
          selfie_ai_verdict?: string | null
          selfie_path?: string | null
          selfie_purged_at?: string | null
          status?: string
          total_break_minutes?: number
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
          selfie_ai_attempts?: number
          selfie_ai_flag?: string | null
          selfie_ai_note?: string | null
          selfie_ai_reviewed_at?: string | null
          selfie_ai_verdict?: string | null
          selfie_path?: string | null
          selfie_purged_at?: string | null
          status?: string
          total_break_minutes?: number
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
      attendance_selfie_checks: {
        Row: {
          created_at: string
          id: string
          issues: string[]
          message: string | null
          selfie_path: string
          user_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          id?: string
          issues?: string[]
          message?: string | null
          selfie_path: string
          user_id: string
          verdict: string
        }
        Update: {
          created_at?: string
          id?: string
          issues?: string[]
          message?: string | null
          selfie_path?: string
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_selfie_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_selfie_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_selfie_rules: {
        Row: {
          business_unit: string
          enabled: boolean
          filters: Json
          updated_at: string
        }
        Insert: {
          business_unit: string
          enabled?: boolean
          filters?: Json
          updated_at?: string
        }
        Update: {
          business_unit?: string
          enabled?: boolean
          filters?: Json
          updated_at?: string
        }
        Relationships: []
      }
      attendance_selfie_user_rules: {
        Row: {
          head_cover: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          head_cover?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          head_cover?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_selfie_user_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_selfie_user_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
          daily_revenue_target: number | null
          default_branch: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          opname_authorizer_id: string | null
          pdf_password: string | null
          pos_enabled: boolean
          pos_receipt_config: Json | null
          production_authorizer_id: string | null
          service_level_close_hour: number
          service_level_enabled: boolean
          service_level_open_hour: number
          service_level_target: number
          shift_mode_enabled: boolean
          source_sheet: string | null
          source_url: string | null
          token_kwh_critical_threshold: number | null
          token_kwh_low_threshold: number | null
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
          daily_revenue_target?: number | null
          default_branch?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          opname_authorizer_id?: string | null
          pdf_password?: string | null
          pos_enabled?: boolean
          pos_receipt_config?: Json | null
          production_authorizer_id?: string | null
          service_level_close_hour?: number
          service_level_enabled?: boolean
          service_level_open_hour?: number
          service_level_target?: number
          shift_mode_enabled?: boolean
          source_sheet?: string | null
          source_url?: string | null
          token_kwh_critical_threshold?: number | null
          token_kwh_low_threshold?: number | null
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
          daily_revenue_target?: number | null
          default_branch?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          opname_authorizer_id?: string | null
          pdf_password?: string | null
          pos_enabled?: boolean
          pos_receipt_config?: Json | null
          production_authorizer_id?: string | null
          service_level_close_hour?: number
          service_level_enabled?: boolean
          service_level_open_hour?: number
          service_level_target?: number
          shift_mode_enabled?: boolean
          source_sheet?: string | null
          source_url?: string | null
          token_kwh_critical_threshold?: number | null
          token_kwh_low_threshold?: number | null
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
      bonus_parameters: {
        Row: {
          branch: string
          created_at: string
          id: string
          lk_dasar: number
          p: number
          quarter: string
          set_by: string
        }
        Insert: {
          branch: string
          created_at?: string
          id?: string
          lk_dasar: number
          p: number
          quarter: string
          set_by: string
        }
        Update: {
          branch?: string
          created_at?: string
          id?: string
          lk_dasar?: number
          p?: number
          quarter?: string
          set_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_parameters_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_parameters_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_run_shares: {
        Row: {
          excluded: boolean
          excluded_reason: string | null
          hours: number
          id: string
          run_id: string
          share: number
          user_id: string
        }
        Insert: {
          excluded?: boolean
          excluded_reason?: string | null
          hours?: number
          id?: string
          run_id: string
          share?: number
          user_id: string
        }
        Update: {
          excluded?: boolean
          excluded_reason?: string | null
          hours?: number
          id?: string
          run_id?: string
          share?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_run_shares_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "bonus_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_run_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_run_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_runs: {
        Row: {
          branch: string
          created_at: string
          created_by: string
          finalized_at: string | null
          finalized_by: string | null
          gross_profit: number
          id: string
          lk_dasar: number
          p: number
          period: string
          pool: number
          scorecard_multiplier: number
          status: string
        }
        Insert: {
          branch: string
          created_at?: string
          created_by: string
          finalized_at?: string | null
          finalized_by?: string | null
          gross_profit: number
          id?: string
          lk_dasar: number
          p: number
          period: string
          pool: number
          scorecard_multiplier: number
          status?: string
        }
        Update: {
          branch?: string
          created_at?: string
          created_by?: string
          finalized_at?: string | null
          finalized_by?: string | null
          gross_profit?: number
          id?: string
          lk_dasar?: number
          p?: number
          period?: string
          pool?: number
          scorecard_multiplier?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_runs_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_runs_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      booth_devices: {
        Row: {
          active_event_id: string | null
          app_version: string | null
          brand: string
          camera_driver: string | null
          camera_ready: boolean | null
          created_at: string
          diagnostics: Json | null
          id: string
          last_seen_at: string | null
          location: string | null
          name: string
          printer_ready: boolean | null
          queue_pending: number | null
          revoked_at: string | null
          target_version: string | null
          token_hash: string
        }
        Insert: {
          active_event_id?: string | null
          app_version?: string | null
          brand: string
          camera_driver?: string | null
          camera_ready?: boolean | null
          created_at?: string
          diagnostics?: Json | null
          id?: string
          last_seen_at?: string | null
          location?: string | null
          name: string
          printer_ready?: boolean | null
          queue_pending?: number | null
          revoked_at?: string | null
          target_version?: string | null
          token_hash: string
        }
        Update: {
          active_event_id?: string | null
          app_version?: string | null
          brand?: string
          camera_driver?: string | null
          camera_ready?: boolean | null
          created_at?: string
          diagnostics?: Json | null
          id?: string
          last_seen_at?: string | null
          location?: string | null
          name?: string
          printer_ready?: boolean | null
          queue_pending?: number | null
          revoked_at?: string | null
          target_version?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "booth_devices_active_event_id_fkey"
            columns: ["active_event_id"]
            isOneToOne: false
            referencedRelation: "booth_events"
            referencedColumns: ["id"]
          },
        ]
      }
      booth_event_templates: {
        Row: {
          event_id: string
          position: number
          template_id: string
        }
        Insert: {
          event_id: string
          position?: number
          template_id: string
        }
        Update: {
          event_id?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booth_event_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "booth_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booth_event_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "booth_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      booth_events: {
        Row: {
          booking_id: string | null
          brand: string
          created_at: string
          ends_on: string | null
          id: string
          name: string
          pos_order_id: string | null
          starts_on: string | null
          status: string
          venue: string | null
        }
        Insert: {
          booking_id?: string | null
          brand: string
          created_at?: string
          ends_on?: string | null
          id?: string
          name: string
          pos_order_id?: string | null
          starts_on?: string | null
          status?: string
          venue?: string | null
        }
        Update: {
          booking_id?: string | null
          brand?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          name?: string
          pos_order_id?: string | null
          starts_on?: string | null
          status?: string
          venue?: string | null
        }
        Relationships: []
      }
      booth_photos: {
        Row: {
          bytes: number
          height: number | null
          id: string
          idx: number
          kind: string
          session_id: string
          storage_path: string
          width: number | null
        }
        Insert: {
          bytes: number
          height?: number | null
          id?: string
          idx?: number
          kind: string
          session_id: string
          storage_path: string
          width?: number | null
        }
        Update: {
          bytes?: number
          height?: number | null
          id?: string
          idx?: number
          kind?: string
          session_id?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booth_photos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "booth_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      booth_sessions: {
        Row: {
          captured_at: string
          created_at: string
          device_id: string
          event_id: string
          expires_at: string | null
          id: string
          printed_at: string | null
          public_token: string
          status: string
          template_id: string
          template_version: number
          uploaded_at: string | null
        }
        Insert: {
          captured_at: string
          created_at?: string
          device_id: string
          event_id: string
          expires_at?: string | null
          id: string
          printed_at?: string | null
          public_token: string
          status?: string
          template_id: string
          template_version: number
          uploaded_at?: string | null
        }
        Update: {
          captured_at?: string
          created_at?: string
          device_id?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          printed_at?: string | null
          public_token?: string
          status?: string
          template_id?: string
          template_version?: number
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booth_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "booth_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booth_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "booth_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booth_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "booth_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      booth_template_versions: {
        Row: {
          created_at: string
          definition: Json
          template_id: string
          version: number
        }
        Insert: {
          created_at?: string
          definition: Json
          template_id: string
          version: number
        }
        Update: {
          created_at?: string
          definition?: Json
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "booth_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "booth_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      booth_templates: {
        Row: {
          canvas: Json
          created_at: string
          footer: Json | null
          id: string
          name: string
          overlay_path: string | null
          shots: number
          slots: Json
          updated_at: string
          version: number
        }
        Insert: {
          canvas: Json
          created_at?: string
          footer?: Json | null
          id: string
          name: string
          overlay_path?: string | null
          shots: number
          slots: Json
          updated_at?: string
          version?: number
        }
        Update: {
          canvas?: Json
          created_at?: string
          footer?: Json | null
          id?: string
          name?: string
          overlay_path?: string | null
          shots?: number
          slots?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
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
      cake_diy_diameter_prices: {
        Row: {
          diameter_id: string
          price_pare_idr: number | null
          price_semarang_idr: number | null
          updated_at: string
        }
        Insert: {
          diameter_id: string
          price_pare_idr?: number | null
          price_semarang_idr?: number | null
          updated_at?: string
        }
        Update: {
          diameter_id?: string
          price_pare_idr?: number | null
          price_semarang_idr?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cake_diy_diameter_prices_diameter_id_fkey"
            columns: ["diameter_id"]
            isOneToOne: true
            referencedRelation: "cake_diameter_options"
            referencedColumns: ["id"]
          },
        ]
      }
      cake_finance_admins: {
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
            foreignKeyName: "cake_finance_admins_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_finance_admins_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_finance_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cake_finance_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
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
          purged_at: string | null
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
          purged_at?: string | null
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
          purged_at?: string | null
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
          recorded_by_name: string | null
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
          recorded_by_name?: string | null
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
          recorded_by_name?: string | null
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
          free_claim: boolean
          free_claim_at: string | null
          free_claim_by: string | null
          greeting_card: string | null
          id: string
          is_diy: boolean
          paid_at: string | null
          paid_idr: number
          payment_option_id: string | null
          payment_status: string
          picked_up_at: string | null
          picked_up_by: string | null
          picked_up_via: string | null
          pickup_waive_note: string | null
          pickup_waive_reason: string | null
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
          free_claim?: boolean
          free_claim_at?: string | null
          free_claim_by?: string | null
          greeting_card?: string | null
          id?: string
          is_diy?: boolean
          paid_at?: string | null
          paid_idr?: number
          payment_option_id?: string | null
          payment_status?: string
          picked_up_at?: string | null
          picked_up_by?: string | null
          picked_up_via?: string | null
          pickup_waive_note?: string | null
          pickup_waive_reason?: string | null
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
          free_claim?: boolean
          free_claim_at?: string | null
          free_claim_by?: string | null
          greeting_card?: string | null
          id?: string
          is_diy?: boolean
          paid_at?: string | null
          paid_idr?: number
          payment_option_id?: string | null
          payment_status?: string
          picked_up_at?: string | null
          picked_up_by?: string | null
          picked_up_via?: string | null
          pickup_waive_note?: string | null
          pickup_waive_reason?: string | null
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
          effective_from: string | null
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
          effective_from?: string | null
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
          effective_from?: string | null
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
          attachment_purged_at: string | null
          drawer_neutral: boolean
          branch: string | null
          category: string | null
          created_at: string
          credit: number
          custom_cake_included: boolean | null
          debit: number
          description: string
          effective_period: string | null
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
          attachment_purged_at?: string | null
          drawer_neutral?: boolean
          branch?: string | null
          category?: string | null
          created_at?: string
          credit?: number
          custom_cake_included?: boolean | null
          debit?: number
          description: string
          effective_period?: string | null
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
          attachment_purged_at?: string | null
          drawer_neutral?: boolean
          branch?: string | null
          category?: string | null
          created_at?: string
          credit?: number
          custom_cake_included?: boolean | null
          debit?: number
          description?: string
          effective_period?: string | null
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
      celebration_push_logs: {
        Row: {
          body: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          recipient_profile_id: string
          status: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          recipient_profile_id: string
          status: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          recipient_profile_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "celebration_push_logs_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_push_logs_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_assignments: {
        Row: {
          block_checkout: boolean
          block_signin: boolean
          checklist_id: string
          created_at: string
          duty_slot: number | null
          id: string
          is_active: boolean
          location_id: string | null
          rotation_anchor: string | null
          rotation_group_id: string | null
          rotation_member_count: number
          rotation_mode: string
          rotation_order: number
          skip_holidays: boolean
          starts_on: string | null
          trial_until: string | null
          updated_at: string
          user_id: string | null
          weekdays: number
          window_end: string | null
          window_mode: string
          window_start: string | null
        }
        Insert: {
          block_checkout?: boolean
          block_signin?: boolean
          checklist_id: string
          created_at?: string
          duty_slot?: number | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          rotation_anchor?: string | null
          rotation_group_id?: string | null
          rotation_member_count?: number
          rotation_mode?: string
          rotation_order?: number
          skip_holidays?: boolean
          starts_on?: string | null
          trial_until?: string | null
          updated_at?: string
          user_id?: string | null
          weekdays?: number
          window_end?: string | null
          window_mode?: string
          window_start?: string | null
        }
        Update: {
          block_checkout?: boolean
          block_signin?: boolean
          checklist_id?: string
          created_at?: string
          duty_slot?: number | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          rotation_anchor?: string | null
          rotation_group_id?: string | null
          rotation_member_count?: number
          rotation_mode?: string
          rotation_order?: number
          skip_holidays?: boolean
          starts_on?: string | null
          trial_until?: string | null
          updated_at?: string
          user_id?: string | null
          weekdays?: number
          window_end?: string | null
          window_mode?: string
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_assignments_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "attendance_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_checklist_items: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          note: string | null
          reference_photo_path: string | null
          requires_photo: boolean
          sort_order: number
          title: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          note?: string | null
          reference_photo_path?: string | null
          requires_photo?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          note?: string | null
          reference_photo_path?: string | null
          requires_photo?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_checklist_revisions: {
        Row: {
          changed_by: string | null
          checklist_id: string
          created_at: string
          id: string
          summary: string
        }
        Insert: {
          changed_by?: string | null
          checklist_id: string
          created_at?: string
          id?: string
          summary: string
        }
        Update: {
          changed_by?: string | null
          checklist_id?: string
          created_at?: string
          id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_checklist_revisions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_checklist_revisions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_checklist_revisions_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_checklists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_reviewed_at: string | null
          name: string
          owner_id: string | null
          review_every_days: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_reviewed_at?: string | null
          name: string
          owner_id?: string | null
          review_every_days?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_reviewed_at?: string | null
          name?: string
          owner_id?: string | null
          review_every_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_checklists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_checklists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_duty_pool: {
        Row: {
          created_at: string
          id: string
          location_id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_duty_pool_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "attendance_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_duty_pool_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_duty_pool_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_finding_acks: {
        Row: {
          ack_key: string
          acked_at: string
          acked_by: string | null
          id: string
          item_id: string
        }
        Insert: {
          ack_key: string
          acked_at?: string
          acked_by?: string | null
          id?: string
          item_id: string
        }
        Update: {
          ack_key?: string
          acked_at?: string
          acked_by?: string | null
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_finding_acks_acked_by_fkey"
            columns: ["acked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_finding_acks_acked_by_fkey"
            columns: ["acked_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_finding_acks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_item_ai_gates: {
        Row: {
          id: string
          is_active: boolean
          item_id: string
          kind: string
          min_value: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          item_id: string
          kind?: string
          min_value: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          item_id?: string
          kind?: string
          min_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_item_ai_gates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "cleaning_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_ai_gates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_ai_gates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_item_issues: {
        Row: {
          checklist_id: string
          created_at: string
          date: string
          id: string
          item_id: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          date: string
          id?: string
          item_id: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          date?: string
          id?: string
          item_id?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_item_issues_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_issues_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_issues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_issues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_item_photos: {
        Row: {
          created_at: string
          id: string
          item_id: string
          label: string | null
          previous_reference_photo_path: string | null
          previous_source_completion_id: string | null
          reference_photo_path: string | null
          sort_order: number
          source_completion_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          label?: string | null
          previous_reference_photo_path?: string | null
          previous_source_completion_id?: string | null
          reference_photo_path?: string | null
          sort_order?: number
          source_completion_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          label?: string | null
          previous_reference_photo_path?: string | null
          previous_source_completion_id?: string | null
          reference_photo_path?: string | null
          sort_order?: number
          source_completion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_item_photos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_photos_previous_source_completion_id_fkey"
            columns: ["previous_source_completion_id"]
            isOneToOne: false
            referencedRelation: "cleaning_task_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_item_photos_source_completion_id_fkey"
            columns: ["source_completion_id"]
            isOneToOne: false
            referencedRelation: "cleaning_task_completions"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_review_attachments: {
        Row: {
          completion_id: string
          created_at: string
          id: string
          photo_path: string
          purged_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          completion_id: string
          created_at?: string
          id?: string
          photo_path: string
          purged_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          completion_id?: string
          created_at?: string
          id?: string
          photo_path?: string
          purged_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_review_attachments_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "cleaning_task_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_review_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_review_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_sop_fixes: {
        Row: {
          action: string
          base_pct: number
          branch_key: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          note: string | null
          started_on: string
        }
        Insert: {
          action: string
          base_pct: number
          branch_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          note?: string | null
          started_on: string
        }
        Update: {
          action?: string
          base_pct?: number
          branch_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          note?: string | null
          started_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_sop_fixes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_sop_fixes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_sop_fixes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_task_completions: {
        Row: {
          ai_checked_at: string | null
          ai_reading: number | null
          ai_status: string | null
          assignment_id: string
          completed_at: string
          created_at: string
          date: string
          fixed_by_completion_id: string | null
          id: string
          item_id: string
          latitude: number | null
          longitude: number | null
          note: string | null
          photo_path: string | null
          photo_purged_at: string | null
          photo_req_id: string | null
          redo_reason: string | null
          review_note: string | null
          review_sampled: boolean
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          user_id: string
        }
        Insert: {
          ai_checked_at?: string | null
          ai_reading?: number | null
          ai_status?: string | null
          assignment_id: string
          completed_at?: string
          created_at?: string
          date: string
          fixed_by_completion_id?: string | null
          id?: string
          item_id: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          photo_path?: string | null
          photo_purged_at?: string | null
          photo_req_id?: string | null
          redo_reason?: string | null
          review_note?: string | null
          review_sampled?: boolean
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          user_id: string
        }
        Update: {
          ai_checked_at?: string | null
          ai_reading?: number | null
          ai_status?: string | null
          assignment_id?: string
          completed_at?: string
          created_at?: string
          date?: string
          fixed_by_completion_id?: string | null
          id?: string
          item_id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          photo_path?: string | null
          photo_purged_at?: string | null
          photo_req_id?: string | null
          redo_reason?: string | null
          review_note?: string | null
          review_sampled?: boolean
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_task_completions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "cleaning_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_completions_fixed_by_completion_id_fkey"
            columns: ["fixed_by_completion_id"]
            isOneToOne: false
            referencedRelation: "cleaning_task_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_completions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_completions_photo_req_id_fkey"
            columns: ["photo_req_id"]
            isOneToOne: false
            referencedRelation: "cleaning_item_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_completions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_completions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_hpp_snapshot: {
        Row: {
          breakdown_json: Json | null
          business_unit: string
          created_at: string
          created_by: string | null
          final_price: number | null
          hpp_unit: number
          id: string
          margin_percent: number | null
          product_id: string
          snapshot_date: string
        }
        Insert: {
          breakdown_json?: Json | null
          business_unit: string
          created_at?: string
          created_by?: string | null
          final_price?: number | null
          hpp_unit: number
          id?: string
          margin_percent?: number | null
          product_id: string
          snapshot_date: string
        }
        Update: {
          breakdown_json?: Json | null
          business_unit?: string
          created_at?: string
          created_by?: string | null
          final_price?: number | null
          hpp_unit?: number
          id?: string
          margin_percent?: number | null
          product_id?: string
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "costing_hpp_snapshot_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_hpp_snapshot_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_hpp_snapshot_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "costing_products"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_material_opname_items: {
        Row: {
          expected_qty: number
          id: string
          material_id: string
          material_name_snapshot: string
          opname_id: string
          physical_qty: number
          unit_cost_snapshot: number
          usage_unit_snapshot: string
        }
        Insert: {
          expected_qty?: number
          id?: string
          material_id: string
          material_name_snapshot: string
          opname_id: string
          physical_qty: number
          unit_cost_snapshot?: number
          usage_unit_snapshot: string
        }
        Update: {
          expected_qty?: number
          id?: string
          material_id?: string
          material_name_snapshot?: string
          opname_id?: string
          physical_qty?: number
          unit_cost_snapshot?: number
          usage_unit_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "costing_material_opname_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "costing_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_material_opname_items_opname_id_fkey"
            columns: ["opname_id"]
            isOneToOne: false
            referencedRelation: "costing_material_opnames"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_material_opnames: {
        Row: {
          business_unit: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          opname_date: string
          opname_time: string | null
        }
        Insert: {
          business_unit: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opname_date: string
          opname_time?: string | null
        }
        Update: {
          business_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opname_date?: string
          opname_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costing_material_opnames_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_material_opnames_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_material_price_history: {
        Row: {
          content_per_purchase: number
          created_by: string | null
          effective_from: string
          id: string
          material_id: string
          purchase_price: number
        }
        Insert: {
          content_per_purchase: number
          created_by?: string | null
          effective_from?: string
          id?: string
          material_id: string
          purchase_price: number
        }
        Update: {
          content_per_purchase?: number
          created_by?: string | null
          effective_from?: string
          id?: string
          material_id?: string
          purchase_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "costing_material_price_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_material_price_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_material_price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "costing_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_material_procurement: {
        Row: {
          avg_daily_usage: number
          business_unit: string
          created_at: string
          is_tracked: boolean
          lead_time_days: number
          lead_time_sigma_days: number | null
          material_id: string
          moq_purchase_units: number
          notes: string | null
          order_multiple_units: number
          service_level_override: number | null
          supplier: string | null
          updated_at: string
          updated_by: string | null
          usage_sigma_daily: number | null
        }
        Insert: {
          avg_daily_usage?: number
          business_unit: string
          created_at?: string
          is_tracked?: boolean
          lead_time_days?: number
          lead_time_sigma_days?: number | null
          material_id: string
          moq_purchase_units?: number
          notes?: string | null
          order_multiple_units?: number
          service_level_override?: number | null
          supplier?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_sigma_daily?: number | null
        }
        Update: {
          avg_daily_usage?: number
          business_unit?: string
          created_at?: string
          is_tracked?: boolean
          lead_time_days?: number
          lead_time_sigma_days?: number | null
          material_id?: string
          moq_purchase_units?: number
          notes?: string | null
          order_multiple_units?: number
          service_level_override?: number | null
          supplier?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_sigma_daily?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "costing_material_procurement_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: true
            referencedRelation: "costing_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_material_procurement_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_material_procurement_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_material_receipts: {
        Row: {
          business_unit: string
          content_per_purchase_snapshot: number
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          notes: string | null
          purchase_url_snapshot: string | null
          qty_purchase_units: number
          qty_usage_units: number
          receipt_date: string
          receipt_time: string | null
          supplier: string | null
          total_paid: number | null
          unit_price_paid: number | null
        }
        Insert: {
          business_unit: string
          content_per_purchase_snapshot: number
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          notes?: string | null
          purchase_url_snapshot?: string | null
          qty_purchase_units: number
          qty_usage_units: number
          receipt_date: string
          receipt_time?: string | null
          supplier?: string | null
          total_paid?: number | null
          unit_price_paid?: number | null
        }
        Update: {
          business_unit?: string
          content_per_purchase_snapshot?: number
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          purchase_url_snapshot?: string | null
          qty_purchase_units?: number
          qty_usage_units?: number
          receipt_date?: string
          receipt_time?: string | null
          supplier?: string | null
          total_paid?: number | null
          unit_price_paid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "costing_material_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_material_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_material_receipts_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "costing_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_materials: {
        Row: {
          business_unit: string
          category: string | null
          content_per_purchase: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          price_updated_at: string
          purchase_price: number
          purchase_unit: string
          shopee_url: string | null
          shrink_factor: number
          updated_at: string
          usage_unit: string
        }
        Insert: {
          business_unit: string
          category?: string | null
          content_per_purchase: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_updated_at?: string
          purchase_price: number
          purchase_unit: string
          shopee_url?: string | null
          shrink_factor?: number
          updated_at?: string
          usage_unit: string
        }
        Update: {
          business_unit?: string
          category?: string | null
          content_per_purchase?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_updated_at?: string
          purchase_price?: number
          purchase_unit?: string
          shopee_url?: string | null
          shrink_factor?: number
          updated_at?: string
          usage_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "costing_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_products: {
        Row: {
          business_unit: string
          category: string | null
          created_at: string
          created_by: string | null
          crew_fee: number
          depreciation_per_event: number
          id: string
          is_active: boolean
          labor: number
          labor_hours: number
          labor_mode: string
          labor_rate: number
          manual_price: number
          name: string
          overhead_method: string
          overhead_nominal: number
          overhead_percent: number
          packaging: number
          pos_product_id: string | null
          pos_variant_id: string | null
          price_method: string
          rounding_mode: string
          rounding_unit: number
          target_percent: number
          transport: number
          type: string
          updated_at: string
          yield_qty: number
          yield_unit: string | null
        }
        Insert: {
          business_unit: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          crew_fee?: number
          depreciation_per_event?: number
          id?: string
          is_active?: boolean
          labor?: number
          labor_hours?: number
          labor_mode?: string
          labor_rate?: number
          manual_price?: number
          name: string
          overhead_method?: string
          overhead_nominal?: number
          overhead_percent?: number
          packaging?: number
          pos_product_id?: string | null
          pos_variant_id?: string | null
          price_method?: string
          rounding_mode?: string
          rounding_unit?: number
          target_percent?: number
          transport?: number
          type?: string
          updated_at?: string
          yield_qty?: number
          yield_unit?: string | null
        }
        Update: {
          business_unit?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          crew_fee?: number
          depreciation_per_event?: number
          id?: string
          is_active?: boolean
          labor?: number
          labor_hours?: number
          labor_mode?: string
          labor_rate?: number
          manual_price?: number
          name?: string
          overhead_method?: string
          overhead_nominal?: number
          overhead_percent?: number
          packaging?: number
          pos_product_id?: string | null
          pos_variant_id?: string | null
          price_method?: string
          rounding_mode?: string
          rounding_unit?: number
          target_percent?: number
          transport?: number
          type?: string
          updated_at?: string
          yield_qty?: number
          yield_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costing_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_products_pos_product_id_fkey"
            columns: ["pos_product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_products_pos_variant_id_fkey"
            columns: ["pos_variant_id"]
            isOneToOne: false
            referencedRelation: "pos_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_recipe_items: {
        Row: {
          created_at: string
          id: string
          material_id: string
          product_id: string
          qty: number
          sort_order: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          product_id: string
          qty?: number
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          product_id?: string
          qty?: number
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "costing_recipe_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "costing_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_recipe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "costing_products"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_units: {
        Row: {
          code: string
          dimension: string
          label: string
          to_base: number
        }
        Insert: {
          code: string
          dimension: string
          label: string
          to_base: number
        }
        Update: {
          code?: string
          dimension?: string
          label?: string
          to_base?: number
        }
        Relationships: []
      }
      customer_complaints: {
        Row: {
          action_taken: string | null
          branch: string
          closed_at: string | null
          closed_by: string | null
          compensation: string | null
          created_at: string
          description: string
          id: string
          kind: string
          occurred_at: string
          product_or_tx_ref: string | null
          reported_by: string
          source: string
          status: string
        }
        Insert: {
          action_taken?: string | null
          branch: string
          closed_at?: string | null
          closed_by?: string | null
          compensation?: string | null
          created_at?: string
          description: string
          id?: string
          kind: string
          occurred_at?: string
          product_or_tx_ref?: string | null
          reported_by: string
          source?: string
          status?: string
        }
        Update: {
          action_taken?: string | null
          branch?: string
          closed_at?: string | null
          closed_by?: string | null
          compensation?: string | null
          created_at?: string
          description?: string
          id?: string
          kind?: string
          occurred_at?: string
          product_or_tx_ref?: string | null
          reported_by?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_complaints_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_complaints_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_complaints_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_complaints_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      disc_positions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
        }
        Relationships: []
      }
      disc_results: {
        Row: {
          answers: Json | null
          created_at: string
          created_by: string | null
          graph1: Json | null
          graph2: Json | null
          id: string
          imported_pdf_path: string | null
          least_counts: Json | null
          most_counts: Json | null
          pattern1_high: string | null
          pattern1_name: string | null
          pattern1_num: number | null
          pattern2_high: string | null
          pattern2_name: string | null
          pattern2_num: number | null
          position_label: string | null
          source: string
          taken_at: string
          user_id: string
        }
        Insert: {
          answers?: Json | null
          created_at?: string
          created_by?: string | null
          graph1?: Json | null
          graph2?: Json | null
          id?: string
          imported_pdf_path?: string | null
          least_counts?: Json | null
          most_counts?: Json | null
          pattern1_high?: string | null
          pattern1_name?: string | null
          pattern1_num?: number | null
          pattern2_high?: string | null
          pattern2_name?: string | null
          pattern2_num?: number | null
          position_label?: string | null
          source: string
          taken_at: string
          user_id: string
        }
        Update: {
          answers?: Json | null
          created_at?: string
          created_by?: string | null
          graph1?: Json | null
          graph2?: Json | null
          id?: string
          imported_pdf_path?: string | null
          least_counts?: Json | null
          most_counts?: Json | null
          pattern1_high?: string | null
          pattern1_name?: string | null
          pattern1_num?: number | null
          pattern2_high?: string | null
          pattern2_name?: string | null
          pattern2_num?: number | null
          position_label?: string | null
          source?: string
          taken_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disc_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disc_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disc_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disc_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      disc_settings: {
        Row: {
          id: number
          site_enabled: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          site_enabled?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          site_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      disc_submissions: {
        Row: {
          adapted_c: number
          adapted_d: number
          adapted_i: number
          adapted_primary: string
          adapted_s: number
          adapted_secondary: string | null
          answers: Json
          consent_at: string | null
          consent_given: boolean
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          is_reference: boolean
          natural_c: number
          natural_d: number
          natural_i: number
          natural_primary: string
          natural_s: number
          natural_secondary: string | null
          position_applied: string | null
        }
        Insert: {
          adapted_c: number
          adapted_d: number
          adapted_i: number
          adapted_primary: string
          adapted_s: number
          adapted_secondary?: string | null
          answers: Json
          consent_at?: string | null
          consent_given?: boolean
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          id?: string
          is_reference?: boolean
          natural_c: number
          natural_d: number
          natural_i: number
          natural_primary: string
          natural_s: number
          natural_secondary?: string | null
          position_applied?: string | null
        }
        Update: {
          adapted_c?: number
          adapted_d?: number
          adapted_i?: number
          adapted_primary?: string
          adapted_s?: number
          adapted_secondary?: string | null
          answers?: Json
          consent_at?: string | null
          consent_given?: boolean
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          is_reference?: boolean
          natural_c?: number
          natural_d?: number
          natural_i?: number
          natural_primary?: string
          natural_s?: number
          natural_secondary?: string | null
          position_applied?: string | null
        }
        Relationships: []
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
      employee_coaching_notes: {
        Row: {
          acknowledged_at: string | null
          author_id: string | null
          body: string
          context: string
          created_at: string
          employee_acceptance: string | null
          employee_response: string | null
          id: string
          period_from: string | null
          period_to: string | null
          sop_reference: string | null
          sp_level: string | null
          user_id: string
          valid_until: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          author_id?: string | null
          body: string
          context?: string
          created_at?: string
          employee_acceptance?: string | null
          employee_response?: string | null
          id?: string
          period_from?: string | null
          period_to?: string | null
          sop_reference?: string | null
          sp_level?: string | null
          user_id: string
          valid_until?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          author_id?: string | null
          body?: string
          context?: string
          created_at?: string
          employee_acceptance?: string | null
          employee_response?: string | null
          id?: string
          period_from?: string | null
          period_to?: string | null
          sop_reference?: string | null
          sp_level?: string | null
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_coaching_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_coaching_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_coaching_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_coaching_notes_user_id_fkey"
            columns: ["user_id"]
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
      employment_contract_templates: {
        Row: {
          body_markdown: string
          business_unit: string
          created_at: string
          created_by: string | null
          employer_alamat: string | null
          employer_jabatan: string | null
          employer_name: string | null
          employer_signature_path: string | null
          id: string
          is_active: boolean
          kota: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body_markdown?: string
          business_unit: string
          created_at?: string
          created_by?: string | null
          employer_alamat?: string | null
          employer_jabatan?: string | null
          employer_name?: string | null
          employer_signature_path?: string | null
          id?: string
          is_active?: boolean
          kota?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          body_markdown?: string
          business_unit?: string
          created_at?: string
          created_by?: string | null
          employer_alamat?: string | null
          employer_jabatan?: string | null
          employer_name?: string | null
          employer_signature_path?: string | null
          id?: string
          is_active?: boolean
          kota?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employment_contract_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contract_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_contracts: {
        Row: {
          archived_at: string | null
          body_markdown: string
          business_unit: string
          consent_ip: string | null
          consent_user_agent: string | null
          contract_number: string | null
          created_at: string
          created_by: string | null
          employee_signature_path: string | null
          employee_signed_at: string | null
          employee_signer_name: string | null
          employee_signer_nik: string | null
          employer_alamat: string | null
          employer_jabatan: string | null
          employer_name: string | null
          employer_signature_path: string | null
          fields: Json
          id: string
          kota: string | null
          lampiran: Json
          signed_pdf_path: string | null
          signed_version: number | null
          status: string
          template_id: string | null
          update_note: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          body_markdown?: string
          business_unit: string
          consent_ip?: string | null
          consent_user_agent?: string | null
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          employee_signature_path?: string | null
          employee_signed_at?: string | null
          employee_signer_name?: string | null
          employee_signer_nik?: string | null
          employer_alamat?: string | null
          employer_jabatan?: string | null
          employer_name?: string | null
          employer_signature_path?: string | null
          fields?: Json
          id?: string
          kota?: string | null
          lampiran?: Json
          signed_pdf_path?: string | null
          signed_version?: number | null
          status?: string
          template_id?: string | null
          update_note?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          body_markdown?: string
          business_unit?: string
          consent_ip?: string | null
          consent_user_agent?: string | null
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          employee_signature_path?: string | null
          employee_signed_at?: string | null
          employee_signer_name?: string | null
          employee_signer_nik?: string | null
          employer_alamat?: string | null
          employer_jabatan?: string | null
          employer_name?: string | null
          employer_signature_path?: string | null
          fields?: Json
          id?: string
          kota?: string | null
          lampiran?: Json
          signed_pdf_path?: string | null
          signed_version?: number | null
          status?: string
          template_id?: string | null
          update_note?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "employment_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "employment_contract_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_360_participants: {
        Row: {
          created_at: string
          id: string
          round_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          round_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_360_participants_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "evaluation_360_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_360_responses: {
        Row: {
          apresiasi: string
          created_at: string
          id: string
          metric_scores: Json
          notes: string
          rater_id: string
          round_id: string
          subject_id: string
          total_score: number
          updated_at: string
        }
        Insert: {
          apresiasi: string
          created_at?: string
          id?: string
          metric_scores: Json
          notes: string
          rater_id: string
          round_id: string
          subject_id: string
          total_score: number
          updated_at?: string
        }
        Update: {
          apresiasi?: string
          created_at?: string
          id?: string
          metric_scores?: Json
          notes?: string
          rater_id?: string
          round_id?: string
          subject_id?: string
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_360_responses_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_responses_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_responses_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "evaluation_360_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_responses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_responses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_360_rounds: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          status: string
          title: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          title: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_360_rounds_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_rounds_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_rounds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_rounds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_360_subject_notes: {
        Row: {
          cara_pengecekan: string | null
          id: string
          kesimpulan: string | null
          round_id: string
          subject_id: string
          target_completion_date: string | null
          target_perbaikan: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cara_pengecekan?: string | null
          id?: string
          kesimpulan?: string | null
          round_id: string
          subject_id: string
          target_completion_date?: string | null
          target_perbaikan?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cara_pengecekan?: string | null
          id?: string
          kesimpulan?: string | null
          round_id?: string
          subject_id?: string
          target_completion_date?: string | null
          target_perbaikan?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_360_subject_notes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "evaluation_360_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_subject_notes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_subject_notes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_subject_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_360_subject_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
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
      hr_grievances: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          description: string
          desired_outcome: string | null
          id: string
          is_anonymous: boolean
          is_harassment_or_violence: boolean
          reported_about_user_id: string | null
          reporter_id: string
          status: string
          tier: number
          witnesses: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          description: string
          desired_outcome?: string | null
          id?: string
          is_anonymous?: boolean
          is_harassment_or_violence?: boolean
          reported_about_user_id?: string | null
          reporter_id: string
          status?: string
          tier: number
          witnesses?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          description?: string
          desired_outcome?: string | null
          id?: string
          is_anonymous?: boolean
          is_harassment_or_violence?: boolean
          reported_about_user_id?: string | null
          reporter_id?: string
          status?: string
          tier?: number
          witnesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_grievances_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grievances_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grievances_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grievances_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grievances_reported_about_user_id_fkey"
            columns: ["reported_about_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grievances_reported_about_user_id_fkey"
            columns: ["reported_about_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grievances_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grievances_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_trusted_contacts: {
        Row: {
          added_by: string | null
          created_at: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_trusted_contacts_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_trusted_contacts_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_trusted_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_trusted_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_bep_baseline: {
        Row: {
          amount_idr: number
          contract_id: string
          frozen_at: string
          frozen_by: string | null
          method: string
          through_ym: string
        }
        Insert: {
          amount_idr: number
          contract_id: string
          frozen_at?: string
          frozen_by?: string | null
          method: string
          through_ym: string
        }
        Update: {
          amount_idr?: number
          contract_id?: string
          frozen_at?: string
          frozen_by?: string | null
          method?: string
          through_ym?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_bep_baseline_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "investor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_bep_baseline_frozen_by_fkey"
            columns: ["frozen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_bep_baseline_frozen_by_fkey"
            columns: ["frozen_by"]
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
          branch: string | null
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
          branch?: string | null
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
          branch?: string | null
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
          alloc_id: string | null
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
          source: string
        }
        Insert: {
          alloc_id?: string | null
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
          source?: string
        }
        Update: {
          alloc_id?: string | null
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
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_payouts_alloc_id_fkey"
            columns: ["alloc_id"]
            isOneToOne: false
            referencedRelation: "yeobo_dividend_allocations"
            referencedColumns: ["id"]
          },
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
      iq_submissions: {
        Row: {
          answers: Json
          band_label: string
          by_category: Json
          consent_at: string | null
          consent_given: boolean
          correct: number
          created_at: string
          date_of_birth: string
          full_name: string
          id: string
          percent: number
          position_applied: string | null
          reasoning_index: number
          tab_switches: number
          total: number
        }
        Insert: {
          answers: Json
          band_label: string
          by_category: Json
          consent_at?: string | null
          consent_given?: boolean
          correct: number
          created_at?: string
          date_of_birth: string
          full_name: string
          id?: string
          percent: number
          position_applied?: string | null
          reasoning_index: number
          tab_switches?: number
          total: number
        }
        Update: {
          answers?: Json
          band_label?: string
          by_category?: Json
          consent_at?: string | null
          consent_given?: boolean
          correct?: number
          created_at?: string
          date_of_birth?: string
          full_name?: string
          id?: string
          percent?: number
          position_applied?: string | null
          reasoning_index?: number
          tab_switches?: number
          total?: number
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          approver_id: string | null
          approver_note: string | null
          backup_user_id: string | null
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          planned_return: string | null
          reason: string
          status: string
          swap_date: string | null
          swap_with_user_id: string | null
          user_id: string
        }
        Insert: {
          approver_id?: string | null
          approver_note?: string | null
          backup_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          kind: string
          planned_return?: string | null
          reason: string
          status?: string
          swap_date?: string | null
          swap_with_user_id?: string | null
          user_id: string
        }
        Update: {
          approver_id?: string | null
          approver_note?: string | null
          backup_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          planned_return?: string | null
          reason?: string
          status?: string
          swap_date?: string | null
          swap_with_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_backup_user_id_fkey"
            columns: ["backup_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_backup_user_id_fkey"
            columns: ["backup_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_swap_with_user_id_fkey"
            columns: ["swap_with_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_swap_with_user_id_fkey"
            columns: ["swap_with_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_accounts: {
        Row: {
          branch: string | null
          business_unit: string
          created_at: string
          created_by: string | null
          id: string
          linked_phone: string | null
          login: string
          login_url: string | null
          notes: string | null
          password_secret_id: string
          service: string
          updated_at: string
        }
        Insert: {
          branch?: string | null
          business_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          linked_phone?: string | null
          login: string
          login_url?: string | null
          notes?: string | null
          password_secret_id: string
          service: string
          updated_at?: string
        }
        Update: {
          branch?: string | null
          business_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          linked_phone?: string | null
          login?: string
          login_url?: string | null
          notes?: string | null
          password_secret_id?: string
          service?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_ads_viewers: {
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
            foreignKeyName: "meta_ads_viewers_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_viewers_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_viewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_viewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      national_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      offboarding_checklists: {
        Row: {
          created_at: string
          effective_at: string
          id: string
          pos_pin_revoked_at: string | null
          team_memberships_removed_at: string | null
          tester_roles_revoked_at: string | null
          triggered_by: string
          trusted_contact_removed_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          effective_at?: string
          id?: string
          pos_pin_revoked_at?: string | null
          team_memberships_removed_at?: string | null
          tester_roles_revoked_at?: string | null
          triggered_by: string
          trusted_contact_removed_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          id?: string
          pos_pin_revoked_at?: string | null
          team_memberships_removed_at?: string | null
          tester_roles_revoked_at?: string | null
          triggered_by?: string
          trusted_contact_removed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offboarding_checklists_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_checklists_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_checklists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_checklists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      offboarding_manual_items: {
        Row: {
          checklist_id: string
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          note: string | null
        }
        Insert: {
          checklist_id: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label: string
          note?: string | null
        }
        Update: {
          checklist_id?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offboarding_manual_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "offboarding_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_manual_items_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_manual_items_done_by_fkey"
            columns: ["done_by"]
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
      password_reset_requests: {
        Row: {
          created_at: string
          email_hash: string
          id: string
          ip: string | null
        }
        Insert: {
          created_at?: string
          email_hash: string
          id?: string
          ip?: string | null
        }
        Update: {
          created_at?: string
          email_hash?: string
          id?: string
          ip?: string | null
        }
        Relationships: []
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
          bonus_day_hourly: boolean
          calculation_basis: string
          created_at: string | null
          deliverables_weight_pct: number
          expected_days_mode: string
          expected_pair_anchor: string | null
          expected_pair_primary: boolean
          expected_pair_together: number[]
          expected_pair_user_id: string | null
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
          monthly_overtime_enabled: boolean
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
          bonus_day_hourly?: boolean
          calculation_basis?: string
          created_at?: string | null
          deliverables_weight_pct?: number
          expected_days_mode?: string
          expected_pair_anchor?: string | null
          expected_pair_primary?: boolean
          expected_pair_together?: number[]
          expected_pair_user_id?: string | null
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
          monthly_overtime_enabled?: boolean
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
          bonus_day_hourly?: boolean
          calculation_basis?: string
          created_at?: string | null
          deliverables_weight_pct?: number
          expected_days_mode?: string
          expected_pair_anchor?: string | null
          expected_pair_primary?: boolean
          expected_pair_together?: number[]
          expected_pair_user_id?: string | null
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
          monthly_overtime_enabled?: boolean
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
            foreignKeyName: "payslip_settings_expected_pair_user_id_fkey"
            columns: ["expected_pair_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_settings_expected_pair_user_id_fkey"
            columns: ["expected_pair_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
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
          bonus_day_pay: number
          breakdown_json: Json | null
          cake_bonus: number
          cake_bonus_note: string | null
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
          bonus_day_pay?: number
          breakdown_json?: Json | null
          cake_bonus?: number
          cake_bonus_note?: string | null
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
          bonus_day_pay?: number
          breakdown_json?: Json | null
          cake_bonus?: number
          cake_bonus_note?: string | null
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
      pos_operation_authorizers: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          bank_account_id: string
          operation: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          bank_account_id: string
          operation: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          bank_account_id?: string
          operation?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_operation_authorizers_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_operation_authorizers_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_operation_authorizers_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_operation_authorizers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_operation_authorizers_user_id_fkey"
            columns: ["user_id"]
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
          requires_sugar_level: boolean
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
          requires_sugar_level?: boolean
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
          requires_sugar_level?: boolean
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
          requires_sugar_level: boolean
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
          requires_sugar_level?: boolean
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
          requires_sugar_level?: boolean
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
          original_unit_price: number | null
          product_id: string | null
          product_name: string
          qty: number
          sale_id: string
          subtotal: number
          sugar_level: string | null
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          fulfillment_type?: string | null
          id?: string
          original_unit_price?: number | null
          product_id?: string | null
          product_name: string
          qty: number
          sale_id: string
          subtotal: number
          sugar_level?: string | null
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          fulfillment_type?: string | null
          id?: string
          original_unit_price?: number | null
          product_id?: string | null
          product_name?: string
          qty?: number
          sale_id?: string
          subtotal?: number
          sugar_level?: string | null
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
          cashier_id: string | null
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
          qris_verification: string | null
          pending_at: string | null
          sale_date: string
          sale_time: string
          settled_at: string | null
          settled_by: string | null
          settled_via: string | null
          shift_id: string | null
          total: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_by_name: string | null
        }
        Insert: {
          bank_account_id: string
          cashflow_transaction_id?: string | null
          cashier_id?: string | null
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
          qris_verification?: string | null
          pending_at?: string | null
          sale_date: string
          sale_time?: string
          settled_at?: string | null
          settled_by?: string | null
          settled_via?: string | null
          shift_id?: string | null
          total: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_name?: string | null
        }
        Update: {
          bank_account_id?: string
          cashflow_transaction_id?: string | null
          cashier_id?: string | null
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
          qris_verification?: string | null
          pending_at?: string | null
          sale_date?: string
          sale_time?: string
          settled_at?: string | null
          settled_by?: string | null
          settled_via?: string | null
          shift_id?: string | null
          total?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_name?: string | null
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
            foreignKeyName: "pos_sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
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
          {
            foreignKeyName: "pos_sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_service_level_daily: {
        Row: {
          bank_account_id: string
          close_hour: number
          computed_at: string
          detail_json: Json | null
          had_activity: boolean
          has_baseline: boolean
          open_hour: number
          partial_opname: boolean
          percent: number | null
          ready_sum: number
          sample_count: number
          snapshot_date: string
          source: string
          tracked_skus: number
        }
        Insert: {
          bank_account_id: string
          close_hour: number
          computed_at?: string
          detail_json?: Json | null
          had_activity?: boolean
          has_baseline?: boolean
          open_hour: number
          partial_opname?: boolean
          percent?: number | null
          ready_sum: number
          sample_count: number
          snapshot_date: string
          source?: string
          tracked_skus: number
        }
        Update: {
          bank_account_id?: string
          close_hour?: number
          computed_at?: string
          detail_json?: Json | null
          had_activity?: boolean
          has_baseline?: boolean
          open_hour?: number
          partial_opname?: boolean
          percent?: number | null
          ready_sum?: number
          sample_count?: number
          snapshot_date?: string
          source?: string
          tracked_skus?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_service_level_daily_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_service_level_exclusions: {
        Row: {
          bank_account_id: string
          created_at: string
          created_by: string | null
          excluded_from: string
          excluded_until: string | null
          id: string
          product_id: string
          reason: string | null
          variant_id: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          excluded_from: string
          excluded_until?: string | null
          id?: string
          product_id: string
          reason?: string | null
          variant_id?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          excluded_from?: string
          excluded_until?: string | null
          id?: string
          product_id?: string
          reason?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_service_level_exclusions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_service_level_exclusions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_service_level_exclusions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_service_level_exclusions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_service_level_exclusions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "pos_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_service_level_owners: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          bank_account_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          bank_account_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          bank_account_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_service_level_owners_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_service_level_owners_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_service_level_owners_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_service_level_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_service_level_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shift_expenses: {
        Row: {
          amount: number
          cashflow_transaction_id: string | null
          category: string
          created_at: string
          entered_by: string
          id: string
          note: string
          phase: string
          photo_path: string | null
          shift_id: string
        }
        Insert: {
          amount: number
          cashflow_transaction_id?: string | null
          category: string
          created_at?: string
          entered_by: string
          id?: string
          note: string
          phase: string
          photo_path?: string | null
          shift_id: string
        }
        Update: {
          amount?: number
          cashflow_transaction_id?: string | null
          category?: string
          created_at?: string
          entered_by?: string
          id?: string
          note?: string
          phase?: string
          photo_path?: string | null
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_shift_expenses_cashflow_transaction_id_fkey"
            columns: ["cashflow_transaction_id"]
            isOneToOne: false
            referencedRelation: "cashflow_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_expenses_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_expenses_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_expenses_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shifts: {
        Row: {
          bank_account_id: string
          cashier_id: string
          close_cash_counted: number | null
          close_cash_withdrawn: number
          close_cash_diff: number | null
          close_cash_expected: number | null
          close_notes: string | null
          close_opname_id: string | null
          closed_at: string | null
          closed_by_user: string | null
          created_at: string
          force_reason: string | null
          forced_by: string | null
          id: string
          incidental_report: Json | null
          open_cash_counted: number
          open_cash_diff: number | null
          open_cash_expected: number | null
          open_notes: string | null
          open_opname_id: string | null
          opened_at: string
          opened_by_user: string | null
          status: string
        }
        Insert: {
          bank_account_id: string
          cashier_id: string
          close_cash_counted?: number | null
          close_cash_withdrawn?: number
          close_cash_diff?: number | null
          close_cash_expected?: number | null
          close_notes?: string | null
          close_opname_id?: string | null
          closed_at?: string | null
          closed_by_user?: string | null
          created_at?: string
          force_reason?: string | null
          forced_by?: string | null
          id?: string
          incidental_report?: Json | null
          open_cash_counted: number
          open_cash_diff?: number | null
          open_cash_expected?: number | null
          open_notes?: string | null
          open_opname_id?: string | null
          opened_at?: string
          opened_by_user?: string | null
          status?: string
        }
        Update: {
          bank_account_id?: string
          cashier_id?: string
          close_cash_counted?: number | null
          close_cash_withdrawn?: number
          close_cash_diff?: number | null
          close_cash_expected?: number | null
          close_notes?: string | null
          close_opname_id?: string | null
          closed_at?: string | null
          closed_by_user?: string | null
          created_at?: string
          force_reason?: string | null
          forced_by?: string | null
          id?: string
          incidental_report?: Json | null
          open_cash_counted?: number
          open_cash_diff?: number | null
          open_cash_expected?: number | null
          open_notes?: string | null
          open_opname_id?: string | null
          opened_at?: string
          opened_by_user?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_shifts_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_close_opname_id_fkey"
            columns: ["close_opname_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_opnames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_closed_by_user_fkey"
            columns: ["closed_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_closed_by_user_fkey"
            columns: ["closed_by_user"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_forced_by_fkey"
            columns: ["forced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_forced_by_fkey"
            columns: ["forced_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_open_opname_id_fkey"
            columns: ["open_opname_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_opnames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_opened_by_user_fkey"
            columns: ["opened_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_opened_by_user_fkey"
            columns: ["opened_by_user"]
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
          needs_approval: boolean
          notes: string | null
          product_id: string
          qty: number
          type: string
          variant_id: string | null
          withdrawal_reason: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date: string
          movement_time?: string | null
          needs_approval?: boolean
          notes?: string | null
          product_id: string
          qty: number
          type: string
          variant_id?: string | null
          withdrawal_reason?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          movement_time?: string | null
          needs_approval?: boolean
          notes?: string | null
          product_id?: string
          qty?: number
          type?: string
          variant_id?: string | null
          withdrawal_reason?: string | null
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
          performed_by: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opname_date: string
          opname_time?: string | null
          performed_by?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opname_date?: string
          opname_time?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_opnames_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_opnames_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_opnames_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          business_unit: string
          notes: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          business_unit: string
          notes?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          business_unit?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_settings: {
        Row: {
          created_at: string
          holding_rate_annual: number
          id: string
          ordering_cost: number
          review_period_days: number
          service_level: number
          updated_at: string
          updated_by: string | null
          usage_cv: number
        }
        Insert: {
          created_at?: string
          holding_rate_annual?: number
          id?: string
          ordering_cost?: number
          review_period_days?: number
          service_level?: number
          updated_at?: string
          updated_by?: string | null
          usage_cv?: number
        }
        Update: {
          created_at?: string
          holding_rate_annual?: number
          id?: string
          ordering_cost?: number
          review_period_days?: number
          service_level?: number
          updated_at?: string
          updated_by?: string | null
          usage_cv?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_cards: {
        Row: {
          id: string
          method_temp_time: string | null
          pass_criteria: string | null
          product_name: string
          reference_photo_path: string | null
          shelf_life_days: number | null
          storage_method: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          method_temp_time?: string | null
          pass_criteria?: string | null
          product_name: string
          reference_photo_path?: string | null
          shelf_life_days?: number | null
          storage_method?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          method_temp_time?: string | null
          pass_criteria?: string | null
          product_name?: string
          reference_photo_path?: string | null
          shelf_life_days?: number | null
          storage_method?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_cards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_experiments: {
        Row: {
          attempt_number: number
          created_at: string
          decision: string | null
          estimated_hpp: number | null
          id: string
          idea_id: string
          imagined_price: number | null
          photo_path: string | null
          recipe_change: string | null
          recorded_by: string
          result_notes: string | null
        }
        Insert: {
          attempt_number: number
          created_at?: string
          decision?: string | null
          estimated_hpp?: number | null
          id?: string
          idea_id: string
          imagined_price?: number | null
          photo_path?: string | null
          recipe_change?: string | null
          recorded_by: string
          result_notes?: string | null
        }
        Update: {
          attempt_number?: number
          created_at?: string
          decision?: string | null
          estimated_hpp?: number | null
          id?: string
          idea_id?: string
          imagined_price?: number | null
          photo_path?: string | null
          recipe_change?: string | null
          recorded_by?: string
          result_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_experiments_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "product_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_experiments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_experiments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ideas: {
        Row: {
          branch: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          ingredients: string | null
          portion_count: number | null
          proposed_by: string
          purpose: string | null
          status: string
          target_date: string | null
          title: string
        }
        Insert: {
          branch: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          ingredients?: string | null
          portion_count?: number | null
          proposed_by: string
          purpose?: string | null
          status?: string
          target_date?: string | null
          title: string
        }
        Update: {
          branch?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          ingredients?: string | null
          portion_count?: number | null
          proposed_by?: string
          purpose?: string | null
          status?: string
          target_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_ideas_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ideas_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ideas_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ideas_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_testers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch: string
          created_at: string
          id: string
          proposed_by: string
          status: string
          testing_scope: string | null
          user_id: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch: string
          created_at?: string
          id?: string
          proposed_by: string
          status?: string
          testing_scope?: string | null
          user_id: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch?: string
          created_at?: string
          id?: string
          proposed_by?: string
          status?: string
          testing_scope?: string | null
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_testers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_testers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_testers_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_testers_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_testers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_testers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
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
          break_enabled: boolean
          break_windows: Json
          business_unit: string | null
          created_at: string
          current_city: string | null
          date_of_birth: string | null
          department: string
          disc_test_required: boolean
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
          holiday_bonus_enabled: boolean
          id: string
          is_active: boolean
          is_flexible_schedule: boolean
          is_probation: boolean
          job_role: string | null
          motto: string | null
          nickname: string | null
          nik: string | null
          npwp: string | null
          payslip_excluded: boolean
          place_of_birth: string | null
          pos_pin_hash: string | null
          position: string
          push_notification_exempt: boolean
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
          break_enabled?: boolean
          break_windows?: Json
          business_unit?: string | null
          created_at?: string
          current_city?: string | null
          date_of_birth?: string | null
          department?: string
          disc_test_required?: boolean
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
          holiday_bonus_enabled?: boolean
          id: string
          is_active?: boolean
          is_flexible_schedule?: boolean
          is_probation?: boolean
          job_role?: string | null
          motto?: string | null
          nickname?: string | null
          nik?: string | null
          npwp?: string | null
          payslip_excluded?: boolean
          place_of_birth?: string | null
          pos_pin_hash?: string | null
          position?: string
          push_notification_exempt?: boolean
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
          break_enabled?: boolean
          break_windows?: Json
          business_unit?: string | null
          created_at?: string
          current_city?: string | null
          date_of_birth?: string | null
          department?: string
          disc_test_required?: boolean
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
          holiday_bonus_enabled?: boolean
          id?: string
          is_active?: boolean
          is_flexible_schedule?: boolean
          is_probation?: boolean
          job_role?: string | null
          motto?: string | null
          nickname?: string | null
          nik?: string | null
          npwp?: string | null
          payslip_excluded?: boolean
          place_of_birth?: string | null
          pos_pin_hash?: string | null
          position?: string
          push_notification_exempt?: boolean
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
      pulse_survey_responses: {
        Row: {
          answers: Json
          branch: string | null
          created_at: string
          id: string
          period: string
          survey_type: string
        }
        Insert: {
          answers: Json
          branch?: string | null
          created_at?: string
          id?: string
          period: string
          survey_type: string
        }
        Update: {
          answers?: Json
          branch?: string | null
          created_at?: string
          id?: string
          period?: string
          survey_type?: string
        }
        Relationships: []
      }
      pulse_survey_tokens: {
        Row: {
          created_at: string
          period: string
          survey_type: string
          token: string
        }
        Insert: {
          created_at?: string
          period: string
          survey_type: string
          token: string
        }
        Update: {
          created_at?: string
          period?: string
          survey_type?: string
          token?: string
        }
        Relationships: []
      }
      push_send_logs: {
        Row: {
          configured: boolean
          created_at: string
          delivered_count: number
          id: string
          pruned_count: number
          targeted_count: number
          title: string
        }
        Insert: {
          configured?: boolean
          created_at?: string
          delivered_count?: number
          id?: string
          pruned_count?: number
          targeted_count?: number
          title: string
        }
        Update: {
          configured?: boolean
          created_at?: string
          delivered_count?: number
          id?: string
          pruned_count?: number
          targeted_count?: number
          title?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          last_clicked_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          last_clicked_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          last_clicked_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      revenue_dashboard_viewers: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          notes: string | null
          scope: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          notes?: string | null
          scope: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          notes?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_dashboard_viewers_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_dashboard_viewers_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_dashboard_viewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_dashboard_viewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
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
        Relationships: [
          {
            foreignKeyName: "revenue_month_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_month_allocations_created_by_fkey"
            columns: ["created_by"]
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
      sim_card_topups: {
        Row: {
          amount_idr: number | null
          created_at: string
          id: string
          new_active_until: string | null
          new_grace_until: string | null
          note: string | null
          proof_path: string | null
          sim_card_id: string
          topped_up_by: string | null
        }
        Insert: {
          amount_idr?: number | null
          created_at?: string
          id?: string
          new_active_until?: string | null
          new_grace_until?: string | null
          note?: string | null
          proof_path?: string | null
          sim_card_id: string
          topped_up_by?: string | null
        }
        Update: {
          amount_idr?: number | null
          created_at?: string
          id?: string
          new_active_until?: string | null
          new_grace_until?: string | null
          note?: string | null
          proof_path?: string | null
          sim_card_id?: string
          topped_up_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sim_card_topups_sim_card_id_fkey"
            columns: ["sim_card_id"]
            isOneToOne: false
            referencedRelation: "sim_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_card_topups_topped_up_by_fkey"
            columns: ["topped_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_card_topups_topped_up_by_fkey"
            columns: ["topped_up_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_cards: {
        Row: {
          active_until: string | null
          business_unit_id: string
          created_at: string
          created_by: string | null
          grace_until: string | null
          id: string
          is_active: boolean
          label: string | null
          notes: string | null
          phone_number: string
          pic_name: string | null
          pic_phone: string | null
          pic_user_id: string | null
          provider: string | null
          updated_at: string
        }
        Insert: {
          active_until?: string | null
          business_unit_id: string
          created_at?: string
          created_by?: string | null
          grace_until?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          notes?: string | null
          phone_number: string
          pic_name?: string | null
          pic_phone?: string | null
          pic_user_id?: string | null
          provider?: string | null
          updated_at?: string
        }
        Update: {
          active_until?: string | null
          business_unit_id?: string
          created_at?: string
          created_by?: string | null
          grace_until?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          notes?: string | null
          phone_number?: string
          pic_name?: string | null
          pic_phone?: string | null
          pic_user_id?: string | null
          provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_cards_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_cards_pic_user_id_fkey"
            columns: ["pic_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_cards_pic_user_id_fkey"
            columns: ["pic_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      social_account_credentials: {
        Row: {
          access_token: string | null
          account_id: string
          created_at: string
          enc_version: number
          expires_at: string | null
          external_user_id: string | null
          last_refresh_error: string | null
          last_refreshed_at: string | null
          refresh_expires_at: string | null
          refresh_failure_count: number
          refresh_token: string | null
          scopes: string | null
          token_type: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id: string
          created_at?: string
          enc_version?: number
          expires_at?: string | null
          external_user_id?: string | null
          last_refresh_error?: string | null
          last_refreshed_at?: string | null
          refresh_expires_at?: string | null
          refresh_failure_count?: number
          refresh_token?: string | null
          scopes?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string
          created_at?: string
          enc_version?: number
          expires_at?: string | null
          external_user_id?: string | null
          last_refresh_error?: string | null
          last_refreshed_at?: string | null
          refresh_expires_at?: string | null
          refresh_failure_count?: number
          refresh_token?: string | null
          scopes?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_account_credentials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_account_metrics: {
        Row: {
          account_id: string
          accounts_engaged: number | null
          captured_at: string
          captured_date: string
          created_at: string
          follower_count: number | null
          following_count: number | null
          id: string
          impressions: number | null
          likes_total: number | null
          media_count: number | null
          new_followers: number | null
          profile_views: number | null
          raw: Json
          reach: number | null
          source: string
          website_clicks: number | null
        }
        Insert: {
          account_id: string
          accounts_engaged?: number | null
          captured_at?: string
          captured_date: string
          created_at?: string
          follower_count?: number | null
          following_count?: number | null
          id?: string
          impressions?: number | null
          likes_total?: number | null
          media_count?: number | null
          new_followers?: number | null
          profile_views?: number | null
          raw?: Json
          reach?: number | null
          source: string
          website_clicks?: number | null
        }
        Update: {
          account_id?: string
          accounts_engaged?: number | null
          captured_at?: string
          captured_date?: string
          created_at?: string
          follower_count?: number | null
          following_count?: number | null
          id?: string
          impressions?: number | null
          likes_total?: number | null
          media_count?: number | null
          new_followers?: number | null
          profile_views?: number | null
          raw?: Json
          reach?: number | null
          source?: string
          website_clicks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_account_metrics_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          backfill_done_through: string | null
          business_unit_id: string
          created_at: string
          created_by: string | null
          default_creator_id: string | null
          display_name: string | null
          external_account_id: string | null
          follower_count_cache: number | null
          handle: string
          id: string
          is_active: boolean
          last_sync_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          manager_id: string | null
          platform: string
          provider: string
          provider_config: Json
          sync_enabled: boolean
          token_expires_at: string | null
          token_refresh_failures: number
          token_status: string | null
          updated_at: string
        }
        Insert: {
          backfill_done_through?: string | null
          business_unit_id: string
          created_at?: string
          created_by?: string | null
          default_creator_id?: string | null
          display_name?: string | null
          external_account_id?: string | null
          follower_count_cache?: number | null
          handle: string
          id?: string
          is_active?: boolean
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          manager_id?: string | null
          platform: string
          provider?: string
          provider_config?: Json
          sync_enabled?: boolean
          token_expires_at?: string | null
          token_refresh_failures?: number
          token_status?: string | null
          updated_at?: string
        }
        Update: {
          backfill_done_through?: string | null
          business_unit_id?: string
          created_at?: string
          created_by?: string | null
          default_creator_id?: string | null
          display_name?: string | null
          external_account_id?: string | null
          follower_count_cache?: number | null
          handle?: string
          id?: string
          is_active?: boolean
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          manager_id?: string | null
          platform?: string
          provider?: string
          provider_config?: Json
          sync_enabled?: boolean
          token_expires_at?: string | null
          token_refresh_failures?: number
          token_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_default_creator_id_fkey"
            columns: ["default_creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_default_creator_id_fkey"
            columns: ["default_creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      social_kpi_targets: {
        Row: {
          account_id: string | null
          business_unit_id: string | null
          comparator: string
          created_at: string
          created_by: string | null
          creator_id: string | null
          id: string
          is_active: boolean
          metric_key: string
          notes: string | null
          period_end: string | null
          period_start: string
          period_type: string
          scope: string
          target_value: number
          updated_at: string
          weight: number
        }
        Insert: {
          account_id?: string | null
          business_unit_id?: string | null
          comparator?: string
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          id?: string
          is_active?: boolean
          metric_key: string
          notes?: string | null
          period_end?: string | null
          period_start: string
          period_type?: string
          scope: string
          target_value: number
          updated_at?: string
          weight?: number
        }
        Update: {
          account_id?: string | null
          business_unit_id?: string | null
          comparator?: string
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          id?: string
          is_active?: boolean
          metric_key?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string
          period_type?: string
          scope?: string
          target_value?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "social_kpi_targets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_kpi_targets_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_kpi_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_kpi_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_kpi_targets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_kpi_targets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_metrics: {
        Row: {
          age_minutes: number
          avg_watch_time_seconds: number | null
          captured_at: string
          comments: number | null
          created_at: string
          follows: number | null
          full_video_watched_rate: number | null
          id: string
          impressions: number | null
          likes: number | null
          plays: number | null
          post_id: string
          profile_visits: number | null
          raw: Json
          reach: number | null
          saves: number | null
          shares: number | null
          slot: string
          source: string
          views: number | null
          watch_time_seconds: number | null
        }
        Insert: {
          age_minutes: number
          avg_watch_time_seconds?: number | null
          captured_at?: string
          comments?: number | null
          created_at?: string
          follows?: number | null
          full_video_watched_rate?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          plays?: number | null
          post_id: string
          profile_visits?: number | null
          raw?: Json
          reach?: number | null
          saves?: number | null
          shares?: number | null
          slot: string
          source: string
          views?: number | null
          watch_time_seconds?: number | null
        }
        Update: {
          age_minutes?: number
          avg_watch_time_seconds?: number | null
          captured_at?: string
          comments?: number | null
          created_at?: string
          follows?: number | null
          full_video_watched_rate?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          plays?: number | null
          post_id?: string
          profile_visits?: number | null
          raw?: Json
          reach?: number | null
          saves?: number | null
          shares?: number | null
          slot?: string
          source?: string
          views?: number | null
          watch_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          account_id: string
          caption: string | null
          comments: number | null
          created_at: string
          creator_id: string | null
          creator_source: string
          duration_seconds: number | null
          engagement_rate: number | null
          external_post_id: string
          first_seen_at: string
          hashtags: string[] | null
          id: string
          impressions: number | null
          is_deleted: boolean
          likes: number | null
          media_type: string | null
          metrics_updated_at: string | null
          permalink: string | null
          platform: string
          plays: number | null
          published_at: string
          published_date: string | null
          raw: Json
          reach: number | null
          saves: number | null
          shares: number | null
          thumbnail_url: string | null
          updated_at: string
          views: number | null
        }
        Insert: {
          account_id: string
          caption?: string | null
          comments?: number | null
          created_at?: string
          creator_id?: string | null
          creator_source?: string
          duration_seconds?: number | null
          engagement_rate?: number | null
          external_post_id: string
          first_seen_at?: string
          hashtags?: string[] | null
          id?: string
          impressions?: number | null
          is_deleted?: boolean
          likes?: number | null
          media_type?: string | null
          metrics_updated_at?: string | null
          permalink?: string | null
          platform: string
          plays?: number | null
          published_at: string
          published_date?: string | null
          raw?: Json
          reach?: number | null
          saves?: number | null
          shares?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          views?: number | null
        }
        Update: {
          account_id?: string
          caption?: string | null
          comments?: number | null
          created_at?: string
          creator_id?: string | null
          creator_source?: string
          duration_seconds?: number | null
          engagement_rate?: number | null
          external_post_id?: string
          first_seen_at?: string
          hashtags?: string[] | null
          id?: string
          impressions?: number | null
          is_deleted?: boolean
          likes?: number | null
          media_type?: string | null
          metrics_updated_at?: string | null
          permalink?: string | null
          platform?: string
          plays?: number | null
          published_at?: string
          published_date?: string | null
          raw?: Json
          reach?: number | null
          saves?: number | null
          shares?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      social_sync_runs: {
        Row: {
          account_id: string | null
          api_calls: number
          error_detail: string | null
          error_reason: string | null
          finished_at: string | null
          id: string
          kind: string
          metric_rows: number
          posts_seen: number
          posts_upserted: number
          provider: string | null
          started_at: string
          status: string
          summary: Json
        }
        Insert: {
          account_id?: string | null
          api_calls?: number
          error_detail?: string | null
          error_reason?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          metric_rows?: number
          posts_seen?: number
          posts_upserted?: number
          provider?: string | null
          started_at?: string
          status?: string
          summary?: Json
        }
        Update: {
          account_id?: string | null
          api_calls?: number
          error_detail?: string | null
          error_reason?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          metric_rows?: number
          posts_seen?: number
          posts_upserted?: number
          provider?: string | null
          started_at?: string
          status?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "social_sync_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_document_acknowledgments: {
        Row: {
          acknowledged_at: string
          document_id: string
          id: string
          user_id: string
          version: number
        }
        Insert: {
          acknowledged_at?: string
          document_id: string
          id?: string
          user_id: string
          version: number
        }
        Update: {
          acknowledged_at?: string
          document_id?: string
          id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_document_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sop_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_document_acknowledgments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_document_acknowledgments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_documents: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          title: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_heads: {
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
            foreignKeyName: "studio_heads_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_heads_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_heads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_heads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_allocations: {
        Row: {
          amount_idr: number
          branch: string | null
          business_unit: string
          created_at: string
          id: string
          subscription_id: string
        }
        Insert: {
          amount_idr: number
          branch?: string | null
          business_unit: string
          created_at?: string
          id?: string
          subscription_id: string
        }
        Update: {
          amount_idr?: number
          branch?: string | null
          business_unit?: string
          created_at?: string
          id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_allocations_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_idr: number
          billing_cycle: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          next_renewal_date: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount_idr: number
          billing_cycle?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          next_renewal_date?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount_idr?: number
          billing_cycle?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          next_renewal_date?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_huddles: {
        Row: {
          branch: string
          created_at: string
          huddle_date: string
          id: string
          posted_by: string
          target_today: string
          who_holds_what: string | null
          yesterday_blocker: string | null
        }
        Insert: {
          branch: string
          created_at?: string
          huddle_date: string
          id?: string
          posted_by: string
          target_today: string
          who_holds_what?: string | null
          yesterday_blocker?: string | null
        }
        Update: {
          branch?: string
          created_at?: string
          huddle_date?: string
          id?: string
          posted_by?: string
          target_today?: string
          who_holds_what?: string | null
          yesterday_blocker?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_huddles_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_huddles_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          created_by: string | null
          leader_id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          leader_id: string
          member_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          leader_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_minutes_acks: {
        Row: {
          acked_at: string
          minutes_id: string
          minutes_kind: string
          user_id: string
        }
        Insert: {
          acked_at?: string
          minutes_id: string
          minutes_kind: string
          user_id: string
        }
        Update: {
          acked_at?: string
          minutes_id?: string
          minutes_kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_minutes_acks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_minutes_acks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_weekly_minutes: {
        Row: {
          branch: string
          created_at: string
          fix_deadline: string | null
          fix_description: string | null
          fix_owner_id: string | null
          id: string
          posted_by: string
          problem_analyzed: string | null
          requests_to_owner: string | null
          scorecard_note: string | null
          week_start: string
        }
        Insert: {
          branch: string
          created_at?: string
          fix_deadline?: string | null
          fix_description?: string | null
          fix_owner_id?: string | null
          id?: string
          posted_by: string
          problem_analyzed?: string | null
          requests_to_owner?: string | null
          scorecard_note?: string | null
          week_start: string
        }
        Update: {
          branch?: string
          created_at?: string
          fix_deadline?: string | null
          fix_description?: string | null
          fix_owner_id?: string | null
          id?: string
          posted_by?: string
          problem_analyzed?: string | null
          requests_to_owner?: string | null
          scorecard_note?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_weekly_minutes_fix_owner_id_fkey"
            columns: ["fix_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_weekly_minutes_fix_owner_id_fkey"
            columns: ["fix_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_weekly_minutes_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_weekly_minutes_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          id: string
          kind: string
          path: string
          sort_order: number
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          id?: string
          kind?: string
          path: string
          sort_order?: number
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          id?: string
          kind?: string
          path?: string
          sort_order?: number
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          branch: string
          business_unit: string
          category: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          description: string
          dispute_note: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalation_note: string | null
          id: string
          in_progress_at: string | null
          in_progress_by: string | null
          owner_decided_at: string | null
          owner_decided_by: string | null
          owner_decision: string | null
          owner_note: string | null
          priority: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          branch: string
          business_unit?: string
          category: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          description?: string
          dispute_note?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_note?: string | null
          id?: string
          in_progress_at?: string | null
          in_progress_by?: string | null
          owner_decided_at?: string | null
          owner_decided_by?: string | null
          owner_decision?: string | null
          owner_note?: string | null
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          branch?: string
          business_unit?: string
          category?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string
          dispute_note?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_note?: string | null
          id?: string
          in_progress_at?: string | null
          in_progress_by?: string | null
          owner_decided_at?: string | null
          owner_decided_by?: string | null
          owner_decision?: string | null
          owner_note?: string | null
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_escalated_by_fkey"
            columns: ["escalated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_escalated_by_fkey"
            columns: ["escalated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_in_progress_by_fkey"
            columns: ["in_progress_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_in_progress_by_fkey"
            columns: ["in_progress_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_owner_decided_by_fkey"
            columns: ["owner_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_owner_decided_by_fkey"
            columns: ["owner_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
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
          bagi_hasil_per_sesi: number | null
          biaya_sewa_space: number | null
          booking_type: string
          cancellation_kind: string | null
          catatan: string | null
          created_at: string
          created_by: string | null
          dp_bank_account_id: string | null
          dp_cashflow_transaction_id: string | null
          dp_nominal: number | null
          dp_tanggal: string | null
          harga_per_sesi: number | null
          harga_total: number
          id: string
          jam_mulai: string
          jam_selesai: string
          jumlah_sesi: number | null
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
          bagi_hasil_per_sesi?: number | null
          biaya_sewa_space?: number | null
          booking_type?: string
          cancellation_kind?: string | null
          catatan?: string | null
          created_at?: string
          created_by?: string | null
          dp_bank_account_id?: string | null
          dp_cashflow_transaction_id?: string | null
          dp_nominal?: number | null
          dp_tanggal?: string | null
          harga_per_sesi?: number | null
          harga_total: number
          id?: string
          jam_mulai: string
          jam_selesai: string
          jumlah_sesi?: number | null
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
          bagi_hasil_per_sesi?: number | null
          biaya_sewa_space?: number | null
          booking_type?: string
          cancellation_kind?: string | null
          catatan?: string | null
          created_at?: string
          created_by?: string | null
          dp_bank_account_id?: string | null
          dp_cashflow_transaction_id?: string | null
          dp_nominal?: number | null
          dp_tanggal?: string | null
          harga_per_sesi?: number | null
          harga_total?: number
          id?: string
          jam_mulai?: string
          jam_selesai?: string
          jumlah_sesi?: number | null
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
      yeobo_booth_reminder_checkpoints: {
        Row: {
          created_at: string
          days_before: number
          enabled: boolean
          id: string
          label: string | null
          message_template: string | null
          send_hour: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          days_before: number
          enabled?: boolean
          id?: string
          label?: string | null
          message_template?: string | null
          send_hour?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          days_before?: number
          enabled?: boolean
          id?: string
          label?: string | null
          message_template?: string | null
          send_hour?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_booth_reminder_checkpoints_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_reminder_checkpoints_updated_by_fkey"
            columns: ["updated_by"]
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
      yeobo_booth_reminder_recipients: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          label: string
          phone_e164: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          label?: string
          phone_e164?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          label?: string
          phone_e164?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_booth_reminder_recipients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_booth_reminder_recipients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_buyback_assets: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          override_source: string | null
          override_value_idr: number | null
          purchase_date: string
          qty: number
          sort_order: number
          total_idr: number
          unit: string
          unit_price_idr: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          override_source?: string | null
          override_value_idr?: number | null
          purchase_date: string
          qty?: number
          sort_order?: number
          total_idr: number
          unit?: string
          unit_price_idr: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          override_source?: string | null
          override_value_idr?: number | null
          purchase_date?: string
          qty?: number
          sort_order?: number
          total_idr?: number
          unit?: string
          unit_price_idr?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_buyback_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_buyback_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_buyback_assets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_buyback_assets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_buyback_reports: {
        Row: {
          as_of_date: string
          created_at: string
          created_by: string | null
          id: string
          investor_shares: Json | null
          life_months_aksesoris: number
          life_months_elektronik: number
          life_months_perabot: number
          lines: Json
          note: string | null
          residual_pct: number
          title: string
          total_book_value_idr: number
          total_cost_idr: number
        }
        Insert: {
          as_of_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          investor_shares?: Json | null
          life_months_aksesoris: number
          life_months_elektronik: number
          life_months_perabot: number
          lines: Json
          note?: string | null
          residual_pct: number
          title: string
          total_book_value_idr: number
          total_cost_idr: number
        }
        Update: {
          as_of_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          investor_shares?: Json | null
          life_months_aksesoris?: number
          life_months_elektronik?: number
          life_months_perabot?: number
          lines?: Json
          note?: string | null
          residual_pct?: number
          title?: string
          total_book_value_idr?: number
          total_cost_idr?: number
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_buyback_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_buyback_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_dividend_allocations: {
        Row: {
          after_bep: boolean
          amount_idr: number
          created_at: string
          created_by: string | null
          entitlement_idr: number
          id: string
          notes: string | null
          period_month: number
          period_year: number
          pool_idr: number | null
          recipient_id: string
          source: string
          updated_at: string
        }
        Insert: {
          after_bep?: boolean
          amount_idr: number
          created_at?: string
          created_by?: string | null
          entitlement_idr: number
          id?: string
          notes?: string | null
          period_month: number
          period_year: number
          pool_idr?: number | null
          recipient_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          after_bep?: boolean
          amount_idr?: number
          created_at?: string
          created_by?: string | null
          entitlement_idr?: number
          id?: string
          notes?: string | null
          period_month?: number
          period_year?: number
          pool_idr?: number | null
          recipient_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_dividend_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_dividend_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_dividend_allocations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "yeobo_dividend_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_dividend_branch_config: {
        Row: {
          bep_reached_ym: string | null
          branch: string
          mgmt_pct_after_bep: number
          mgmt_pct_before_bep: number
          total_investment_idr: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bep_reached_ym?: string | null
          branch: string
          mgmt_pct_after_bep?: number
          mgmt_pct_before_bep?: number
          total_investment_idr?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bep_reached_ym?: string | null
          branch?: string
          mgmt_pct_after_bep?: number
          mgmt_pct_before_bep?: number
          total_investment_idr?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_dividend_branch_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_dividend_branch_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_dividend_pnl_override: {
        Row: {
          amount_idr: number
          branch: string
          created_at: string
          note: string | null
          period_month: number
          period_year: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_idr: number
          branch: string
          created_at?: string
          note?: string | null
          period_month: number
          period_year: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_idr?: number
          branch?: string
          created_at?: string
          note?: string | null
          period_month?: number
          period_year?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      yeobo_dividend_recipients: {
        Row: {
          active: boolean
          branch: string
          claim_token: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          id: string
          invest_idr: number | null
          kind: string
          label: string
          notes: string | null
          placeholder_contact: string | null
          placeholder_name: string | null
          pool_pct: number | null
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          branch: string
          claim_token?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invest_idr?: number | null
          kind: string
          label: string
          notes?: string | null
          placeholder_contact?: string | null
          placeholder_name?: string | null
          pool_pct?: number | null
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          branch?: string
          claim_token?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invest_idr?: number | null
          kind?: string
          label?: string
          notes?: string | null
          placeholder_contact?: string | null
          placeholder_name?: string | null
          pool_pct?: number | null
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_dividend_recipients_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "investor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_dividend_recipients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_dividend_recipients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_dividend_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_dividend_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_meeting_notes: {
        Row: {
          body: string
          branches: string[]
          created_at: string
          created_by: string | null
          id: string
          meeting_date: string
          published: boolean
          summary: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          branches: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_date: string
          published?: boolean
          summary?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          branches?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_date?: string
          published?: boolean
          summary?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_meeting_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_meeting_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_meeting_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_meeting_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yeobo_photo_sessions: {
        Row: {
          branch: string
          created_at: string
          id: string
          locked_at: string | null
          package_label: string
          period_month: number
          period_year: number
          sessions: number
          sort_order: number
          source: string
          studio: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch: string
          created_at?: string
          id?: string
          locked_at?: string | null
          package_label?: string
          period_month: number
          period_year: number
          sessions: number
          sort_order?: number
          source?: string
          studio: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch?: string
          created_at?: string
          id?: string
          locked_at?: string | null
          package_label?: string
          period_month?: number
          period_year?: number
          sessions?: number
          sort_order?: number
          source?: string
          studio?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yeobo_photo_sessions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yeobo_photo_sessions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_celebrations_public"
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
      yeobo_branch_investment_v: {
        Row: {
          branch: string | null
          business_unit: string | null
          n_contracts: number | null
          total_investment_idr: number | null
        }
        Relationships: []
      }
      yeobo_dividend_recipients_v: {
        Row: {
          active: boolean | null
          branch: string | null
          claim_token: string | null
          contract_id: string | null
          id: string | null
          invest_idr: number | null
          kind: string | null
          label: string | null
          needs_slot: boolean | null
          notes: string | null
          placeholder_name: string | null
          pool_pct: number | null
          sort_order: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      account_vault_delete: {
        Args: { p_secret_id: string }
        Returns: undefined
      }
      account_vault_reveal: { Args: { p_secret_id: string }; Returns: string }
      account_vault_store: {
        Args: { p_password: string; p_secret_id: string }
        Returns: string
      }
      booth_can_manage: { Args: never; Returns: boolean }
      booth_storage_bytes: { Args: never; Returns: number }
      can_manage_tickets: { Args: never; Returns: boolean }
      can_manage_yeobo_booth: { Args: never; Returns: boolean }
      cleaning_branch_present: {
        Args: { p_date: string; p_location_id: string }
        Returns: {
          sort_order: number
          user_id: string
        }[]
      }
      count_my_needs_assignments: { Args: never; Returns: number }
      evaluation_360_can_rate: {
        Args: { p_rater_id: string; p_round_id: string; p_subject_id: string }
        Returns: boolean
      }
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
      investor_yeobo_branches: { Args: never; Returns: string[] }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_assignee: { Args: { account_id: string }; Returns: boolean }
      is_admin_or_pos_assignee: {
        Args: { account_id: string }
        Returns: boolean
      }
      is_investor_for_business_unit: { Args: { bu: string }; Returns: boolean }
      is_my_yeobo_branch: { Args: { p_branch: string }; Returns: boolean }
      is_procurement_for_bu: { Args: { bu: string }; Returns: boolean }
      is_procurement_staff: { Args: never; Returns: boolean }
      is_service_level_owner: { Args: { account_id: string }; Returns: boolean }
      is_sim_pic: { Args: { card: string }; Returns: boolean }
      is_social_account_member: { Args: { account: string }; Returns: boolean }
      is_studio_head: { Args: never; Returns: boolean }
      is_yeobo_booth_admin: { Args: never; Returns: boolean }
      is_zota_person: { Args: never; Returns: boolean }
      normalize_person_name: { Args: { raw: string }; Returns: string }
      normalize_person_name_segment: { Args: { seg: string }; Returns: string }
      resolve_assignment: {
        Args: {
          p_branch: string
          p_category: string
          p_effective_period_month?: number
          p_effective_period_year?: number
          p_row_id: string
        }
        Returns: boolean
      }
      save_subscription: {
        Args: {
          p_active: boolean
          p_allocs: Json
          p_amount: number
          p_cycle: string
          p_id: string
          p_name: string
          p_next: string
          p_notes: string
        }
        Returns: string
      }
      voice_sweep_stale_presence: { Args: never; Returns: number }
      yeobo_branch_investment: {
        Args: never
        Returns: {
          branch: string
          business_unit: string
          n_contracts: number
          total_investment_idr: number
        }[]
      }
      yeobo_branch_total_investment: {
        Args: { p_branch: string; p_business_unit: string }
        Returns: number
      }
      yeobo_dividend_pnl_rows: {
        Args: never
        Returns: {
          amount_idr: number
          branch: string
          period_month: number
          period_year: number
          source: string
        }[]
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
  overtime_mode: 'hourly_tiered' | 'fixed_per_day' | 'half_daily' | 'hourly_tiered_reduced';
  late_penalty_mode: 'per_minutes' | 'per_day' | 'none';
  grace_period_min: number;
  overtime_days: Array<{ date: string; minutes: number; pay: number }>;
  /** Lembur bulanan "hari ekstra": hari hadir melebihi kuota (expected_work_days)
   *  dibayar 1 hari OT penuh per surplus (mode-based). Ditambahkan ke overtime_pay. */
  extra_day_overtime?: { days: number; pay: number };
  late_days: Array<{ date: string; raw_minutes: number; after_grace_minutes: number; penalty: number; excused: boolean; penalty_pre_cap?: number; excuse_note?: string | null }>;
  late_penalty_daily_cap?: number;
  extra_work_days?: Array<{ date: string; kind: string; pay: number }>;
  extra_work_rate_idr?: number;
  /** Hari hadir karyawan dalam periode — ditambah dari sibling chat
   *  slip-gaji untuk render daftar attendance di PayslipPdfDocument. */
  attendance_days?: Array<{ date: string }>;
  /** Hari "bonus" yang dibayar per jam (mode bonus_day_hourly). `hours` =
   *  jam kerja aktual, `pay` = pembayaran reguler (jam × tarif/jam); lembur
   *  di atas jam standar masuk ke `overtime_days`. */
  bonus_days?: Array<{ date: string; hours: number; pay: number }>;
};
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type AttendanceLog = Database['public']['Tables']['attendance_logs']['Row'];
export type AttendanceBreakLog = Database['public']['Tables']['attendance_break_logs']['Row'];
export type NationalHoliday = Database['public']['Tables']['national_holidays']['Row'];

/** A single break window in profiles.break_windows (jsonb array). HH:MM. */
export type BreakWindow = { start: string; end: string };
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
