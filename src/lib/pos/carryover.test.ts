import { describe, expect, it } from "vitest";
import { carryoverError, noteRequired, reasonLabel } from "./carryover";

describe("carryoverError", () => {
  it("menerima alasan preset tanpa catatan", () => {
    expect(carryoverError("sale", { reasonCode: "bayar_besok", note: "" }, false)).toBeNull();
    expect(carryoverError("cake", { reasonCode: "ambil_besok", note: "" }, false)).toBeNull();
  });

  it("menolak kode yang bukan milik jenisnya", () => {
    expect(carryoverError("sale", { reasonCode: "ambil_besok", note: "" }, false)).not.toBeNull();
    expect(carryoverError("cake", { reasonCode: "bayar_besok", note: "" }, false)).not.toBeNull();
    expect(carryoverError("sale", { reasonCode: "", note: "" }, false)).not.toBeNull();
  });

  it("Lainnya wajib catatan minimal 3 karakter", () => {
    expect(carryoverError("sale", { reasonCode: "lainnya", note: "  " }, false)).not.toBeNull();
    expect(carryoverError("sale", { reasonCode: "lainnya", note: "ab" }, false)).not.toBeNull();
    expect(carryoverError("sale", { reasonCode: "lainnya", note: "abc" }, false)).toBeNull();
  });

  it("pesanan yang sudah pernah ditunda wajib catatan baru walau alasannya preset", () => {
    expect(carryoverError("sale", { reasonCode: "bayar_besok", note: "" }, true)).not.toBeNull();
    expect(carryoverError("sale", { reasonCode: "bayar_besok", note: "janji transfer Jumat" }, true)).toBeNull();
    expect(noteRequired("bayar_besok", true)).toBe(true);
    expect(noteRequired("bayar_besok", false)).toBe(false);
  });
});

describe("reasonLabel", () => {
  it("memetakan kode ke label, kode asing apa adanya", () => {
    expect(reasonLabel("sale", "bayar_besok")).toBe("Pelanggan bayar besok");
    expect(reasonLabel("cake", "belum_datang")).toBe("Pelanggan belum datang");
    expect(reasonLabel("sale", "xyz")).toBe("xyz");
  });
});
