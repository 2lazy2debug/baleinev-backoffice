import { redirect } from "next/navigation";

/** The template library became one setting of the invoices app. */
export default function TemplatesPage() {
  redirect("/invoices/settings");
}
