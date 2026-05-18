// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Class composition with Tailwind conflict resolution: a consumer-supplied
// className passed last overrides vChat's default layout classes.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
