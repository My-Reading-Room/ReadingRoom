"use client";

import { useRouter } from "next/navigation";

/** A <select> whose options are URLs: choosing one navigates there. */
export function SelectNav({
  id,
  label,
  value,
  options,
}: {
  id?: string;
  label?: string;
  value: string;
  options: { href: string; text: string }[];
}) {
  const router = useRouter();
  return (
    <select
      id={id}
      aria-label={label}
      className="select"
      value={value}
      onChange={(e) => router.push(e.target.value, { scroll: false })}
    >
      {options.map((o) => (
        <option key={o.href} value={o.href}>
          {o.text}
        </option>
      ))}
    </select>
  );
}
