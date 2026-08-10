/**
 * Merender badan notulen sebagai prosa.
 *
 * Notulen ditulis admin sebagai teks biasa, bukan HTML — jadi tidak ada
 * `dangerouslySetInnerHTML` di sini dan tidak perlu ada. Yang dikenali cuma
 * dua hal: baris kosong memisahkan paragraf, dan baris berawalan "- "
 * menjadi butir daftar. Sengaja sesempit itu; notulen rapat tidak butuh
 * editor kaya, dan setiap fitur markup tambahan adalah permukaan yang harus
 * dijaga aman.
 */
export function MeetingNoteBody({ body }: { body: string }) {
  const blocks = body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        const isList = lines.every((l) => l.startsWith("- "));

        if (isList) {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                  <span
                    aria-hidden
                    className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-primary"
                  />
                  <span>{l.slice(2)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i} className="text-sm leading-relaxed text-foreground">
            {block}
          </p>
        );
      })}
    </div>
  );
}
