-- This migration stores department list as a reference.
-- In v1 departments are stored as text in profiles.department.
-- No FK constraint in v1 — this is informational for the app constants.

-- To create an initial admin account:
-- 1. Register normally via the app
-- 2. Then run this SQL to promote to admin:
--    UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
