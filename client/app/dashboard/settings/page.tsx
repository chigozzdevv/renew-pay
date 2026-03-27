import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardSettingsPage() {
  return <DashboardPageView page={getDashboardPage("settings")} />;
}
