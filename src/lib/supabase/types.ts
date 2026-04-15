export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          department: string;
          position: string;
          role: "employee" | "admin";
          is_active: boolean;
          is_flexible_schedule: boolean;
          work_start_time: string;
          work_end_time: string;
          grace_period_min: number;
          created_at: string;
          updated_at: string;
          nickname: string | null;
          business_unit: string | null;
          job_role: string | null;
          gender: string | null;
          date_of_birth: string | null;
          place_of_birth: string | null;
          current_city: string | null;
          whatsapp_number: string | null;
          npwp: string | null;
          emergency_contact_name: string | null;
          emergency_contact_whatsapp: string | null;
          first_day_of_work: string | null;
          motto: string | null;
          shirt_size: string | null;
          domisili_provinsi: string | null;
          domisili_kota: string | null;
          domisili_kecamatan: string | null;
          domisili_kelurahan: string | null;
          domisili_alamat: string | null;
          asal_provinsi: string | null;
          asal_kota: string | null;
          asal_kecamatan: string | null;
          asal_kelurahan: string | null;
          asal_alamat: string | null;
          extra_work_enabled: boolean;
        };
        Insert: {
          id: string;
          full_name?: string;
          email?: string;
          department?: string;
          position?: string;
          role?: "employee" | "admin";
          is_active?: boolean;
          is_flexible_schedule?: boolean;
          work_start_time?: string;
          work_end_time?: string;
          grace_period_min?: number;
          created_at?: string;
          updated_at?: string;
          nickname?: string | null;
          business_unit?: string | null;
          job_role?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          place_of_birth?: string | null;
          current_city?: string | null;
          whatsapp_number?: string | null;
          npwp?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_whatsapp?: string | null;
          first_day_of_work?: string | null;
          motto?: string | null;
          shirt_size?: string | null;
          domisili_provinsi?: string | null;
          domisili_kota?: string | null;
          domisili_kecamatan?: string | null;
          domisili_kelurahan?: string | null;
          domisili_alamat?: string | null;
          asal_provinsi?: string | null;
          asal_kota?: string | null;
          asal_kecamatan?: string | null;
          asal_kelurahan?: string | null;
          asal_alamat?: string | null;
          extra_work_enabled?: boolean;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          department?: string;
          position?: string;
          role?: "employee" | "admin";
          is_active?: boolean;
          is_flexible_schedule?: boolean;
          work_start_time?: string;
          work_end_time?: string;
          grace_period_min?: number;
          updated_at?: string;
          nickname?: string | null;
          business_unit?: string | null;
          job_role?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          place_of_birth?: string | null;
          current_city?: string | null;
          whatsapp_number?: string | null;
          npwp?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_whatsapp?: string | null;
          first_day_of_work?: string | null;
          motto?: string | null;
          shirt_size?: string | null;
          domisili_provinsi?: string | null;
          domisili_kota?: string | null;
          domisili_kecamatan?: string | null;
          domisili_kelurahan?: string | null;
          domisili_alamat?: string | null;
          asal_provinsi?: string | null;
          asal_kota?: string | null;
          asal_kecamatan?: string | null;
          asal_kelurahan?: string | null;
          asal_alamat?: string | null;
          extra_work_enabled?: boolean;
        };
        Relationships: [];
      };
      attendance_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          checked_in_at: string;
          checked_out_at: string | null;
          latitude: number | null;
          longitude: number | null;
          checkout_latitude: number | null;
          checkout_longitude: number | null;
          checkout_outside_note: string | null;
          matched_location_id: string | null;
          selfie_path: string | null;
          is_early_arrival: boolean;
          status: "on_time" | "late" | "late_excused" | "flexible" | "unknown";
          late_minutes: number;
          late_proof_url: string | null;
          late_proof_status: "pending" | "approved" | "rejected" | null;
          late_proof_admin_note: string | null;
          is_overtime: boolean;
          overtime_minutes: number;
          overtime_status: "pending" | "approved" | "rejected" | null;
          late_checkout_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          checked_in_at: string;
          checked_out_at?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          checkout_latitude?: number | null;
          checkout_longitude?: number | null;
          checkout_outside_note?: string | null;
          matched_location_id?: string | null;
          selfie_path?: string | null;
          is_early_arrival?: boolean;
          status?: "on_time" | "late" | "late_excused" | "flexible" | "unknown";
          late_minutes?: number;
          late_proof_url?: string | null;
          late_proof_status?: "pending" | "approved" | "rejected" | null;
          late_proof_admin_note?: string | null;
          is_overtime?: boolean;
          overtime_minutes?: number;
          overtime_status?: "pending" | "approved" | "rejected" | null;
          late_checkout_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          checked_out_at?: string | null;
          checkout_latitude?: number | null;
          checkout_longitude?: number | null;
          checkout_outside_note?: string | null;
          matched_location_id?: string | null;
          selfie_path?: string | null;
          is_early_arrival?: boolean;
          status?: "on_time" | "late" | "late_excused" | "flexible" | "unknown";
          late_minutes?: number;
          late_proof_url?: string | null;
          late_proof_status?: "pending" | "approved" | "rejected" | null;
          late_proof_admin_note?: string | null;
          is_overtime?: boolean;
          overtime_minutes?: number;
          overtime_status?: "pending" | "approved" | "rejected" | null;
          late_checkout_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      attendance_settings: {
        Row: {
          id: string;
          work_start_time: string;
          work_end_time: string;
          grace_period_min: number;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          work_start_time?: string;
          work_end_time?: string;
          grace_period_min?: number;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          work_start_time?: string;
          work_end_time?: string;
          grace_period_min?: number;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      overtime_requests: {
        Row: {
          id: string;
          attendance_log_id: string;
          user_id: string;
          date: string;
          overtime_minutes: number;
          reason: string;
          status: "pending" | "approved" | "rejected";
          admin_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attendance_log_id: string;
          user_id: string;
          date: string;
          overtime_minutes: number;
          reason: string;
          status?: "pending" | "approved" | "rejected";
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "pending" | "approved" | "rejected";
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          overtime_minutes?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "overtime_requests_attendance_log_id_fkey";
            columns: ["attendance_log_id"];
            isOneToOne: true;
            referencedRelation: "attendance_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "overtime_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "overtime_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      payslip_settings: {
        Row: {
          id: string;
          user_id: string;
          calculation_basis: "presence" | "deliverables" | "both";
          monthly_fixed_amount: number;
          expected_work_days: number;
          expected_days_mode: "manual" | "weekly_pattern";
          expected_weekdays: number[];
          overtime_mode: "hourly_tiered" | "fixed_per_day";
          ot_first_hour_rate: number;
          ot_next_hour_rate: number;
          ot_fixed_daily_rate: number;
          late_penalty_mode: "per_minutes" | "per_day" | "none";
          late_penalty_amount: number;
          late_penalty_interval_min: number;
          standard_working_hours: number;
          attendance_weight_pct: number;
          deliverables_weight_pct: number;
          is_finalized: boolean;
          finalized_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          calculation_basis?: "presence" | "deliverables" | "both";
          monthly_fixed_amount?: number;
          expected_work_days?: number;
          expected_days_mode?: "manual" | "weekly_pattern";
          expected_weekdays?: number[];
          overtime_mode?: "hourly_tiered" | "fixed_per_day";
          ot_first_hour_rate?: number;
          ot_next_hour_rate?: number;
          ot_fixed_daily_rate?: number;
          late_penalty_mode?: "per_minutes" | "per_day" | "none";
          late_penalty_amount?: number;
          late_penalty_interval_min?: number;
          standard_working_hours?: number;
          attendance_weight_pct?: number;
          deliverables_weight_pct?: number;
          is_finalized?: boolean;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          calculation_basis?: "presence" | "deliverables" | "both";
          monthly_fixed_amount?: number;
          expected_work_days?: number;
          expected_days_mode?: "manual" | "weekly_pattern";
          expected_weekdays?: number[];
          overtime_mode?: "hourly_tiered" | "fixed_per_day";
          ot_first_hour_rate?: number;
          ot_next_hour_rate?: number;
          ot_fixed_daily_rate?: number;
          late_penalty_mode?: "per_minutes" | "per_day" | "none";
          late_penalty_amount?: number;
          late_penalty_interval_min?: number;
          standard_working_hours?: number;
          attendance_weight_pct?: number;
          deliverables_weight_pct?: number;
          is_finalized?: boolean;
          finalized_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payslip_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      payslips: {
        Row: {
          id: string;
          user_id: string;
          month: number;
          year: number;
          actual_work_days: number;
          expected_work_days: number;
          base_salary: number;
          prorated_salary: number;
          extra_day_bonus: number;
          total_overtime_minutes: number;
          overtime_pay: number;
          total_late_minutes: number;
          late_penalty: number;
          monthly_bonus: number;
          monthly_bonus_note: string | null;
          debt_deduction: number;
          other_penalty: number;
          other_penalty_note: string | null;
          deliverables_achievement_pct: number;
          deliverables_pay: number;
          net_total: number;
          status: "draft" | "finalized";
          breakdown_json: PayslipBreakdown | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: number;
          year: number;
          actual_work_days?: number;
          expected_work_days?: number;
          base_salary?: number;
          prorated_salary?: number;
          extra_day_bonus?: number;
          total_overtime_minutes?: number;
          overtime_pay?: number;
          total_late_minutes?: number;
          late_penalty?: number;
          monthly_bonus?: number;
          monthly_bonus_note?: string | null;
          debt_deduction?: number;
          other_penalty?: number;
          other_penalty_note?: string | null;
          deliverables_achievement_pct?: number;
          deliverables_pay?: number;
          net_total?: number;
          status?: "draft" | "finalized";
          breakdown_json?: PayslipBreakdown | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          actual_work_days?: number;
          expected_work_days?: number;
          base_salary?: number;
          prorated_salary?: number;
          extra_day_bonus?: number;
          total_overtime_minutes?: number;
          overtime_pay?: number;
          total_late_minutes?: number;
          late_penalty?: number;
          monthly_bonus?: number;
          monthly_bonus_note?: string | null;
          debt_deduction?: number;
          other_penalty?: number;
          other_penalty_note?: string | null;
          deliverables_achievement_pct?: number;
          deliverables_pay?: number;
          net_total?: number;
          status?: "draft" | "finalized";
          breakdown_json?: PayslipBreakdown | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payslips_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      extra_work_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          kind: string;
          created_at?: string;
        };
        Update: {
          kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extra_work_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      whatsapp_notification_recipients: {
        Row: {
          id: string;
          label: string;
          phone_e164: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          label?: string;
          phone_e164: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          phone_e164?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      attendance_locations: {
        Row: {
          id: string;
          name: string;
          latitude: number;
          longitude: number;
          radius_m: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          latitude: number;
          longitude: number;
          radius_m: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          latitude?: number;
          longitude?: number;
          radius_m?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      employee_locations: {
        Row: {
          employee_id: string;
          location_id: string;
          created_at: string;
        };
        Insert: {
          employee_id: string;
          location_id: string;
          created_at?: string;
        };
        Update: {
          employee_id?: string;
          location_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_locations_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_locations_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "attendance_locations";
            referencedColumns: ["id"];
          }
        ];
      };
      payslip_deliverables: {
        Row: {
          id: string;
          payslip_id: string;
          name: string;
          target: number;
          realization: number;
          weight_pct: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          payslip_id: string;
          name: string;
          target?: number;
          realization?: number;
          weight_pct?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          target?: number;
          realization?: number;
          weight_pct?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payslip_deliverables_payslip_id_fkey";
            columns: ["payslip_id"];
            isOneToOne: false;
            referencedRelation: "payslips";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

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
