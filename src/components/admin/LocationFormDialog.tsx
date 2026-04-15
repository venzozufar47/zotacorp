"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createLocation,
  updateLocation,
  type LocationInput,
} from "@/lib/actions/location.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export interface LocationFormValue extends LocationInput {
  id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: LocationFormValue;
  onSaved: () => void;
}

export function LocationFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const { t } = useTranslation();
  const tl = t.adminLocations;
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? "");
  // Match the locations table's 6-decimal display so what the admin
  // sees in the Coordinates column is exactly what they see in this
  // dialog's inputs. `String(number)` prints full double precision and
  // would diverge from the table by 1–2 trailing digits.
  const [latitude, setLatitude] = useState<string>(
    initial ? initial.latitude.toFixed(6) : ""
  );
  const [longitude, setLongitude] = useState<string>(
    initial ? initial.longitude.toFixed(6) : ""
  );
  const [radius, setRadius] = useState<string>(
    initial ? String(initial.radius_m) : "200"
  );
  const [gpsBusy, setGpsBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(initial?.name ?? "");
    setLatitude(initial ? initial.latitude.toFixed(6) : "");
    setLongitude(initial ? initial.longitude.toFixed(6) : "");
    setRadius(initial ? String(initial.radius_m) : "200");
  }

  /**
   * Re-sync local form state whenever we're opened against a different
   * row. Without this, the dialog stays mounted across edits and keeps
   * the previous row's name/lat/lng in state — clicking Save would then
   * silently overwrite row B with row A's fields. This guard keys off
   * `open` + the target id so a fresh open (edit or create) always
   * starts clean. The `initial?.id` dependency also catches the create
   * → edit transition without an intervening close.
   */
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error(tl.gpsUnavailable);
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGpsBusy(false);
        toast.success(tl.gpsFilled);
      },
      () => {
        setGpsBusy(false);
        toast.error(tl.gpsFailed);
      },
      { timeout: 8000, maximumAge: 0, enableHighAccuracy: true }
    );
  }

  function onSubmit() {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const r = parseInt(radius, 10);
    const input: LocationInput = {
      name: name.trim(),
      latitude: lat,
      longitude: lng,
      radius_m: r,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateLocation(initial!.id!, input)
        : await createLocation(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? tl.savedToast : tl.addedToast);
      onOpenChange(false);
      reset();
      onSaved();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? tl.editTitle : tl.createTitle}</DialogTitle>
          <DialogDescription>{tl.formDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="loc-name">{tl.nameLabel}</Label>
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tl.namePlaceholder}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loc-lat">{tl.latLabel}</Label>
              <Input
                id="loc-lat"
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="-6.208800"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-lng">{tl.lngLabel}</Label>
              <Input
                id="loc-lng"
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="106.845600"
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={useCurrentLocation}
            disabled={gpsBusy}
          >
            {gpsBusy ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1.5" />
                {tl.useGpsBusy}
              </>
            ) : (
              <>
                <MapPin size={14} className="mr-1.5" />
                {tl.useGpsCta}
              </>
            )}
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="loc-radius">{tl.radiusLabel}</Label>
            <Input
              id="loc-radius"
              type="number"
              min={10}
              max={5000}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              placeholder="200"
            />
            <p className="text-xs text-muted-foreground">{tl.radiusHint}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tl.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? tl.saving : isEdit ? tl.save : tl.add}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
