export type Donante = {
  id: string;
  pd_numero: string | null;
  folio_numero: string | null;
  nombre_completo: string | null;
  dni: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  sexo: string | null;
  grupo_sanguineo: string | null;
  grupo_confirmado: boolean | null;
  peso: number | null;
  talla: number | null;
  cama: string | null;
  institucion: string | null;
  localidad: string | null;
  servicio: string | null;
  denunciante: string | null;
  fecha_ingreso: string | null;
  me_hora: string | null;
  causa_muerte: string | null;
  estado_general: string | null;
  tipo_procuracion: "multiorganico" | "corneas" | null;
  created_at: string;
};

export type Familiar = {
  id: string;
  donante_id: string;
  nombre: string | null;
  dni: string | null;
  edad: number | null;
  parentesco: string | null;
  direccion: string | null;
  telefono: string | null;
};

export type EtapaEstadoRow = {
  etapa_key: string;
  estado: "green" | "amber" | "red" | "gray";
};

export type CampoMapeoRow = {
  planilla_key: string;
  campo_pdf: string;
  tipo_campo: string;
  fuente_canonica: string | null;
};

export type PlanillaValorRow = {
  planilla_key: string;
  campo_pdf: string;
  valor: string | null;
};

export type MuestraRow = {
  paquete_key: string;
  nombre: string;
  tubos: string | null;
  obtenida: boolean;
  retirada: boolean;
};

export type PlanillaGeneradaRow = {
  planilla_key: string;
  archivo_url: string | null;
  generado_en: string;
};

export type OrganoRow = {
  organo_key: string;
  pct: number;
  labs: string[];
  imagenes: string[];
  faltante: string[];
};

export type CampoDisplay = {
  campo_pdf: string;
  valor: string | null;
};
