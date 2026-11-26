"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}

export function RankResetCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const day = 86400;
    const update = () => setRemaining(day - Math.floor(Date.now() / 1000) % day);
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const clock = remaining === null ? "--:--:--" : [
    Math.floor(remaining / 3600),
    Math.floor(remaining / 60) % 60,
    remaining % 60,
  ].map(value => String(value).padStart(2, "0")).join(":");
  return <span role="timer" aria-label="Time until daily ranks reset" style={{ fontVariantNumeric: "tabular-nums" }}>{clock}</span>;
}
