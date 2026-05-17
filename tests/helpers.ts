// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import type { Provider } from "../src";

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

export function makeInstantProvider(reply = "Reply"): Provider {
  return {
    async *chatStream() {
      yield { kind: "content" as const, text: reply };
      yield { kind: "finish" as const, reason: "stop" as const };
    },
  };
}
