"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin, Loader2, Check, CircleAlert } from "lucide-react";
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
import { resolveMapsLink } from "@/lib/actions/maps-link.actions";
import {
  parseCoordsFromText,
  isShortMapsLink,
  buildMapsLink,
  type LatLng,
} from "@/lib/utils/maps-link";
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

type ParseState =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "ok"; coords: LatLng }
  | { status: "error"; message: string };

export function LocationFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const { t } = useTranslation();
  const tl = t.adminLocations;
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? "");
  const [link, setLink] = useState<string>(
    initial ? buildMapsLink(initial.latitude, initial.longitude) : ""
  );
  const [radius, setRadius] = useState<string>(
    initial ? String(initial.radius_m) : "200"
  );
  const [parse, setParse] = useState<ParseState>(
    initial ? { status: "ok", coords: { lat: initial.latitude, lng: initial.longitude } } : { status: "idle" }
  );
  const [gpsBusy, setGpsBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  // Re-sync when the dialog opens against a different target row. Without
  // this, edit-A → edit-B keeps A's values in state and clobbers B on
  // save (the bug that overwrote the Tlogosari row earlier).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setLink(initial ? buildMapsLink(initial.latitude, initial.longitude) : "");
    setRadius(initial ? String(initial.radius_m) : "200");
    setParse(
      initial
        ? { status: "ok", coords: { lat: initial.latitude, lng: initial.longitude } }
        : { status: "idle" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  /**
   * Parse the link field. Direct URLs + raw "lat, lng" resolve instantly
   * client-side; short links (`maps.app.goo.gl/...`) fall through to a
   * server action that follows the redirect. We skip the server hop when
   * the field is empty or clearly isn't a short link, to keep feedback
   * responsive while typing.
   */
  function onLinkChange(value: string) {
    setLink(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setParse({ status: "idle" });
      return;
    }
    const direct = parseCoordsFromText(trimmed);
    if (direct) {
      setParse({ status: "ok", coords: direct });
      return;
    }
    if (isShortMapsLink(trimmed)) {
      setParse({ status: "parsing" });
      // No debounce needed — short-link fetches are rare and fast, and
      // onChange fires as the admin pastes (not per-keystroke typing).
      resolveMapsLink(trimmed).then((res) => {
        // Guard against stale responses if the field changed mid-fetch.
        setLink((current) => {
          if (current.trim() !== trimmed) return current;
          if (res.ok) setParse({ status: "ok", coords: res.coords });
          else setParse({ status: "error", message: res.error });
          return current;
        });
      });
      return;
    }
    setParse({ status: "error", message: tl.mapsLinkInvalid });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error(tl.gpsUnavailable);
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLink(buildMapsLink(lat, lng));
        setParse({ status: "ok", coords: { lat, lng } });
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
    if (parse.status !== "ok") {
      toast.error(tl.mapsLinkInvalid);
      return;
    }
    const r = parseInt(radius, 10);
    const input: LocationInput = {
      name: name.trim(),
      latitude: parse.coords.lat,
      longitude: parse.coords.lng,
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
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          <div className="space-y-1.5">
            <Label htmlFor="loc-link">{tl.mapsLinkLabel}</Label>
            <Input
              id="loc-link"
              value={link}
              onChange={(e) => onLinkChange(e.target.value)}
              placeholder={tl.mapsLinkPlaceholder}
              inputMode="url"
            />
            <CoordsPreview state={parse} tl={tl} />
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending} loading={pending}>
            {tl.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={pending || parse.status !== "ok"}>
            {pending ? tl.saving : isEdit ? tl.save : tl.add}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compact status line under the link input: spinner while the server is
 * resolving a short link, green "detected" pill once coords resolve,
 * amber error line otherwise. Coords render without any rounding — full
 * double precision so admin sees exactly what lands in the DB.
 */
function CoordsPreview({
  state,
  tl,
}: {
  state: ParseState;
  tl: {
    mapsLinkParsing: string;
    mapsLinkDetected: string;
    mapsLinkInvalid: string;
  };
}) {
  if (state.status === "idle") return null;
  if (state.status === "parsing") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        {tl.mapsLinkParsing}
      </p>
    );
  }
  if (state.status === "ok") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-quaternary font-bold">
        <Check size={12} strokeWidth={3} />
        <span>
          {tl.mapsLinkDetected}{" "}
          <span className="tabular-nums">
            {state.coords.lat}, {state.coords.lng}
          </span>
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-destructive font-bold">
      <CircleAlert size={12} strokeWidth={2.5} />
      {state.message}
    </p>
  );
}
