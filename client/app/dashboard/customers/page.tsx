import { DashboardPageView } from "@/components/dashboard/page-view";
import { getDashboardPage } from "@/lib/dashboard";

export default function DashboardCustomersPage() {
  return <DashboardPageView page={getDashboardPage("customers")} />;
}
