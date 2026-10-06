"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { EyeOff } from "lucide-react";
import {
  getShowcase,
  getShowcaseServerSnapshot,
  setShowcase,
  subscribeShowcase,
} from "@/lib/showcase/store";

export function useShowcase(): boolean {
  return useSyncExternalStore(
    subscribeShowcase,
    getShowcase,
    getShowcaseServerSnapshot
  );
}

/**
 * Mode Showcase — menyembunyikan SEMUA angka di halaman mana pun (admin,
 * karyawan, POS, investor) untuk presentasi.
 *
 * Kenapa lewat DOM, bukan per-komponen: angka tersebar di ratusan
 * komponen/formatter, termasuk teks SVG chart, tooltip, toast, dan dialog.
 * Satu MutationObserver di root layout menjamin tidak ada yang terlewat,
 * termasuk halaman yang dibuat nanti.
 *
 *  - Teks: setiap token angka (`1.234.567`, `12,5`, `09:30`, `06/10/2026`)
 *    diganti "•••" — angka tetap tak terbaca dan jumlah digitnya (besaran)
 *    pun tidak bocor. Teks asli disimpan dan dipulihkan saat mode dimatikan.
 *  - Input/textarea/select berisi angka: di-blur (nilai control tidak boleh
 *    diubah, nanti merusak form).
 *  - iframe/embed/object (preview PDF dll.): di-blur lewat CSS.
 */

const DIGIT = /\d/;
const NUMBER_TOKEN = /\d+(?:[.,:/-]\d+)*/g;
const MASK = "•••";
const SKIP_TEXT_PARENTS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TITLE", "TEMPLATE"]);
const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "hidden",
  "range",
  "file",
  "color",
  "image",
]);
const FIELD_SELECTOR = "input,textarea,select";
const BLUR_ATTR = "data-showcase-blur";

function fieldHasDigits(el: Element): boolean {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.selectedOptions).some((o) => DIGIT.test(o.text));
  }
  if (el instanceof HTMLInputElement) {
    if (NON_TEXT_INPUTS.has(el.type)) return false;
    return DIGIT.test(el.value);
  }
  if (el instanceof HTMLTextAreaElement) return DIGIT.test(el.value);
  return false;
}

function syncField(el: Element) {
  const has = fieldHasDigits(el);
  if (has) {
    if (!el.hasAttribute(BLUR_ATTR)) el.setAttribute(BLUR_ATTR, "");
  } else if (el.hasAttribute(BLUR_ATTR)) {
    el.removeAttribute(BLUR_ATTR);
  }
}

function startMasking(): () => void {
  /** Teks asli per text node yang sedang dimask (untuk dipulihkan). */
  const originals = new Map<Text, string>();
  /** Hasil mask yang KITA tulis — membedakan tulisan kita dari update React. */
  const written = new WeakMap<Text, string>();

  function maskText(node: Text) {
    const value = node.nodeValue ?? "";
    if (written.get(node) === value) return;
    if (!DIGIT.test(value)) {
      // React menimpa teks bermask dengan teks tanpa angka → lupakan aslinya.
      originals.delete(node);
      return;
    }
    const parent = node.parentElement;
    if (parent && SKIP_TEXT_PARENTS.has(parent.tagName)) return;
    const masked = value.replace(NUMBER_TOKEN, MASK);
    originals.set(node, value);
    written.set(node, masked);
    node.nodeValue = masked;
  }

  function scan(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) {
      maskText(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    // Kumpulkan dulu — mengubah nodeValue saat berjalan aman, tapi ini
    // menjaga walker tidak bergantung pada mutasi.
    const texts: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
    texts.forEach(maskText);
    if (el.matches(FIELD_SELECTOR)) syncField(el);
    el.querySelectorAll(FIELD_SELECTOR).forEach(syncField);
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") {
        if (r.target.nodeType === Node.TEXT_NODE) maskText(r.target as Text);
      } else {
        r.addedNodes.forEach(scan);
      }
    }
  });

  scan(document.body);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  // Nilai input berubah lewat properti (bukan atribut/DOM mutation) → tidak
  // terlihat oleh observer. Ketik langsung ditangkap event; update dari
  // state ditangkap sapuan berkala.
  const onFieldEvent = (e: Event) => {
    if (e.target instanceof Element && e.target.matches(FIELD_SELECTOR)) syncField(e.target);
  };
  document.addEventListener("input", onFieldEvent, true);
  document.addEventListener("change", onFieldEvent, true);
  const sweep = window.setInterval(() => {
    document.querySelectorAll(FIELD_SELECTOR).forEach(syncField);
    // Buang text node yang sudah lepas dari DOM supaya Map tidak membengkak.
    if (originals.size > 2000) {
      for (const node of originals.keys()) if (!node.isConnected) originals.delete(node);
    }
  }, 400);

  return () => {
    observer.disconnect();
    document.removeEventListener("input", onFieldEvent, true);
    document.removeEventListener("change", onFieldEvent, true);
    window.clearInterval(sweep);
    originals.forEach((orig, node) => {
      if (node.isConnected && node.nodeValue === written.get(node)) node.nodeValue = orig;
    });
    originals.clear();
    document.querySelectorAll(`[${BLUR_ATTR}]`).forEach((el) => el.removeAttribute(BLUR_ATTR));
  };
}

export function ShowcaseMode() {
  const on = useShowcase();
  const pathname = usePathname();

  useEffect(() => {
    const html = document.documentElement;
    // Selama hidrasi `on` memakai snapshot server (false) walau mode aktif
    // → tanya store langsung, jangan sampai menyingkap halaman terlalu dini.
    if (!on) {
      if (!getShowcase()) {
        html.removeAttribute("data-showcase");
        html.removeAttribute("data-showcase-ready");
      }
      return;
    }

    // Muat awal dengan mode sudah aktif (skrip di layout sudah memasang
    // data-showcase dan halaman disembunyikan CSS): tunggu hidrasi React
    // selesai sebelum menyentuh DOM — teks yang diubah sebelum hidrasi memicu
    // hydration mismatch. Toggle saat runtime langsung jalan tanpa jeda.
    const initialLoad =
      html.hasAttribute("data-showcase") && !html.hasAttribute("data-showcase-ready");
    html.setAttribute("data-showcase", "on");

    let stop: (() => void) | undefined;
    let timer: number | undefined;
    const begin = () => {
      stop = startMasking();
      html.setAttribute("data-showcase-ready", "1");
    };

    if (initialLoad) {
      const delayed = () => {
        timer = window.setTimeout(begin, 300);
      };
      if (document.readyState === "complete") delayed();
      else window.addEventListener("load", delayed, { once: true });
      return () => {
        window.removeEventListener("load", delayed);
        if (timer !== undefined) window.clearTimeout(timer);
        stop?.();
      };
    }

    begin();
    return () => stop?.();
  }, [on]);

  // Halaman tanpa topbar admin (karyawan, POS, investor, admin mobile) tidak
  // punya tombol → beri pil kecil agar mode bisa dimatikan dari mana pun.
  const topbarHasToggle = pathname.startsWith("/admin");
  if (!on) return null;
  return (
    <button
      type="button"
      onClick={() => setShowcase(false)}
      className={
        "fixed right-2 top-2 z-[300] items-center gap-1.5 rounded-full bg-foreground/85 px-3 h-8 text-[11px] font-semibold text-background shadow-lg backdrop-blur " +
        (topbarHasToggle ? "inline-flex md:hidden" : "inline-flex")
      }
      style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <EyeOff size={13} />
      Showcase aktif · Matikan
    </button>
  );
}
