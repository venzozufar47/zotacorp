"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ProfileCompletionCardProps {
  missingFields: string[];
}

export function ProfileCompletionCard({ missingFields }: ProfileCompletionCardProps) {
  if (missingFields.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm border-l-4" style={{ borderLeftColor: "#ff9f0a" }}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div
            className="rounded-full p-2 shrink-0"
            style={{ background: "#fff7ed" }}
          >
            <AlertTriangle size={18} style={{ color: "#ff9f0a" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Complete your profile
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The following details are needed for payslip and company records:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {missingFields.map((f) => (
                <span
                  key={f}
                  className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "#fff7ed", color: "#ff9f0a" }}
                >
                  {f}
                </span>
              ))}
            </div>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center mt-3 h-8 px-3 text-xs font-medium text-white rounded-md"
              style={{ background: "var(--primary)" }}
            >
              Update profile
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
