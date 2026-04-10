export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
          status: "on_time" | "late" | "late_excused" | "flexible" | "unknown";
          late_minutes: number;
          late_proof_url: string | null;
          is_overtime: boolean;
          overtime_minutes: number;
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
          status?: "on_time" | "late" | "late_excused" | "flexible" | "unknown";
          late_minutes?: number;
          late_proof_url?: string | null;
          is_overtime?: boolean;
          overtime_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          checked_out_at?: string | null;
          status?: "on_time" | "late" | "late_excused" | "flexible" | "unknown";
          late_minutes?: number;
          late_proof_url?: string | null;
          is_overtime?: boolean;
          overtime_minutes?: number;
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
          working_days: number[];
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          work_start_time?: string;
          work_end_time?: string;
          grace_period_min?: number;
          working_days?: number[];
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          work_start_time?: string;
          work_end_time?: string;
          grace_period_min?: number;
          working_days?: number[];
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
