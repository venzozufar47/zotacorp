/** Akun tersimpan — TANPA password (password hanya lewat aksi reveal). */
export interface ManagedAccount {
  id: string;
  /** Nama layanan / akun, mis. "Instagram Haengbocake Pare". Wajib. */
  service: string;
  /** Email / username untuk login. */
  login: string;
  businessUnit: string;
  branch: string | null;
  linkedPhone: string | null;
  loginUrl: string | null;
  notes: string | null;
}
