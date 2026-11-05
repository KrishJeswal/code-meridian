import type { ReactNode } from "react";
import { MeridianMark } from "./meridian-mark";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface-sunken p-6">
      <div className="grid w-full max-w-[52rem] items-center gap-10 md:grid-cols-[1fr_auto]">
        <div className="flex max-w-[26rem] flex-col gap-4">
          <MeridianMark size={28} />
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em]">
            Code Meridian
          </h1>
          <p className="text-[13px] leading-relaxed text-text-muted">
            Paste a public TypeScript or JavaScript repository and get a map of
            it, drawn from the imports its files actually make.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
