import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default function VerifyPage() {
  return (
    <Card className="shadow-md border-0 text-center">
      <CardContent className="pt-8 pb-8">
        <span className="text-5xl mb-4 block">📬</span>
        <h2 className="text-xl font-semibold mb-2">Check your inbox</h2>
        <p className="text-muted-foreground text-sm mb-6">
          We sent a confirmation link to your email. Click it to activate your
          account and get started.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium"
          style={{ color: "var(--primary)" }}
        >
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
