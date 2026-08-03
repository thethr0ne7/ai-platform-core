import { CatalogueControlWorkspace } from "@/components/catalogue-control-workspace";
import AccessGate from "@/components/control-center/AccessGate";

export default function CatalogueControlPage() {
  return (
    <AccessGate>
      <CatalogueControlWorkspace />
    </AccessGate>
  );
}
