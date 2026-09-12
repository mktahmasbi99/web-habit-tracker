import { useCallback, useEffect, useRef, useState } from "react";

export function usePwaUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const reloadRequested = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let updateTimer = 0;
    const installed = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (active && worker.state === "installed" && navigator.serviceWorker.controller) setNeedRefresh(true);
      });
    };
    const controllerChanged = () => {
      if (reloadRequested.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    void navigator.serviceWorker.register("/sw.js").then(value => {
      if (!active) return;
      setRegistration(value);
      if (value.waiting && navigator.serviceWorker.controller) setNeedRefresh(true);
      installed(value.installing);
      value.addEventListener("updatefound", () => installed(value.installing));
      updateTimer = window.setInterval(() => {
        if (navigator.onLine && !value.installing) void value.update();
      }, 60 * 60 * 1000);
    }).catch(error => console.error("Service worker registration failed.", error));
    return () => {
      active = false;
      window.clearInterval(updateTimer);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
    };
  }, []);

  const update = useCallback(async () => {
    if (!registration?.waiting) return;
    reloadRequested.current = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }, [registration]);

  return { needRefresh, setNeedRefresh, update };
}
