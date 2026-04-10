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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          checked_out_at?: string | null;
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
