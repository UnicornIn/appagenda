import { Badge } from "../../../components/ui/badge";
import type { GiftCardStatus } from "../types";
import { getStatusClasses, getStatusLabel } from "./utils";

interface GiftCardStatusBadgeProps {
  status: GiftCardStatus;
}

export function GiftCardStatusBadge({ status }: GiftCardStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(status)}`}
    >
      {getStatusLabel(status)}
    </Badge>
  );
}
