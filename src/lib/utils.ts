// lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Using `unknown[]` for args type as it's more type-safe than `any[]` for generic utilities.
// The primary goal is to capture the parameters of T.
export function debounce<T extends (...args: unknown[]) => void>(
  func: T, 
  waitFor: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>): void => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      func(...args);
    }, waitFor);
  };
}