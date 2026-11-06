"use client";

import { DisclosureGroup } from "@/components/account/Disclosure";
import {
  LanguageRow,
  NotificationRow,
  PasswordRow,
} from "@/components/settings/SettingsRows";

export default function SettingsPage() {
  return (
    <DisclosureGroup>
      <NotificationRow />
      <LanguageRow />
      <PasswordRow />
    </DisclosureGroup>
  );
}
