import { Monitor, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function DisplayPreferences({ sidebar = false }: { sidebar?: boolean }) {
  const { t, i18n } = useTranslation();
  const { theme = "system", setTheme } = useTheme();
  if (sidebar) return <div aria-label={t("preferences.title")} className="flex flex-col items-center gap-2">
    <ToggleGroup type="single" orientation="vertical" spacing={0.5} aria-label={t("preferences.language")} value={i18n.resolvedLanguage} onValueChange={(value) => { if (value) void i18n.changeLanguage(value); }} className="flex-col rounded-full bg-background/60 p-0.5">
      {([{ value: "vi", label: "Tiếng Việt", short: "VI" }, { value: "en", label: "English", short: "EN" }] as const).map(({ value, label, short }) => <Tooltip key={value}>
        <TooltipTrigger asChild><span className="inline-flex"><ToggleGroupItem value={value} lang={value} aria-label={label} className="size-8 rounded-full px-0 text-[11px] text-muted-foreground">{short}</ToggleGroupItem></span></TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>)}
    </ToggleGroup>
    <ToggleGroup type="single" orientation="vertical" spacing={0.5} aria-label={t("preferences.theme")} value={theme} onValueChange={(value) => { if (value) setTheme(value); }} className="flex-col rounded-full bg-background/60 p-0.5">
      {([{ value: "light", icon: Sun }, { value: "dark", icon: Moon }, { value: "system", icon: Monitor }] as const).map(({ value, icon: Icon }) => <Tooltip key={value}>
        <TooltipTrigger asChild><span className="inline-flex"><ToggleGroupItem value={value} aria-label={t(`preferences.${value}`)} className="size-8 rounded-full px-0 text-muted-foreground"><Icon className="size-3.5" /></ToggleGroupItem></span></TooltipTrigger>
        <TooltipContent side="right">{t(`preferences.${value}`)}</TooltipContent>
      </Tooltip>)}
    </ToggleGroup>
  </div>;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-11" aria-label={t("preferences.title")} title={t("preferences.title")}><SlidersHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent side="bottom" align="end" className="min-w-56">
      <DropdownMenuLabel>{t("preferences.language")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-label={t("preferences.language")} value={i18n.resolvedLanguage} onValueChange={(value) => { void i18n.changeLanguage(value); }}>
        <DropdownMenuRadioItem value="vi" lang="vi">Tiếng Việt</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="en" lang="en">English</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t("preferences.theme")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-label={t("preferences.theme")} value={theme} onValueChange={setTheme}>
        {(["light", "dark", "system"] as const).map((value) => <DropdownMenuRadioItem key={value} value={value}>{t(`preferences.${value}`)}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("preferences.saved")}</p>
    </DropdownMenuContent>
  </DropdownMenu>;
}
