import { redirect } from "next/navigation";

export default function PayoutsRedirectPage() {
  redirect("/dashboard/settlement");
}
