import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RentalProvider } from "@/types/carRental";

interface Props {
  providers: RentalProvider[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function RentalProviderSelector({ providers, selectedId, onSelect }: Props) {
  if (providers.length === 0) return null;

  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="w-[200px] h-9 text-xs">
        <SelectValue placeholder="All providers" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All providers</SelectItem>
        {providers.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
