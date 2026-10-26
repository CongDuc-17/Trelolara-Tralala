import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PasswordInput({ confirmation = false, className, ...props }: ComponentProps<typeof Input> & { confirmation?: boolean }) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  return <div className="relative"><Input {...props} type={visible ? "text" : "password"} className={cn("h-11 pr-12", className)} /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 size-11" disabled={props.disabled} aria-label={t(confirmation ? visible ? "auth.hideConfirmation" : "auth.showConfirmation" : visible ? "password.hide" : "password.show")} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div>;
}
