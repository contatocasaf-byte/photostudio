import PermissaoGate from "@/components/PermissaoGate";
import GaleriaClient from "./GaleriaClient";

export default function GaleriaFotosPage() {
  return (
    <PermissaoGate chave="catalogos_galeria">
      <GaleriaClient />
    </PermissaoGate>
  );
}
