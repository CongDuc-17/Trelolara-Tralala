import { Badge } from "@/components/ui/badge";
import type { Label } from "./types";

export function LabelBadge({ label }: { label: Pick<Label, "name" | "color"> }) {
  const hex = /^#([\da-f]{6}|[\da-f]{3})$/i.test(label.color) ? label.color.slice(1) : null;
  const rgb = hex?.length === 3 ? hex.split("").map((channel) => channel + channel).join("") : hex;
  const channels = rgb?.match(/../g)?.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels ? channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 : null;
  return <Badge variant="secondary" className="max-w-full rounded-sm px-1.5 font-medium" style={luminance === null ? undefined : {
    backgroundColor: label.color, color: luminance > 0.179 ? "#000000" : "#ffffff",
  }}><span className="truncate" title={label.name}>{label.name}</span></Badge>;
}
