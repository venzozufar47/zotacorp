export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import { listFreelance } from "@/lib/actions/yeobo-booth-freelance.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookingForm } from "@/components/yeobo-booth/BookingForm";

export default async function NewBookingPage() {
  if (!(await canAccessYeoboBooth())) redirect("/dashboard");

  const freelance = await listFreelance();

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Booking Baru"
        subtitle="Isi data klien, sesi, harga, dan freelance yang bertugas."
      />
      <BookingForm freelance={freelance} />
    </div>
  );
}
