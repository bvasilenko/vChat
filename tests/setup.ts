// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
