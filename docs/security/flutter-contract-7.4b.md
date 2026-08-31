# Contrato definitivo Backend→Flutter — Task 7.4B (cadena de autorización de permisos)

> **Estado:** `7.4B Backend = IMPLEMENTADO` · `7.4B global = PENDIENTE MIGRACIÓN FRONTEND`.
> Este documento es la fuente de verdad contra la que Frontend debe migrar. Cubre **solo** el modelo ya
> implementado. Lo que quede "fuera del contrato" (§10) NO forma parte de esta entrega.

## 0. Commits Backend que componen el contrato

| Commit | Alcance |
|---|---|
| `2a8db09` | **Commit A** — resolución segura de eslabón (`PUT /autorizarPermission/:Id`): Bearer, actor del token, máquina de estados, Orden estricto, recálculo global atómico, AuditLog; retiro de `PUT /permissionValorado/:Id`. |
| `0efbd3e` | **Commit B** — creación de cadena server-side en `POST /permission` (tipos 1/2/3), Tipo 4 bloqueado, `Orden`/`DualRole` persistidos + fallback histórico, retiro de `POST /authorize`. |
| `c7a0e4f` | **Gate ALUMNO** — `POST /permission` solo para `TipoUser='ALUMNO'` (`403 FORBIDDEN_USER_TYPE`). |

## 1. Autenticación

**Todos** los endpoints de este contrato requieren `Authorization: Bearer <accessToken>`.
La identidad del actor SIEMPRE se deriva del token (`req.user.id`) y se resuelve server-side contra
`LoginUniPass`. Flutter no envía identidad ni la puede sustituir por el body.

---

## 2. `POST /permission` 🔒 — crear una salida (flujo de ALUMNO)

El backend crea la Permission **y toda la cadena de autorización** server-side, de forma atómica.

### Request
```json
{
  "FechaSolicitada": "2026-09-01T10:00:00",
  "FechaSalida":     "2026-09-02T09:00:00",
  "FechaRegreso":    "2026-09-02T18:00:00",
  "Motivo":          "Motivo de la salida",
  "IdTipoSalida":    1,
  "MedioSalida":     "Autobús"
}
```
`IdTipoSalida`: **1** = Pueblo · **2** = Especial · **3** = A Casa · (**4** = Fin de curso → bloqueado, §6).

### Éxito `201`
```json
{
  "Id": 7100,
  "IdTipoSalida": 1,
  "StatusPermission": "Pendiente",
  "cadena": [ { "orden": 1, "IdEmpleado": 273, "rol": "Jefe de trabajo" } ],
  "replayed": false
}
```

### Cadenas por tipo (§ Orden y DualRole)

| Tipo | Cadena | Orden |
|---|---|---|
| 1 Pueblo | Jefe de trabajo → Preceptor | `Orden` 1, 2 |
| 1 Pueblo (misma persona jefe **y** preceptor) | 1 solo eslabón con **`DualRole = 1`** | `Orden` 1 |
| 2 Especial | 1 autorizador único (Coordinador **o** Preceptor, según config institucional) | `Orden` 1 |
| 3 A Casa | 1 autorizador único (igual que 2) | `Orden` 1 |

- **Orden:** las cadenas nuevas persisten `Orden` autoritativo. (Cadenas históricas mal pobladas
  `Orden=1,1` se resuelven internamente con fallback `IdAuthorize` ascendente — transparente para Flutter.)
- **DualRole:** cuando el Jefe de trabajo y el Preceptor son la misma persona, la cadena tiene **un solo
  eslabón** (`DualRole = 1`, `Orden 1`); requiere **una** aprobación, no dos.

### Estados iniciales
- `Permission.StatusPermission = "Pendiente"` (siempre).
- Cada fila de la cadena nace `StatusAuthorize = "Pendiente"` (siempre).

### Idempotencia
Header opcional `Idempotency-Key: <clave>`. Un reintento con la misma clave devuelve el mismo permiso
sin duplicar: respuesta `200` con `"replayed": true`.

### Errores HTTP / code
| HTTP | code | Causa |
|---|---|---|
| 401 | — | Falta Bearer. |
| 403 | `FORBIDDEN_USER_TYPE` | El actor no es `ALUMNO` (empleado/preceptor/vigilancia/administrativo). |
| 501 | `SALIDA_TIPO_NO_DISPONIBLE` | **Tipo 4 (Fin de curso) bloqueado.** |
| 400 | `SALIDA_TIPO_INVALIDA` | `IdTipoSalida` no es 1/2/3/4. |
| 409 | `INCONSISTENT_DATA` | Datos del alumno incompletos para construir la cadena. |
| 409 | `PRECEPTOR_NOT_FOUND` | No se resolvió el preceptor. |
| 409 | `AUTORIZADOR_NO_CONFIGURADO` | Modo COORDINADOR sin coordinador resoluble. |
| 409 | `AUTHORIZER_NOT_REGISTERED` | El autorizador resuelto no tiene cuenta UniPass activa. |
| 409 | `STUDENT_WORK_NOT_FOUND` / `DEPARTMENT_HEAD_NOT_FOUND` / `AUTHORIZATION_CHAIN_INCOMPLETE` | Cadena Tipo 1 incompleta (fuente institucional). |
| 502 / 504 | `ULV_API_UNAVAILABLE` / `ULV_API_TIMEOUT` | Fuente institucional (ULV) caída/timeout (Tipo 1). |

> **Atomicidad:** ante cualquier `409` de resolución **no se crea Permission** (sin permisos huérfanos).

---

## 3. `PUT /autorizarPermission/:Id` 🔒 — resolver un eslabón (aprobar / rechazar)

`:Id` = **IdPermission**. Lo llama el **autorizador autenticado**; su identidad sale del token.

### Request (únicamente esto)
```json
{ "StatusAuthorize": "Aprobada" }
```
o
```json
{ "StatusAuthorize": "Rechazada" }
```

### Éxito `200`
```json
{ "IdPermission": 7100, "IdAuthorize": 981, "StatusAuthorize": "Aprobada", "StatusPermission": "Pendiente" }
```

### Estados
- **Transiciones de eslabón permitidas:** `Pendiente → Aprobada` y `Pendiente → Rechazada` (nada más).
- **Estado global de `Permission` (lo calcula el backend, NO el cliente):**
  - algún eslabón requerido `Rechazada` → `Permission = Rechazada`;
  - todos los eslabones requeridos `Aprobada` → `Permission = Aprobada`;
  - si queda alguno `Pendiente` → `Permission = Pendiente`.
- **Orden estricto:** para resolver un eslabón, todos los previos deben estar `Aprobada`
  (p. ej. el Preceptor no puede aprobar antes que el Jefe de trabajo).
- Todo ocurre en **una transacción** (fila + recálculo global + AuditLog); ante error, rollback completo.

### Errores HTTP / code
| HTTP | code | Causa |
|---|---|---|
| 401 | — | Falta Bearer. |
| 400 | `INVALID_STATUS` | `StatusAuthorize` no es `Aprobada`/`Rechazada`. |
| 400 | `MISSING_FIELDS` | `:Id` inválido. |
| 403 | `NOT_AUTHORIZER` | El actor no es el autorizador asignado de ese permiso. |
| 404 | `PERMISSION_NOT_FOUND` | El permiso no existe. |
| 409 | `INVALID_TRANSITION` | El eslabón del actor ya no está `Pendiente`. |
| 409 | `PERMISSION_NOT_PENDING` | El permiso ya está finalizado/cancelado. |
| 409 | `ORDER_NOT_READY` | Hay un eslabón previo aún sin aprobar (turno). |

---

## 4. Rutas RETIRADAS (responden **404**)

| Ruta retirada | Motivo | Reemplazo |
|---|---|---|
| `POST /authorize` | La creación de filas `Authorize` es interna del backend. | Se crea sola en `POST /permission`. |
| `PUT /permissionValorado/:Id` | El cliente no puede fijar el estado global. | Lo calcula el backend en `PUT /autorizarPermission/:Id`. |

**`GET /autorizadorSalida` — CONSERVADO** (solo lectura). **Ya NO es necesario para crear un permiso**
(el backend resuelve el autorizador internamente). Frontend debería dejar de usarlo en el flujo de creación.

---

## 5. Campos: qué deja de enviar Flutter y qué deriva el Backend

### Flutter DEBE DEJAR de enviar
- En `POST /permission`: `StatusPermission`, `IdUser`, `TipoUser`, y cualquier dato de autorizador
  (`IdEmpleado`, `NoDepto`, `StatusAuthorize`). Se ignoran.
- En `PUT /autorizarPermission/:Id`: `IdEmpleado` (el actor es el token), `StatusPermission`,
  `Observaciones`, `NombreAprobador`.
- Dejar de orquestar la cadena en cliente: `GET /autorizadorSalida` → `POST /authorize`.
- **Empezar a enviar `Authorization: Bearer`** en `PUT /autorizarPermission/:Id` (antes iba sin token).

### Backend DERIVA server-side (autoritativo)
- Identidad del solicitante: `Permission.IdUser = req.user.id` (token).
- `TipoUser` del actor (gate ALUMNO) desde `LoginUniPass`.
- Autorizador(es) de la cadena: Tipo 1 vía ULV (Jefe + Preceptor); Tipos 2/3 vía switch
  `AUTORIZADOR_SALIDAS` (Coordinador/Preceptor) sobre el dormitorio asignado del alumno.
- `Orden`, `DualRole`, `StatusAuthorize='Pendiente'`, `StatusPermission='Pendiente'`.
- Identidad del autorizador al resolver un eslabón: matrícula del token.
- Estado global de `Permission` (recalculado).

---

## 6. Tipo 4 (Fin de curso) — BLOQUEADO

`POST /permission` con `IdTipoSalida = 4` → **`501 SALIDA_TIPO_NO_DISPONIBLE`**.
No existe flujo certificable (el endpoint `/api/datos/coordinador/:matricula` es el coordinador de
FACULTAD del alumno, no está definido como autorizador institucional del Tipo 4; hay 1 permiso Tipo 4
histórico sin cadena). Frontend debe **ocultar/deshabilitar** esa opción hasta que se defina.

---

## 7. `FORBIDDEN_USER_TYPE` (gate de tipo de usuario)

Crear una salida es un flujo de **alumno**. El backend valida server-side que el actor sea
`TipoUser='ALUMNO'`. Un EMPLEADO/PRECEPTOR/VIGILANCIA/ADMINISTRATIVO recibe **`403 FORBIDDEN_USER_TYPE`**.
Enviar `{ "TipoUser": "ALUMNO" }` en el body **no** evade el gate (el `TipoUser` del body se ignora).

---

## 8. Estado

- **`7.4B Backend = IMPLEMENTADO`** (Commits `2a8db09`, `0efbd3e`, `c7a0e4f`; suite verde).
- **`7.4B global = PENDIENTE MIGRACIÓN FRONTEND`.** No se declara cerrada hasta que Flutter migre contra
  este contrato (enviar Bearer, dejar de enviar autorizador/estado, dejar de llamar rutas retiradas,
  adaptar creación 2/3, ocultar Tipo 4).

---

## 9. Resumen de migración para Frontend (checklist)

1. Enviar `Authorization: Bearer` en `PUT /autorizarPermission/:Id`.
2. En `PUT /autorizarPermission/:Id` mandar solo `{ StatusAuthorize }`; quitar `IdEmpleado` y demás.
3. Dejar de llamar `POST /authorize` (404).
4. Dejar de llamar `PUT /permissionValorado/:Id` (404); leer el `StatusPermission` que devuelve `/autorizarPermission`.
5. En `POST /permission` no enviar `StatusPermission`/`IdUser`/`TipoUser`/autorizador; usar la `cadena` de la respuesta.
6. Dejar de usar `GET /autorizadorSalida` para crear permisos.
7. Ocultar/deshabilitar Tipo 4 (501).
8. Manejar los nuevos `code` de error (§2, §3), incluido `FORBIDDEN_USER_TYPE`.

---

## 10. Fuera del contrato (riesgos / deudas expresas)

- **Tipo 4 (Fin de curso):** pendiente de definición institucional; hoy bloqueado (501). No implementado.
- **ADMIN override:** pendiente (Fase 3). Hoy NO existe ruta administrativa para resolver eslabones ajenos.
- **`PERMISSIONS_APPROVE` / `PERMISSIONS_REJECT`:** pendientes (Fase 3). La autorización normal se basa en
  correspondencia con la fila `Authorize`, no en capability administrativa.
- **Ajuste `-6 h` de fechas:** `POST /permission` resta 6 h fijas a las tres fechas (no maneja DST/otras
  zonas). Deuda técnica **preexistente**, fuera del alcance de 7.4B.
- **Lecturas / BOLA / IDOR:** las bandejas y consultas (`/permissionsEmployee`, `/PermissionsPreceptor`,
  `/progresAuthorize`, etc.) NO se endurecieron en 7.4B; su revisión es un bloque aparte.
