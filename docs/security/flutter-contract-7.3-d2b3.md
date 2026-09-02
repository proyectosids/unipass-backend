# Contrato Flutter — Task 7.3 D2-B3 (consumo de binarios documentales)

> **Backend:** `D2-B2 Secure File Delivery Backend = DONE`. Existe la superficie autenticada definitiva para
> descargar/renderizar binarios. Flutter debe migrar **todos** los consumidores binarios a `GET /files/:idDoctos`.
> Mientras tanto `/uploads/*` **sigue abierto** (bypass) por compatibilidad; se cerrará en **D2-C** cuando
> D2-B3 esté migrado.

## Endpoint

```http
GET /files/:idDoctos
Authorization: Bearer <access token>
```

- **`:idDoctos`** es la PK del documento (`Doctos.IdDoctos`). Ya lo tienes en el JSON de `/me/documents`,
  `/documents/review/students/:idLogin/documents` y en el flujo de foto de perfil.
- **No** mandes `filename`, `Archivo`, `IdLogin`, `IdDocumento`, dormitorio, matrícula ni scope: el backend
  resuelve todo server-side.
- **No** hay URL pública alternativa. **No** uses token en query (`?token=`); usa el header `Authorization`.

## Respuesta

- **200**: los **bytes** del archivo.
  - `Content-Type`: `application/pdf`, `image/png` o `image/jpeg`.
  - `Content-Disposition: inline` (pensado para render directo de imagen/PDF).
  - `Content-Length` cuando está disponible.
  - `Cache-Control: private, no-store` (documentación sensible; no cachear en capas compartidas).
- **Errores** (JSON `{ message, code }`): `401` (sin/mal token), `403` (fuera de política),
  `404` (`FILE_NOT_FOUND`: no existe la fila o el binario), `400` (idDoctos inválido).

## Mapa de consumidores (de `FILE_BINARY_CONSUMER_MAP`)

| Consumidor Flutter | Migración |
|---|---|
| Foto perfil `Image.network` / `NetworkImage` | Usar `GET /files/:idDoctos` con header `Authorization`. Ambos soportan headers. |
| PDF `flutter_cached_pdfview` | Soporta headers Bearer. ⚠️ **cachea el PDF en disco del dispositivo** tras la descarga; el backend no controla ese caché — evaluar limpieza si el documento es sensible. |
| `url_launcher` (abrir en navegador/visor externo) | **No** puede enviar Bearer → **no** sirve para binarios protegidos. Reemplazar por descarga autenticada a archivo temporal (p. ej. `dio`/`http` con header) + abrir el temporal, o render in-app. |

## Política (para que el cliente no muestre acciones imposibles)

- **Foto (IdDocumento=6):** visible por el propio alumno, su preceptor (mismo dorm) y un checker con grant
  vigente que lo cubra.
- **Documentos privados (reglamentos 1-4, convenio 5, INE 7):** SOLO el propio alumno y su preceptor del
  mismo dormitorio. Un checker que ve la foto **no** puede abrir estos (recibirá `403`). No ofrezcas la
  acción a roles que recibirán 403.

## Cierre posterior (D2-C, tras D2-B3)

Cuando D2-B3 esté desplegado y **0 consumidores** usen `/uploads/*`, el backend eliminará
`express.static('public')` y `GET /uploads/<archivo>` directo pasará a `404`. A partir de ahí el único
acceso a binarios es `GET /files/:idDoctos`.
