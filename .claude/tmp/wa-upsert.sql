-- Upsert WA send logs from Fonnte report. fonnte_id-based dedup.

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'birthday', '🎂 Selamat ulang tahun, Arifin! Semoga tahun ini penuh hal baik. — Tim Zota', 'sent', '2026-04-18T13:23:23.999Z', '152272979'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'celebration_greeting_notification', '💌 Arifin, ada ucapan ulang tahun baru dari Boles!

Buka Zota App buat balas ✨', 'sent', '2026-04-18T16:32:45.000Z', '152298570'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'celebration_greeting_notification', '?? Arifin, ada ucapan ulang tahun baru dari Venzo!

Buka Zota App buat balas ?', 'sent', '2026-04-18T16:34:38.000Z', '152298896'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'celebration_greeting_notification', '?? Arifin, ada ucapan ulang tahun baru dari Zahra!

Buka Zota App buat balas ?', 'sent', '2026-04-18T16:34:38.999Z', '152298897'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'celebration_greeting_notification', '?? Arifin, ada ucapan ulang tahun baru dari Yuan!

Buka Zota App buat balas ?', 'sent', '2026-04-18T16:34:38.999Z', '152298898'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'celebration_greeting_notification', '💌 Arifin, ada ucapan ulang tahun baru dari Inggrita Putri Kusuma Wardani!

Buka Zota App buat balas ✨', 'sent', '2026-04-18T16:52:01.000Z', '152300916'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'celebration_greeting_notification', '💌 Arifin, ada ucapan ulang tahun baru dari Vincentius Alvin Resandy!

Buka Zota App buat balas ✨', 'sent', '2026-04-18T17:41:56.000Z', '152307911'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'celebration_greeting_notification', '💌 Arifin, ada ucapan ulang tahun baru dari Intan!

Buka Zota App buat balas ✨', 'sent', '2026-04-18T19:00:49.000Z', '152350595'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'celebration_greeting_notification', '💌 Arifin, ada ucapan ulang tahun baru dari Hasna!

Buka Zota App buat balas ✨', 'sent', '2026-04-18T22:26:58.000Z', '152374219'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285748489448' limit 1),
  '6285748489448', 'streak_milestone', '🎉 Selamat Zahra Nurya Maskaidharo! Kamu udah 5 hari on-time berturut-turut. Kerenn!', 'sent', '2026-04-21T14:58:37.999Z', '152765098'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6281273327320' limit 1),
  '6281273327320', 'streak_milestone', '🎉 Selamat Lazimatu Masruroh! Kamu udah 5 hari on-time berturut-turut. Kerenn!', 'sent', '2026-04-21T17:52:40.999Z', '152809752'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285755829601' limit 1),
  '6285755829601', 'streak_milestone', '🎉 Selamat Debar Boles Ananta ! Kamu udah 5 hari on-time berturut-turut. Kerenn!', 'sent', '2026-04-24T15:58:29.000Z', '153272285'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285879512220' limit 1),
  '6285879512220', 'birthday', '🎂 Selamat ulang tahun, Ikaa! Semoga tahun ini penuh hal baik buat kamu :) — Tim Zota', 'sent', '2026-04-25T14:14:04.999Z', '153413702'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285755829601' limit 1),
  '6285755829601', 'streak_milestone', '🎉 Selamat Debar Boles Ananta ! Kamu udah 10 hari on-time berturut-turut. Kerenn!', 'sent', '2026-04-25T15:57:20.000Z', '153429148'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285879512220' limit 1),
  '6285879512220', 'celebration_greeting_notification', '💌 Ikaa, ada ucapan ulang tahun baru dari Boles!

Buka Zota App buat balas ✨', 'sent', '2026-04-25T15:58:09.999Z', '153429276'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6289670426581' limit 1),
  '6289670426581', 'streak_milestone', '🎉 Selamat Desita Anugerahing Widya! Kamu udah 5 hari on-time berturut-turut. Kerenn!', 'sent', '2026-04-25T17:52:53.999Z', '153449529'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285879512220' limit 1),
  '6285879512220', 'celebration_greeting_notification', '💌 Ikaa, ada ucapan ulang tahun baru dari Venzo!

Buka Zota App buat balas ✨', 'sent', '2026-04-25T18:46:02.000Z', '153456123'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6281273327320' limit 1),
  '6281273327320', 'other', '🎂 Azim, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:31.000Z', '153460053'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285647017657' limit 1),
  '6285647017657', 'other', '🎂 Arifin, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:32.000Z', '153460056'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6283106712122' limit 1),
  '6283106712122', 'other', '🎂 Yuan, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:32.999Z', '153460060'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285742961704' limit 1),
  '6285742961704', 'other', '🎂 Relma, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:34.000Z', '153460062'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6289538418245' limit 1),
  '6289538418245', 'other', '🎂 Rike, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:35.000Z', '153460064'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285740338349' limit 1),
  '6285740338349', 'other', '🎂 Nila, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:35.999Z', '153460067'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6289635958451' limit 1),
  '6289635958451', 'other', '🎂 Gita, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:37.000Z', '153460068'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6288221517108' limit 1),
  '6288221517108', 'other', '🎂 IVOW, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:38.000Z', '153460070'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '62895355328201' limit 1),
  '62895355328201', 'other', '🎂 Tasya, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:38.000Z', '153460073'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6289670426581' limit 1),
  '6289670426581', 'other', '🎂 Desita, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:39.000Z', '153460076'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285607596835' limit 1),
  '6285607596835', 'other', '🎂 Intan, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:40.000Z', '153460077'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6281326776754' limit 1),
  '6281326776754', 'other', '🎂 Hasna, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:40.999Z', '153460079'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6281359173670' limit 1),
  '6281359173670', 'other', '🎂 Ana, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:40.999Z', '153460081'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6282136824529' limit 1),
  '6282136824529', 'other', '🎂 Alvin, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:42.000Z', '153460083'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285748489448' limit 1),
  '6285748489448', 'other', '🎂 Zahra , hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:43.000Z', '153460086'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6289530536519' limit 1),
  '6289530536519', 'other', '🎂 Inggrita, hari ini ada yang ulang tahun nih!

Yuk, saling merayakan dan mendoakan! Tinggal buka Zota App dan tulis pesannya. Cukup 30 detik 💌', 'sent', '2026-04-25T19:15:43.999Z', '153460088'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285879512220' limit 1),
  '6285879512220', 'celebration_greeting_notification', '💌 Ikaa, ada ucapan ulang tahun baru dari Desita!

Buka Zota App buat balas ✨', 'sent', '2026-04-25T19:16:29.000Z', '153460173'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285879512220' limit 1),
  '6285879512220', 'celebration_greeting_notification', '💌 Ikaa, ada ucapan ulang tahun baru dari Gita!

Buka Zota App buat balas ✨', 'sent', '2026-04-25T19:16:45.000Z', '153460196'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285879512220' limit 1),
  '6285879512220', 'celebration_greeting_notification', '💌 Ikaa, ada ucapan ulang tahun baru dari Inggrita!

Buka Zota App buat balas ✨', 'sent', '2026-04-25T19:18:06.000Z', '153460328'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285879512220' limit 1),
  '6285879512220', 'celebration_greeting_notification', '💌 Ikaa, ada ucapan ulang tahun baru dari Ana!

Buka Zota App buat balas ✨', 'sent', '2026-04-25T19:20:04.000Z', '153460533'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;

insert into whatsapp_send_logs
  (recipient_profile_id, recipient_phone, event_type, message_body, status, sent_at, fonnte_id)
values (
  (select id from profiles where regexp_replace(coalesce(whatsapp_number,''),'[^0-9]','','g') = '6285879512220' limit 1),
  '6285879512220', 'celebration_greeting_notification', '💌 Ikaa, ada ucapan ulang tahun baru dari Alvin!

Buka Zota App buat balas ✨', 'sent', '2026-04-25T19:27:30.000Z', '153461136'
)
on conflict (fonnte_id) where fonnte_id is not null do update set
  message_body = excluded.message_body,
  status = excluded.status,
  sent_at = excluded.sent_at,
  recipient_profile_id = excluded.recipient_profile_id,
  event_type = excluded.event_type;
