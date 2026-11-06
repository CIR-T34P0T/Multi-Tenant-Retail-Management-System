import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/modules/core/settings/components/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Business details, preferences, features, staff and roles."
      />
      <SettingsNav />
      <div className="max-w-3xl">{children}</div>
    </div>
  );
}
