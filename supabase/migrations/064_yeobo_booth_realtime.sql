-- Publish Yeobo Booth tables ke supabase_realtime supaya dashboard
-- admin (multi-tab) sync otomatis tanpa refresh saat booking
-- ditambahkan / diedit. Pola sama dengan 062.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.yeobo_booth_bookings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.yeobo_booth_booking_freelance;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.yeobo_booth_freelance;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.yeobo_booth_reminder_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
