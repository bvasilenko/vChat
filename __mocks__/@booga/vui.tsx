// SPDX-License-Identifier: MIT
// Copyright (c) 2026 bvasilenko
export function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) {
  return <button {...props}>{children}</button>;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} />;
}

export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children?: React.ReactNode }) {
  return <select {...props}>{children}</select>;
}

export function SelectItem({
  children,
  ...props
}: React.OptionHTMLAttributes<HTMLOptionElement> & { children?: React.ReactNode }) {
  return <option {...props}>{children}</option>;
}
