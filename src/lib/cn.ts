import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes so a caller's `className` wins conflicts instead of
 * losing to source order. Every component that accepts `className` uses this.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
