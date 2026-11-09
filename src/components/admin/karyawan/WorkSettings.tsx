"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PayslipIncludeToggle,
  ProbationToggle,
  ScheduleCell,
  ScheduleEditDialog,
  type UserRow,
} from "@/components/admin/UsersTable";
import { EmployeeLocationAssignment } from "@/components/admin/EmployeeLocationAssignment";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { Panel } from "./Panel";

/** Tab "Kerja": jadwal, lokasi absen, dan status kepegawaian dalam satu tempat. */
export function WorkSettings({
  row,
  allLocations,
}: {
  row: UserRow;
  allLocations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Jadwal" hint="Klik untuk mengubah jam, hari kerja, dan istirahat.">
        <ScheduleCell row={row} onEdit={() => setEditing(true)} tu={t.adminUsers} />
      </Panel>

      <Panel title="Status">
        <dl className="divide-y divide-border text-sm">
          <div className="flex items-center justify-between gap-4 py-2 first:pt-0">
            <dt>
              <span className="text-foreground">Probation</span>
              <p className="text-xs text-muted-foreground">Tidak tampil di feed ulang tahun rekan kerja.</p>
            </dt>
            <dd>
              <ProbationToggle userId={row.id} initial={row.is_probation} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2 last:pb-0">
            <dt>
              <span className="text-foreground">Masuk penggajian</span>
              <p className="text-xs text-muted-foreground">Slip gaji bulanan dihitung untuk orang ini.</p>
            </dt>
            <dd>
              <PayslipIncludeToggle userId={row.id} initialExcluded={row.payslip_excluded} />
            </dd>
          </div>
        </dl>
      </Panel>

      <div className="lg:col-span-2">
        <EmployeeLocationAssignment
          employeeId={row.id}
          allLocations={allLocations}
          initialAssignedIds={row.assigned_location_ids}
        />
      </div>

      <ScheduleEditDialog
        row={editing ? row : null}
        tu={t.adminUsers}
        onOpenChange={(open) => !open && setEditing(false)}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    </div>
  );
}
