// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
import { Select, SelectItem } from "@booga/vui";

export interface ModelSelectorProps {
  readonly models: readonly string[];
  readonly value: string;
  readonly onChange: (model: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function ModelSelector({ models, value, onChange, disabled, className }: ModelSelectorProps) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Select model"
      className={className}
    >
      {models.map((model) => (
        <SelectItem key={model} value={model}>
          {model}
        </SelectItem>
      ))}
    </Select>
  );
}
