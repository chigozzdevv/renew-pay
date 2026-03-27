import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardDevelopersPage() {
  return <DashboardPageView page={getDashboardPage("developers")} />;
}
