import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MarketMap({ city, msaName }: { city: string; msaName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where these operators work</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="aspect-[5/2] w-full rounded-md border border-dashed border-border bg-muted/30">
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">{city}</p>
            <p className="text-xs text-muted-foreground">{msaName}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Interactive map ships when lat/lon points wire in.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
