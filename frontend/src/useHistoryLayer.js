import { useEffect, useRef } from "react";

let nextLayerId = 0;

function releaseActiveControl() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

export default function useHistoryLayer(isOpen, dismiss, name = "layer") {
  const tokenRef = useRef(`${name}-${++nextLayerId}`);
  const dismissRef = useRef(dismiss);
  const activeRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  useEffect(() => {
    if (isOpen && !activeRef.current && !dismissedRef.current) {
      const token = tokenRef.current;
      window.history.pushState(
        { ...window.history.state, uiLayer: token },
        "",
        window.location.href
      );
      activeRef.current = true;
      return;
    }

    if (!isOpen) {
      if (activeRef.current && window.history.state?.uiLayer === tokenRef.current) {
        window.history.back();
      }
      activeRef.current = false;
      dismissedRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    const handlePopState = () => {
      if (!activeRef.current || window.history.state?.uiLayer === tokenRef.current) return;
      releaseActiveControl();
      activeRef.current = false;
      dismissedRef.current = true;
      dismissRef.current();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return () => {
    if (!isOpen) return;
    releaseActiveControl();
    if (activeRef.current && window.history.state?.uiLayer === tokenRef.current) {
      window.history.back();
    } else {
      activeRef.current = false;
      dismissedRef.current = true;
      dismissRef.current();
    }
  };
}
