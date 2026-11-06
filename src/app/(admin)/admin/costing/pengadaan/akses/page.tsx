import { redirect } from "next/navigation";

/** Akses & setelan pengadaan kini tab di hub Pengadaan. */
export default function LegacyAccessRoute() {
  redirect("/admin/costing/pengadaan?tab=akses");
}
