/**
 * Server dev Next yang tidak meninggalkan pekerja yatim di Windows.
 *
 * Masalah: menghentikan/me-restart `next dev` (Turbopack) di Windows tidak mematikan pekerja anaknya
 * (`.next\dev\build\postcss.js`, jest-worker). Restart berulang pernah menumpuk 751 proses node (~3,4 GB) sampai server
 * berikutnya gagal start (`Zone Allocation failed`).
 *
 * Cara kerja:
 *  1. Saat start: matikan sisa proses node milik worktree INI saja (cocok jalur worktree di command line).
 *  2. Jalankan `next dev` sebagai anak; saat launcher berhenti normal (SIGINT/SIGTERM/exit), matikan seluruh pohonnya.
 *  3. Pengawas terpisah (proses detached): bila launcher mati paksa (tombol stop menjalankan TerminateProcess, tanpa
 *     sempat membersihkan), pengawas yang melihatnya lalu membersihkan worktree ini.
 *
 * Pakai:  node scripts/dev-safe.mjs          (jalankan server)
 *         node scripts/dev-safe.mjs --clean  (hanya bersihkan sisa proses)
 * Port mengikuti env PORT seperti `next dev` biasa.
 */

import { spawn, execFileSync } from "node:child_process";
import { freemem, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const MIN_FREE_GB = 1.5;

function ps(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
}

/** Matikan semua node.exe yang command line-nya memuat jalur worktree ini, kecuali PID di `keep`. */
function cleanupWorktree(keep = []) {
  const skip = [process.pid, ...keep].join(",");
  // Escape pola wildcard PowerShell supaya jalur dengan [ ] tidak salah cocok.
  const script = `
    $root = [WildcardPattern]::Escape('${ROOT.replace(/'/g, "''")}')
    $skip = @(${skip})
    $victims = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Where-Object { $_.CommandLine -like "*$root*" -and $skip -notcontains $_.ProcessId }
    $n = 0
    foreach ($p in $victims) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }
    Write-Output $n`;
  try {
    return Number(ps(script).trim()) || 0;
  } catch {
    return 0;
  }
}

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } catch {
    /* sudah mati */
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const args = process.argv.slice(2);

if (args[0] === "--watch") {
  // Pengawas: bila launcher hilang, bersihkan worktree ini lalu selesai.
  const launcherPid = Number(args[1]);
  const timer = setInterval(() => {
    if (isAlive(launcherPid)) return;
    clearInterval(timer);
    cleanupWorktree();
    process.exit(0);
  }, 2000);
} else if (args[0] === "--clean") {
  console.log(`[dev-safe] ${cleanupWorktree()} proses sisa dimatikan`);
} else {
  const killed = cleanupWorktree();
  if (killed > 0) console.log(`[dev-safe] ${killed} proses sisa worktree ini dimatikan`);

  const freeGb = freemem() / 1024 ** 3;
  console.log(`[dev-safe] RAM bebas ${freeGb.toFixed(1)} GB dari ${(totalmem() / 1024 ** 3).toFixed(1)} GB`);
  if (freeGb < MIN_FREE_GB) {
    console.error(
      `[dev-safe] RAM bebas di bawah ${MIN_FREE_GB} GB. Tutup aplikasi lain atau bersihkan node yatim (worktree lain) dulu.`
    );
    process.exit(1);
  }

  const child = spawn(
    process.execPath,
    ["--max-old-space-size=3072", path.join(ROOT, "node_modules/next/dist/bin/next"), "dev"],
    { cwd: ROOT, stdio: "inherit", windowsHide: true }
  );

  // Pengawas lepas dari launcher: tetap hidup walau launcher dibunuh paksa.
  spawn(process.execPath, [SELF, "--watch", String(process.pid)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();

  let closing = false;
  const shutdown = (code) => {
    if (closing) return;
    closing = true;
    killTree(child.pid);
    cleanupWorktree();
    process.exit(code);
  };
  child.on("exit", (code) => shutdown(code ?? 0));
  for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) process.on(sig, () => shutdown(0));
  process.on("exit", () => {
    if (!closing) killTree(child.pid);
  });
}
