"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const DAY_LABELS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

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
  const [workStart, setWorkStart] = useState(settings.work_start_time.slice(0, 5));
  const [workEnd, setWorkEnd] = useState(settings.work_end_time.slice(0, 5));
  const [gracePeriod, setGracePeriod] = useState(settings.grace_period_min);
  const [workingDays, setWorkingDays] = useState<number[]>(settings.working_days);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [saving, setSaving] = useState(false);

  function toggleDay(day: number) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const result = await updateAttendanceSettings({
      work_start_time: workStart,
      work_end_time: workEnd,
      grace_period_min: gracePeriod,
      working_days: workingDays,
      timezone,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Settings saved");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Working Hours */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Working Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Time</Label>
              <Input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Time</Label>
              <Input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grace Period */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Grace Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-xs">Minutes after start time</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={120}
                value={gracePeriod}
                onChange={(e) => setGracePeriod(Number(e.target.value))}
                required
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Employees who check in within this window after start time are still considered on time.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Working Days */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Working Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map(({ value, label }) => {
              const active = workingDays.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDay(value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all border"
                  style={{
                    background: active ? "var(--primary)" : "transparent",
                    color: active ? "#fff" : "var(--muted-foreground)",
                    borderColor: active ? "var(--primary)" : "var(--border)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Timezone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-xs">Timezone</Label>
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
