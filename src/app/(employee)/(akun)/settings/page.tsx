export const dynamic = "force-dynamic";

import { getCurrentProfile } from "@/lib/supabase/cached";
import { DisclosureGroup } from "@/components/account/Disclosure";
import { PosPinRow } from "@/components/profile/PosPinCard";
import {
  LanguageRow,
  NotificationRow,
  PasswordRow,
} from "@/components/settings/SettingsRows";
import type { Profile } from "@/lib/supabase/types";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  const hasPin = !!(profile as Profile | null)?.pos_pin_hash;

  return (
    <DisclosureGroup>
      <NotificationRow />
      <LanguageRow />
      <PasswordRow />
      <PosPinRow hasPin={hasPin} />
    </DisclosureGroup>
  );
}
