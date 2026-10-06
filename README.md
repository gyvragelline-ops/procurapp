> **⚠️ REQUISITO ANTES DE DONANTES REALES: autenticación + RLS por rol.**
> Hoy todas las tablas tienen RLS desactivado y permisos para el rol
> `anon` (ver `handoff/grants*.sql`): cualquiera con la clave pública
> puede leer y escribir. Válido solo para pruebas.

## ESTADO AL 01/10 -- proyecto pausado

Proyecto pausado temporalmente (01/10/2026). Todo lo que estaba en curso
ya está commiteado y desplegado en `main` -- no quedó nada a medias.

Último commit: `22fa7e3` ("Historia Clinica Neurologica: listar los 12
reflejos individualmente en cada evaluación"), desplegado en Render y
confirmado con `curl` (200) + PDF real generado y revisado campo por
campo.

Qué se resolvió en la última sesión de trabajo:
- Bug de datos en blanco en "Historia Clínica Neurológica": la causa
  real era que 11 paneles (`me-panel.tsx`, `cert-aux-panel.tsx`,
  `potencial-panel.tsx`, `familiar-contacto-panel.tsx`,
  `medidas-panel.tsx`, `com-donacion-panel.tsx`, `page.tsx`,
  `com-muerte-panel.tsx`, `com-donacion-realizada.tsx`,
  `medidas-completo.tsx`, `lab-imagenes-completo.tsx`) guardaban en
  Supabase sin revisar si el `upsert`/`update` devolvía error, así que
  con wifi intermitente la pantalla mostraba el dato como guardado
  aunque nunca hubiera llegado a la base. Se agregó
  `lib/procuracion/guardar.ts` (reintento + error visible) y se aplicó
  en los 11 paneles.
- Historia Clínica Neurológica ahora usa el motor nuevo
  (`@react-pdf/renderer`, 1 hoja, no AcroForm), con los 12 reflejos
  troncoencefálicos listados individualmente en cada evaluación (no
  solo el resumen "12/12 ausentes").

Próximo paso (sin empezar todavía): no había ninguna tarea pendiente
explícita al pausar -- el último pedido de la usuaria fue el de los
reflejos, ya resuelto y confirmado por ella ("se ve bien"). Al retomar,
preguntar si hay algo nuevo antes de asumir continuidad de lo anterior.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
