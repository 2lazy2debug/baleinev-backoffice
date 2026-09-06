import { redirect } from "next/navigation";

/**
 * `/pos` has one screen so far — the templates list. 104 replaces this with the
 * real point-of-sale home once sessions exist.
 */
export default function PosPage() {
  redirect("/pos/templates");
}
