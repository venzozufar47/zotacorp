"use client";

import { useState, useTransition } from "react";
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
  const [latitude, setLatitude] = useState<string>(
    initial ? String(initial.latitude) : ""
  );
  const [longitude, setLongitude] = useState<string>(
    initial ? String(initial.longitude) : ""
  );
  const [radius, setRadius] = useState<string>(
    initial ? String(initial.radius_m) : "200"
  );
  const [gpsBusy, setGpsBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(initial?.name ?? "");
    setLatitude(initial ? String(initial.latitude) : "");
    setLongitude(initial ? String(initial.longitude) : "");
    setRadius(initial ? String(initial.radius_m) : "200");
  }

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
