"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Resultado = {
  donanteId: string;
  etapas: number;
  muestras: number;
};

export default function Home() {
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [institucion, setInstitucion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setResultado(null);

    const supabase = createClient();

    const { data: donante, error: errDonante } = await supabase
      .from("donantes")
      .insert({ nombre_completo: nombre, dni, institucion })
      .select("id")
      .single();

    if (errDonante || !donante) {
      setError(errDonante?.message ?? "No se pudo crear el donante.");
      setEnviando(false);
      return;
    }

    const [{ count: etapas }, { count: muestras }] = await Promise.all([
      supabase
        .from("etapas_estado")
        .select("id", { count: "exact", head: true })
        .eq("donante_id", donante.id),
      supabase
        .from("muestras")
        .select("id", { count: "exact", head: true })
        .eq("donante_id", donante.id),
    ]);

    setResultado({
      donanteId: donante.id,
      etapas: etapas ?? 0,
      muestras: muestras ?? 0,
    });
    setEnviando(false);
    setNombre("");
    setDni("");
    setInstitucion("");
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
      <h1 className="text-2xl font-semibold text-center">
        Procuración — alta de donante (prueba)
      </h1>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nombre completo</span>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="border rounded-md px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">DNI</span>
          <input
            required
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            className="border rounded-md px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Institución</span>
          <input
            required
            value={institucion}
            onChange={(e) => setInstitucion(e.target.value)}
            className="border rounded-md px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={enviando}
          className="bg-slate-900 text-white rounded-md py-2 font-medium disabled:opacity-50"
        >
          {enviando ? "Creando..." : "Crear donante"}
        </button>
      </form>

      {error && (
        <p className="text-red-600 text-sm max-w-sm text-center">{error}</p>
      )}

      {resultado && (
        <div className="w-full max-w-sm border rounded-md p-4 flex flex-col gap-1 text-sm">
          <p>
            Donante creado: <code>{resultado.donanteId}</code>
          </p>
          <p className={resultado.etapas === 11 ? "text-green-700" : "text-red-600"}>
            Etapas sembradas: {resultado.etapas} / 11
          </p>
          <p className={resultado.muestras === 7 ? "text-green-700" : "text-red-600"}>
            Paquetes de muestra sembrados: {resultado.muestras} / 7
          </p>
        </div>
      )}
    </main>
  );
}
