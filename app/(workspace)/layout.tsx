import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeControl } from "@/components/theme-control";

export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-surface-raised px-3">
        <span className="font-mono text-xs font-medium tracking-tight">
          Code Meridian
        </span>
        <span className="h-4 w-px bg-border" aria-hidden />
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
        />
        <div className="ml-auto flex items-center gap-3">
          <ThemeControl />
          <UserButton />
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
