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
import { Pencil, X, Check } from "lucide-react";
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
  const [snapshot, setSnapshot] = useState(settings.timezone);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setSnapshot(timezone);
    setEditing(true);
  }

  function cancelEdit() {
    setTimezone(snapshot);
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);

    const result = await updateAttendanceSettings({ timezone });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Settings saved");
      setSnapshot(timezone);
      setEditing(false);
    }

    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Timezone</CardTitle>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={cancelEdit}
                disabled={saving}
              >
                <X size={14} className="mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 text-xs"
                style={{ background: "var(--primary)" }}
                onClick={handleSave}
                disabled={saving}
              >
                <Check size={14} className="mr-1" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={startEdit}
            >
              <Pencil size={14} className="mr-1" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-xs">Company Timezone</Label>
            {editing ? (
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
            ) : (
              <p className="text-sm py-2 px-3 rounded-md bg-[#f5f5f7] min-h-[36px]">
                {timezone}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Used for all time calculations (on-time/late, overtime). Per-employee working hours are configured under Users.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
