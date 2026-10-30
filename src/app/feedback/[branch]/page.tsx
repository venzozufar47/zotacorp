import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEEDBACK_SLUGS } from "@/lib/feedback/constants";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";

export async function generateMetadata({ params }: { params: Promise<{ branch: string }> }): Promise<Metadata> {
  const target = FEEDBACK_SLUGS[(await params).branch];
  return {
    title: target ? `Feedback ${target.brand}` : "Feedback",
    description: "Ceritakan pengalaman kakak, hanya satu menit.",
    robots: { index: false, follow: false },
  };
}

/** Formulir feedback pelanggan Haengbocake. Publik: /feedback/pare dan /feedback/semarang. */
export default async function FeedbackPage({ params }: { params: Promise<{ branch: string }> }) {
  const slug = (await params).branch;
  const target = FEEDBACK_SLUGS[slug];
  if (!target) notFound();
  return <FeedbackForm slug={slug} brand={target.brand} />;
}
