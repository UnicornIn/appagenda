import { CreditCard, Loader2, Wallet, WalletCards } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/card";
import { formatMoney } from "./utils";

interface GiftCardsSummaryCardsProps {
  activeCount: number;
  totalIssued: number;
  pendingBalance: number;
  currency: string;
  isRefreshing: boolean;
}

export function GiftCardsSummaryCards({
  activeCount,
  totalIssued,
  pendingBalance,
  currency,
  isRefreshing,
}: GiftCardsSummaryCardsProps) {
  const metrics = [
    {
      title: "Gift Cards activas",
      value: String(activeCount),
      icon: CreditCard,
      iconStyles: "text-slate-700",
    },
    {
      title: "Saldo total emitido",
      value: formatMoney(totalIssued, currency),
      icon: WalletCards,
      iconStyles: "text-slate-700",
    },
    {
      title: "Saldo pendiente",
      value: formatMoney(pendingBalance, currency),
      icon: Wallet,
      iconStyles: "text-slate-700",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;

        return (
          <Card key={metric.title} className="border border-gray-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50">
                  {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" /> : <Icon className={`h-3.5 w-3.5 ${metric.iconStyles}`} />}
                </div>
                <p className="text-sm font-medium text-gray-600">{metric.title}</p>
              </div>
              <p className="text-3xl font-bold leading-none tracking-tight text-gray-900">{metric.value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
