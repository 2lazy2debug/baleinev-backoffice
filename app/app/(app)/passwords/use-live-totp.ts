"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getTotpCodeAction } from "./actions";

/**
 * The live 2FA code of one entry. The code itself is still generated on the
 * server; this only keeps asking for the next one when the current one runs out.
 *
 * The countdown is a 1 s tick that pauses while the tab is hidden — a code
 * nobody can see is not worth a request every 30 s — and catches up the moment
 * the tab is visible again. An error stops the polling until `retry()`.
 */
export function useLiveTotp(entryId: string, enabled: boolean) {
  const [live, setLive] = useState<{ code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const fetchCode = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const result = await getTotpCodeAction(entryId);
      if (result.ok) {
        const received = Date.now();
        setLive({ code: result.code, expiresAt: received + result.msRemaining });
        setNow(received);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
    }
  }, [entryId]);

  useEffect(() => {
    if (enabled) {
      void fetchCode();
    }
  }, [enabled, fetchCode]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNow(Date.now());
    const start = () => {
      if (timer === null) {
        timer = setInterval(tick, 1000);
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };

    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled && !error && live && now >= live.expiresAt) {
      void fetchCode();
    }
  }, [enabled, error, live, now, fetchCode]);

  const retry = useCallback(() => {
    setError(null);
    void fetchCode();
  }, [fetchCode]);

  return {
    code: live?.code ?? null,
    secondsLeft: live ? Math.max(0, Math.ceil((live.expiresAt - now) / 1000)) : 0,
    error,
    retry,
  };
}
