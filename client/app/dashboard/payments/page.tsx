import { redirect } from "next/navigation";

export default function PaymentsRedirectPage() {
  redirect("/dashboard/collections");
}
