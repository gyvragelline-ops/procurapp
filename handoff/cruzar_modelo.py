"""
Cruza el modelo de datos del prototipo HTML con los nombres de campo reales
de los 10 build_*.py (las 6 planillas de CUCAIBA), y genera:
  - schema.sql          -> tablas para Supabase/Postgres
  - campo_mapeo.sql      -> INSERTs que dicen, para cada campo de cada planilla,
                            si viene de una columna canónica de `donantes`
                            (se carga una vez) o es propio de esa planilla
                            (se guarda en planilla_valores).
"""

import re

PLANILLAS = {
    "certificado": "build_certificado.py",
    "ablacion": "build_ablacion.py",
    "doppler": "build_doppler.py",
    "neuro": "build_neuro.py",
    "coord_familia": "build_coord_familia.py",
    "op2_p1": "build_op2_p1.py",
    "op2_p2": "build_op2_p2.py",
    "op2_p3": "build_op2_p3.py",
    "op2_p4": "build_op2_p4.py",
    "op2_p5": "build_op2_p5.py",
}

# Campos que YA existen como columna en `donantes` (o en una tabla satélite
# 1:1 referenciable). La clave es el nombre de campo tal cual aparece en los
# build_*.py; el valor es la columna/fuente canónica.
# Se arma a mano cruzando semánticamente ambos lados (no es un match de texto
# automático porque los nombres no son idénticos entre HTML y CUCAIBA).
CANONICOS = {
    # identidad / demografía
    "nombre_fallecido": "donantes.nombre_completo",
    "nombre": "donantes.nombre_completo",
    "potencial_donante": "donantes.nombre_completo",
    "documento_identidad": "donantes.dni",
    "dni": "donantes.dni",
    "edad": "donantes.edad",
    "edad_familiar": None,  # es del familiar, no del donante -> queda libre
    "sexo": "donantes.sexo",
    "sexo_masculino": "donantes.sexo",
    "sexo_femenino": "donantes.sexo",
    "cama": "donantes.cama",
    "grupo_sanguineo": "donantes.grupo_sanguineo",
    "grupo_confirmado": "donantes.grupo_confirmado",
    "peso": "donantes.peso",
    "talla": "donantes.talla",
    "pd_numero": "donantes.pd_numero",
    "folio_numero": "donantes.folio_numero",
    "nac_dia": "donantes.fecha_nacimiento",
    "nac_mes": "donantes.fecha_nacimiento",
    "nac_anio": "donantes.fecha_nacimiento",

    # institución / procedencia
    "institucion": "donantes.institucion",
    "hospital": "donantes.institucion",
    "establecimiento": "donantes.institucion",
    "localidad": "donantes.localidad",
    "servicio": "donantes.servicio",
    "denunciante": "donantes.denunciante",
    "direccion_familiar": None,  # del familiar, no del donante

    # clínico general
    "causa_muerte": "donantes.causa_muerte",
    "causas_muerte": "donantes.causa_muerte",
    "hora_fallecimiento": "donantes.me_hora",

    # comunicación familiar (tabla satélite, no columna directa)
    "nombre_familiar": "familiares.nombre",
    "dni_familiar": "familiares.dni",
    "parentesco": "familiares.parentesco",
    "telefono_familiar": "familiares.telefono",
}

FIELD_RE = re.compile(r'^\s*\("([a-zA-Z0-9_]+)"\s*,\s*"(text|checkbox)"', re.M)

# build_certificado.py define sus campos con tuplas de 6 elementos
# ("nombre_campo", x0,y0,x1,y1, "etiqueta") — sin "text"/"checkbox" explícito,
# a diferencia de los otros 9 archivos (7 elementos, con tipo explícito).
# Esa planilla no tiene checkboxes, así que estos campos son "text" por default.
FIELD_RE_SIN_TIPO = re.compile(r'^\s*\("([a-zA-Z0-9_]+)"\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,', re.M)


def extract_fields(path):
    with open(path, encoding="utf-8") as f:
        src = f.read()
    return sorted(set(FIELD_RE.findall(src)))


def main():
    rows = []
    all_fields = {}
    for planilla, path in PLANILLAS.items():
        fields = extract_fields(path)
        all_fields[planilla] = fields
        for campo, _tipo in fields:
            pass
    # FIELD_RE captura tuplas (nombre, tipo); recolectar bien:
    for planilla, path in PLANILLAS.items():
        with open(path, encoding="utf-8") as f:
            src = f.read()
        matches = FIELD_RE.findall(src)
        for campo, tipo in matches:
            fuente = CANONICOS.get(campo)
            rows.append((planilla, campo, tipo, fuente))

        # Campos sin tipo explícito (hoy solo build_certificado.py) — evitar
        # contarlos dos veces si ya matchearon con FIELD_RE.
        ya_vistos = {campo for campo, _tipo in matches}
        for campo in FIELD_RE_SIN_TIPO.findall(src):
            if campo in ya_vistos:
                continue
            fuente = CANONICOS.get(campo)
            rows.append((planilla, campo, "text", fuente))

    sql_lines = [
        "-- Generado automáticamente cruzando build_*.py con el modelo canónico.",
        "-- fuente = NULL  -> campo propio de la planilla, se guarda en planilla_valores.",
        "-- fuente != NULL -> el valor VIVE en la tabla/columna indicada; no se duplica.",
        "insert into campo_mapeo (planilla_key, campo_pdf, tipo_campo, fuente_canonica) values",
    ]
    value_lines = []
    for planilla, campo, tipo, fuente in rows:
        fuente_sql = f"'{fuente}'" if fuente else "NULL"
        value_lines.append(f"  ('{planilla}', '{campo}', '{tipo}', {fuente_sql})")
    sql_lines.append(",\n".join(value_lines) + ";")

    with open("campo_mapeo.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines) + "\n")

    total = len(rows)
    canonicos_n = sum(1 for r in rows if r[3])
    print(f"Total campos mapeados: {total}")
    print(f"  -> con fuente canónica (donantes/familiares): {canonicos_n}")
    print(f"  -> propios de la planilla (planilla_valores): {total - canonicos_n}")


if __name__ == "__main__":
    main()
