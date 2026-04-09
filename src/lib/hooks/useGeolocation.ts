"use client";

import { useState, useCallback } from "react";

interface Coords {
  latitude: number;
  longitude: number;
}

interface UseGeolocationReturn {
  coords: Coords | null;
  status: "idle" | "requesting" | "granted" | "denied" | "unavailable";
  requestLocation: () => Promise<Coords | null>;
}

export function useGeolocation(): UseGeolocationReturn {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<UseGeolocationReturn["status"]>("idle");

  const requestLocation = useCallback(async (): Promise<Coords | null> => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return null;
    }

    setStatus("requesting");

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const c: Coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setCoords(c);
          setStatus("granted");
          resolve(c);
        },
        () => {
          setStatus("denied");
          resolve(null);
        },
        { timeout: 8000, maximumAge: 60000 }
      );
    });
  }, []);

  return { coords, status, requestLocation };
}
