"use client";
import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // installability/offline-shell is a progressive enhancement; ignore failures
      });
    }
  }, []);
  return null;
}
