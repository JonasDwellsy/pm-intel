"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SearchModal } from "./SearchModal";

// Global search overlay — mounts the Cmd+K modal and the keyboard
// listener once at app shell level. Exposes a context so any descendant
// (e.g. the top-nav SearchInput's "Open full search" hint) can trigger
// the modal programmatically.

interface SearchOverlayContextValue {
  open: () => void;
  close: () => void;
}

const SearchOverlayContext = createContext<SearchOverlayContextValue | null>(
  null
);

export function useSearchOverlay(): SearchOverlayContextValue {
  const ctx = useContext(SearchOverlayContext);
  if (!ctx) {
    // Defensive — outside the provider the open() / close() calls are
    // no-ops so consumers don't crash. Useful for unit tests of leaf
    // components.
    return { open: () => {}, close: () => {} };
  }
  return ctx;
}

export function SearchOverlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  // Cmd+K (Mac) and Ctrl+K (Windows/Linux) global handler. Mounted once
  // at the provider; the modal itself handles ESC internally while open.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Detect ⌘+K on macOS, Ctrl+K on Windows/Linux. Skip Shift+K /
      // Alt+K / etc — those are unrelated key combos.
      const isCmdK =
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "k" || e.key === "K");
      if (isCmdK) {
        e.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SearchOverlayContext.Provider value={{ open: handleOpen, close: handleClose }}>
      {children}
      <SearchModal open={open} onClose={handleClose} />
    </SearchOverlayContext.Provider>
  );
}
