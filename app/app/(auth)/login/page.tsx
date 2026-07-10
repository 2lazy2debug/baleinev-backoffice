import { getDictionary, getLocale } from "@/lib/i18n";

import LoginForm from "./login-form";

export default async function LoginPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale).login;

  return <LoginForm copy={copy} />;
}
