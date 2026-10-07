"use client";

import { useEffect } from "react";

/**
 * Mencegah pop-up tertutup ketika kursor di-drag dari DALAM kotak lalu
 * dilepas di LUAR kotak (mis. saat menyeleksi teks) — atau sebaliknya.
 *
 * Penyebabnya perilaku browser: bila mouse-down dan mouse-up jatuh di
 * elemen berbeda, event `click` dikirim ke leluhur bersama mereka — yaitu
 * lapisan latar (backdrop) yang membungkus kotak pop-up. Puluhan pop-up
 * buatan sendiri di aplikasi ini menutup diri pada `onClick` latar, jadi
 * "click" palsu itu menutupnya.
 *
 * Satu penjaga global di sini menelan click seperti itu untuk SEMUA pop-up
 * (juga yang dibuat nanti), alih-alih menambal ±60 komponen satu per satu.
 * Click dianggap "palsu" bila: targetnya elemen `position: fixed` seukuran
 * layar (backdrop) DAN mouse-down atau mouse-up-nya terjadi di elemen lain
 * (bukan tepat di backdrop). Klik sungguhan di backdrop (down & up sama-sama
 * di backdrop) tetap menutup pop-up seperti biasa.
 */
export function OverlayDragGuard() {
  useEffect(() => {
    let downTarget: EventTarget | null = null;
    let upTarget: EventTarget | null = null;

    const onDown = (e: MouseEvent) => {
      downTarget = e.target;
      upTarget = null;
    };
    const onUp = (e: MouseEvent) => {
      upTarget = e.target;
    };
    const onClick = (e: MouseEvent) => {
      const down = downTarget;
      const up = upTarget;
      downTarget = null;
      upTarget = null;
      const target = e.target;
      if (!(target instanceof Element) || !down || !up) return;
      // Press murni di satu elemen → klik normal.
      if (down === target && up === target) return;
      // Hanya backdrop: elemen fixed yang menutupi (hampir) seluruh layar.
      if (getComputedStyle(target).position !== "fixed") return;
      const r = target.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
