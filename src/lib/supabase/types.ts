export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Per-day transparency snapshot stored on payslips.breakdown_json. Captured at
 * calculation time so finalized payslips remain immutable even if settings or
 * raw attendance data change later.
 */
export type PayslipBreakdown = {
  overtime_mode: "hourly_tiered" | "fixed_per_day";
  late_penalty_mode: "per_minutes" | "per_day" | "none";
  grace_period_min: number;
  overtime_days: Array<{
    date: string; // YYYY-MM-DD
    minutes: number;
    pay: number;
  }>;
  late_days: Array<{
    date: string; // YYYY-MM-DD
    raw_minutes: number;
    after_grace_minutes: number;
    penalty: number;
    excused: boolean;
  }>;
  extra_work_days?: Array<{
    date: string; // YYYY-MM-DD
    kind: string;
    pay: number;
  }>;
  extra_work_rate_idr?: number;
};

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
        Relationships: []
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
      whatsapp_templates: {
        Row: {
          template_key: string
          body: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          template_key: string
          body: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          template_key?: string
          body?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      celebration_reminder_sends: {
        Row: {
          id: string
          recipient_id: string
          celebrant_id: string
          event_type: string
          event_year: number
          slot_date: string
          slot_hour: number
          sent_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          celebrant_id: string
          event_type?: string
          event_year: number
          slot_date: string
          slot_hour: number
          sent_at?: string
        }
        Update: {
          id?: string
          recipient_id?: string
          celebrant_id?: string
          event_type?: string
          event_year?: number
          slot_date?: string
          slot_hour?: number
          sent_at?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
    }
    Functions: {
      get_ui_theme: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AttendanceLog =
  Database["public"]["Tables"]["attendance_logs"]["Row"];
export type AttendanceSettings =
  Database["public"]["Tables"]["attendance_settings"]["Row"];
export type OvertimeRequest =
  Database["public"]["Tables"]["overtime_requests"]["Row"];
export type PayslipSettings =
  Database["public"]["Tables"]["payslip_settings"]["Row"];
export type Payslip = Database["public"]["Tables"]["payslips"]["Row"];
export type PayslipDeliverable =
  Database["public"]["Tables"]["payslip_deliverables"]["Row"];
export type ExtraWorkLog =
  Database["public"]["Tables"]["extra_work_logs"]["Row"];
export type AttendanceLocation =
  Database["public"]["Tables"]["attendance_locations"]["Row"];
export type EmployeeLocation =
  Database["public"]["Tables"]["employee_locations"]["Row"];
export type WhatsAppNotificationRecipient =
  Database["public"]["Tables"]["whatsapp_notification_recipients"]["Row"];
export type CelebrationMessageRow =
  Database["public"]["Tables"]["celebration_messages"]["Row"];
