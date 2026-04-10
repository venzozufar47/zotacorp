"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateAttendanceSettings } from "@/lib/actions/settings.actions";
import type { AttendanceSettings } from "@/lib/supabase/types";

const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
] as const;

interface AttendanceSettingsFormProps {
  settings: AttendanceSettings;
}

export function AttendanceSettingsForm({ settings }: AttendanceSettingsFormProps) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const result = await updateAttendanceSettings({ timezone });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Settings saved");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Timezone */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Timezone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-xs">Company Timezone</Label>
            <Select value={timezone} onValueChange={(v) => setTimezone(v ?? timezone)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for all time calculations (on-time/late, overtime). Per-employee working hours are configured under Users.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-0 md:static py-3 bg-[#f5f5f7] md:bg-transparent">
        <Button
          type="submit"
          disabled={saving}
          className="min-w-32"
          style={{ background: "var(--primary)" }}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
