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
          pdf_password: string | null
          pos_enabled: boolean
          source_sheet: string | null
          source_url: string | null
          updated_at: string
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
          pdf_password?: string | null
          pos_enabled?: boolean
          source_sheet?: string | null
          source_url?: string | null
          updated_at?: string
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
          pdf_password?: string | null
          pos_enabled?: boolean
          source_sheet?: string | null
          source_url?: string | null
          updated_at?: string
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
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_pusat_allocations: {
        Row: {
          business_unit: string
          category: string
          created_at: string
          id: string
          locked: boolean
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
          attachment_path: string | null
          branch: string | null
          category: string | null
          created_at: string
          credit: number
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
          attachment_path?: string | null
          branch?: string | null
          category?: string | null
          created_at?: string
          credit?: number
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
          attachment_path?: string | null
          branch?: string | null
          category?: string | null
          created_at?: string
          credit?: number
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
      extra_work_logs: {
        Row: {
          created_at: string
          date: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          kind?: string
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
      payslips: {
        Row: {
          actual_work_days: number
          base_salary: number
          breakdown_json: Json | null
          created_at: string | null
          debt_deduction: number
          deliverables_achievement_pct: number
          deliverables_pay: number
          expected_work_days: number
          extra_day_bonus: number
          extra_work_pay: number
          id: string
          late_penalty: number
          month: number
          monthly_bonus: number
          monthly_bonus_note: string | null
          net_total: number
          other_penalty: number
          other_penalty_note: string | null
          overtime_pay: number
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
          deliverables_achievement_pct?: number
          deliverables_pay?: number
          expected_work_days?: number
          extra_day_bonus?: number
          extra_work_pay?: number
          id?: string
          late_penalty?: number
          month: number
          monthly_bonus?: number
          monthly_bonus_note?: string | null
          net_total?: number
          other_penalty?: number
          other_penalty_note?: string | null
          overtime_pay?: number
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
          deliverables_achievement_pct?: number
          deliverables_pay?: number
          expected_work_days?: number
          extra_day_bonus?: number
          extra_work_pay?: number
          id?: string
          late_penalty?: number
          month?: number
          monthly_bonus?: number
          monthly_bonus_note?: string | null
          net_total?: number
          other_penalty?: number
          other_penalty_note?: string | null
          overtime_pay?: number
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
          name: string
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
          name: string
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
          name?: string
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
          id: string
          payment_method: string
          sale_date: string
          sale_time: string
          total: number
          voided_at: string | null
        }
        Insert: {
          bank_account_id: string
          cashflow_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          payment_method: string
          sale_date: string
          sale_time?: string
          total: number
          voided_at?: string | null
        }
        Update: {
          bank_account_id?: string
          cashflow_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          payment_method?: string
          sale_date?: string
          sale_time?: string
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
          job_role: string | null
          motto: string | null
          nickname: string | null
          npwp: string | null
          place_of_birth: string | null
          position: string
          role: string
          shirt_size: string | null
          streak_last_milestone: number
          streak_personal_best: number
          updated_at: string
          whatsapp_number: string | null
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          anniversary_last_greeted?: string | null
          asal_alamat?: string | null
          asal_kecamatan?: string | null
          asal_kelurahan?: string | null
          asal_kota?: string | null
          asal_provinsi?: string | null
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
          job_role?: string | null
          motto?: string | null
          nickname?: string | null
          npwp?: string | null
          place_of_birth?: string | null
          position?: string
          role?: string
          shirt_size?: string | null
          streak_last_milestone?: number
          streak_personal_best?: number
          updated_at?: string
          whatsapp_number?: string | null
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          anniversary_last_greeted?: string | null
          asal_alamat?: string | null
          asal_kecamatan?: string | null
          asal_kelurahan?: string | null
          asal_kota?: string | null
          asal_provinsi?: string | null
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
          job_role?: string | null
          motto?: string | null
          nickname?: string | null
          npwp?: string | null
          place_of_birth?: string | null
          position?: string
          role?: string
          shirt_size?: string | null
          streak_last_milestone?: number
          streak_personal_best?: number
          updated_at?: string
          whatsapp_number?: string | null
          work_end_time?: string
          work_start_time?: string
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
    }
    Views: {
      profiles_celebrations_public: {
        Row: {
          dob_month_day: string | null
          first_day_of_work: string | null
          full_name: string | null
          id: string | null
          nickname: string | null
        }
        Insert: {
          dob_month_day?: never
          first_day_of_work?: string | null
          full_name?: string | null
          id?: string | null
          nickname?: string | null
        }
        Update: {
          dob_month_day?: never
          first_day_of_work?: string | null
          full_name?: string | null
          id?: string | null
          nickname?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_ui_theme: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_assignee: { Args: { account_id: string }; Returns: boolean }
      is_admin_or_pos_assignee: {
        Args: { account_id: string }
        Returns: boolean
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
  late_days: Array<{ date: string; raw_minutes: number; after_grace_minutes: number; penalty: number; excused: boolean }>;
  extra_work_days?: Array<{ date: string; kind: string; pay: number }>;
  extra_work_rate_idr?: number;
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
