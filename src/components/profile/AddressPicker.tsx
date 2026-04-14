"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ID_PROVINCES } from "@/lib/utils/constants";

export interface AddressValues {
  provinsi: string;
  kota: string;
  kecamatan: string;
  kelurahan: string;
  alamat: string;
}

interface Props {
  values: AddressValues;
  onChange: (patch: Partial<AddressValues>) => void;
  editing: boolean;
}

type Option = { code: string; name: string };

async function fetchWilayah(url: string): Promise<Option[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Option[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Cascading Indonesian address picker backed by wilayah.id. Stores the
 * human-readable name of each level (what's displayed) and recovers the
 * BPS code by lookup on load so child levels can be fetched. Picking a
 * new parent clears its descendants.
 */
export function AddressPicker({ values, onChange, editing }: Props) {
  const [regencies, setRegencies] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [villages, setVillages] = useState<Option[]>([]);
  const [loading, setLoading] = useState({
    regencies: false,
    districts: false,
    villages: false,
  });

  const provinceCode = useMemo(
    () => ID_PROVINCES.find((p) => p.name === values.provinsi)?.code,
    [values.provinsi]
  );
  const regencyCode = useMemo(
    () => regencies.find((r) => r.name === values.kota)?.code,
    [regencies, values.kota]
  );
  const districtCode = useMemo(
    () => districts.find((d) => d.name === values.kecamatan)?.code,
    [districts, values.kecamatan]
  );

  // Fetch regencies when province changes
  useEffect(() => {
    if (!provinceCode) {
      setRegencies([]);
      return;
    }
    let cancelled = false;
    setLoading((l) => ({ ...l, regencies: true }));
    fetchWilayah(`https://wilayah.id/api/regencies/${provinceCode}.json`).then(
      (data) => {
        if (cancelled) return;
        setRegencies(data);
        setLoading((l) => ({ ...l, regencies: false }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [provinceCode]);

  // Fetch districts when regency changes
  useEffect(() => {
    if (!regencyCode) {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    setLoading((l) => ({ ...l, districts: true }));
    fetchWilayah(`https://wilayah.id/api/districts/${regencyCode}.json`).then(
      (data) => {
        if (cancelled) return;
        setDistricts(data);
        setLoading((l) => ({ ...l, districts: false }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [regencyCode]);

  // Fetch villages when district changes
  useEffect(() => {
    if (!districtCode) {
      setVillages([]);
      return;
    }
    let cancelled = false;
    setLoading((l) => ({ ...l, villages: true }));
    fetchWilayah(`https://wilayah.id/api/villages/${districtCode}.json`).then(
      (data) => {
        if (cancelled) return;
        setVillages(data);
        setLoading((l) => ({ ...l, villages: false }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [districtCode]);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Province" value={values.provinsi} editing={editing}>
        <Select
          value={values.provinsi || undefined}
          onValueChange={(v) =>
            onChange({
              provinsi: v ?? "",
              kota: "",
              kecamatan: "",
              kelurahan: "",
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select province..." />
          </SelectTrigger>
          <SelectContent>
            {ID_PROVINCES.map((p) => (
              <SelectItem key={p.code} value={p.name}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="City / Regency" value={values.kota} editing={editing}>
        <Select
          value={values.kota || undefined}
          onValueChange={(v) =>
            onChange({ kota: v ?? "", kecamatan: "", kelurahan: "" })
          }
          disabled={!provinceCode || loading.regencies}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !provinceCode
                  ? "Select province first"
                  : loading.regencies
                  ? "Loading..."
                  : "Select city/regency..."
              }
            />
          </SelectTrigger>
          <SelectContent>
            {regencies.map((r) => (
              <SelectItem key={r.code} value={r.name}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="District" value={values.kecamatan} editing={editing}>
        <Select
          value={values.kecamatan || undefined}
          onValueChange={(v) => onChange({ kecamatan: v ?? "", kelurahan: "" })}
          disabled={!regencyCode || loading.districts}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !regencyCode
                  ? "Select regency first"
                  : loading.districts
                  ? "Loading..."
                  : "Select district..."
              }
            />
          </SelectTrigger>
          <SelectContent>
            {districts.map((d) => (
              <SelectItem key={d.code} value={d.name}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Sub-district / Village" value={values.kelurahan} editing={editing}>
        <Select
          value={values.kelurahan || undefined}
          onValueChange={(v) => onChange({ kelurahan: v ?? "" })}
          disabled={!districtCode || loading.villages}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !districtCode
                  ? "Select district first"
                  : loading.villages
                  ? "Loading..."
                  : "Select sub-district/village..."
              }
            />
          </SelectTrigger>
          <SelectContent>
            {villages.map((v) => (
              <SelectItem key={v.code} value={v.name}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="md:col-span-2">
        <Field label="Full Address" value={values.alamat} editing={editing}>
          <Textarea
            value={values.alamat}
            onChange={(e) => onChange({ alamat: e.target.value })}
            placeholder="Street, number, RT/RW, etc."
            rows={2}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  children,
}: {
  label: string;
  value?: string;
  editing: boolean;
  children: React.ReactNode;
}) {
  const isEmpty = !value || value.trim() === "";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {editing ? (
        children
      ) : (
        <p
          className={`text-sm py-2 px-3 rounded-md bg-[#f5f5f7] min-h-[36px] ${
            isEmpty ? "text-muted-foreground italic" : "text-foreground"
          }`}
        >
          {isEmpty ? "Not filled" : value}
        </p>
      )}
    </div>
  );
}
