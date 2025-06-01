// lib/hooks/useIsMacOs.ts
"use client";

import { useEffect, useState } from 'react';

/**
 * Checks if the current operating system is macOS.
 * This hook is designed to run on the client side.
 * @returns {boolean} True if macOS, false otherwise.
 */
export function useIsMacOs(): boolean {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Ensure this code runs only on the client side where `window` is available.
    if (typeof window !== "undefined") {
      setIsMac(/Mac|iPod|iPhone|iPad/.test(window.navigator.platform));
    }
  }, []); // Empty dependency array ensures this runs once on mount

  return isMac;
}