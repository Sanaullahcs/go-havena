import { useCallback, useRef, useState } from "react";

export function useSideMenu() {
  const [visible, setVisible] = useState(false);
  const openingRef = useRef(false);

  const openMenu = useCallback(() => {
    if (openingRef.current || visible) return;
    openingRef.current = true;
    setVisible(true);
    setTimeout(() => {
      openingRef.current = false;
    }, 300);
  }, [visible]);

  const closeMenu = useCallback(() => {
    openingRef.current = false;
    setVisible(false);
  }, []);

  return {
    visible,
    openMenu,
    closeMenu,
  };
}
