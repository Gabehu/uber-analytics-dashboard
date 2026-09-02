import { useEffect, useRef, useState } from "react";

const EXIT_WINDOW_MS = 950;

export default function useRootBackGuard(isAtRoot, appKey) {
  const [showExitHint, setShowExitHint] = useState(false);
  const isAtRootRef = useRef(isAtRoot);
  const exitDeadlineRef = useRef(0);
  const resetTimerRef = useRef(null);
  const launchIdRef = useRef(
    `${appKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  useEffect(() => {
    isAtRootRef.current = isAtRoot;

    if (!isAtRoot) {
      exitDeadlineRef.current = 0;
      setShowExitHint(false);
      window.clearTimeout(resetTimerRef.current);
      return;
    }

    const sentinelKey = `${appKey}RootSentinel`;
    const guardKey = `${appKey}RootGuard`;
    const launchId = launchIdRef.current;

    if (window.history.state?.[guardKey] === launchId) return;
    if (window.history.state?.[sentinelKey] === launchId) {
      window.history.forward();
      return;
    }
    if (window.history.state?.[sentinelKey] !== launchId) {
      window.history.replaceState(
        {
          ...window.history.state,
          [sentinelKey]: launchId,
          [guardKey]: null,
        },
        "",
        window.location.href
      );
    }
    window.history.pushState(
      {
        ...window.history.state,
        [sentinelKey]: null,
        [guardKey]: launchId,
      },
      "",
      window.location.href
    );
  }, [appKey, isAtRoot]);

  useEffect(() => {
    const sentinelKey = `${appKey}RootSentinel`;
    const guardKey = `${appKey}RootGuard`;
    const launchId = launchIdRef.current;

    const disarm = () => {
      exitDeadlineRef.current = 0;
      setShowExitHint(false);
      window.clearTimeout(resetTimerRef.current);
    };

    const ensureFreshGuard = () => {
      if (!isAtRootRef.current) return;
      disarm();
      if (window.history.state?.[guardKey] === launchId) return;
      if (window.history.state?.[sentinelKey] === launchId) {
        window.history.forward();
        return;
      }
      window.history.replaceState(
        {
          ...window.history.state,
          [sentinelKey]: launchId,
          [guardKey]: null,
        },
        "",
        window.location.href
      );
      window.history.pushState(
        {
          ...window.history.state,
          [sentinelKey]: null,
          [guardKey]: launchId,
        },
        "",
        window.location.href
      );
    };

    // Android may preserve this document after the standalone window closes.
    ensureFreshGuard();

    const arm = () => {
      const deadline = Date.now() + EXIT_WINDOW_MS;
      exitDeadlineRef.current = deadline;
      setShowExitHint(true);
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => {
        if (exitDeadlineRef.current !== deadline) return;

        disarm();
        // The first Back leaves us on the sentinel while the hint is visible.
        // If the user does not press Back again quickly, return to the guard
        // entry so the next physical Back starts a fresh two-press sequence.
        if (window.history.state?.[sentinelKey] === launchId) {
          window.history.forward();
        } else {
          ensureFreshGuard();
        }
      }, EXIT_WINDOW_MS);
    };

    const handlePopState = (event) => {
      if (
        !isAtRootRef.current ||
        event.state?.[sentinelKey] !== launchId
      ) {
        return;
      }

      // A suspended phone can pause timers for minutes. The wall-clock
      // deadline makes an expired warning behave like a brand-new first press.
      arm();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") ensureFreshGuard();
      else disarm();
    };
    const handlePageShow = () => ensureFreshGuard();
    const handlePageHide = () => disarm();

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("focus", ensureFreshGuard);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("focus", ensureFreshGuard);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.clearTimeout(resetTimerRef.current);
    };
  }, [appKey]);

  return showExitHint;
}
