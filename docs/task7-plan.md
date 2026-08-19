# Task 7 — Plan de hardening (contratos backend)

Estado: **Fase 0 (auditoría) cerrada.** Este documento fija los contratos que backend
propone; cada endpoint se activa solo tras el handshake por endpoint (§29 de la directiva):
Backend propone contrato → Frontend confirma consumo y Bearer → deploy → prueba → regresión.

Principio transversal: **la identidad SIEMPRE sale de `req.user` (token)**. Flutter puede
seguir mandando `IdUser`, `IdLogin`, `IdEmpleado`, `Matricula`, `MatriculaPreceptor`,
`Correo` durante la transición, pero backend **los ignora como fuente de identidad**.

---

## Task 7.1 — Password Security (PRIORIDAD CRÍTICA) — servicio OTP externo confirmado

Frontend confirmó que **ya existe un servicio OTP externo** (`OTP_URL` =
`https://api-otp.apps.isdapps.uk`) con endpoints de envío/verificación/reset. Propuesta:
el backend **valida el OTP server-side llamando a ese servicio** (o toma el control de
llamarlo) en vez de confiar en el cliente, y así se depreca `PUT /password/:Correo` sin
montar mailer. **Pendiente de la directiva:** confirmar quién administra el servicio OTP
y si el backend puede llamar su `verifyOTP`. Endpoints del servicio (según Frontend):
`POST /api/v1/otp_app`, `POST /api/v1/forgot_password_app/`,
`POST /api/v1/email_verification/verifyOTP`, `POST /api/v1/forgot_password_app/reset`.

## Task 7.1 — Password Security (contrato backend)

**Vulnerabilidad viva:** `PUT /password/:Correo` está abierto y cambia la contraseña de
cualquier cuenta solo con el correo; el OTP hoy se valida **solo en Flutter** (backend no
recibe prueba). No se corrige con `verifyToken` porque el flujo de recuperación es
anónimo (el usuario olvidó su contraseña). Requiere rediseño server-side.

**🚩 Bloqueante a decidir por ustedes:** el backend **no tiene canal de correo/SMS**
(no hay mailer). Para OTP server-side hay que definir: (a) agregar un mailer al backend
(SMTP/SendGrid/etc.), o (b) reutilizar un servicio externo existente que entregue el OTP.
Sin esa decisión no se puede implementar la entrega del OTP.

### Contrato propuesto

**A) Cambio autenticado (desde perfil) — ✅ CLOSED / Flutter-certified (2026-08-17):**
Smoke de Frontend OK (200 / 403 PASSWORD_MISMATCH / 401; sesión persiste). No más cambios
salvo regresiones.

### Política de contraseña actual (documentación obligatoria)
**Política REAL en código (`WEAK_PASSWORD`): únicamente `longitud >= 6`.** No exige letra,
número, mayúscula ni símbolo. (Por eso `abcdefg1` pasa — pero también `aaaaaa`.)

> ⚠️ **Discrepancia con la inferencia de Frontend.** El smoke infirió "min 8 + letra +
> número"; **el código NO valida eso** (solo `>= 6`). La política efectiva es más débil de
> lo asumido. Por indicación (no endurecer sin decisión coordinada) **no se cambia aquí**;
> queda registrada para sincronizar con las reglas UX de Flutter. Cualquier endurecimiento
> (min 8, letra+número, símbolos, listas de comunes) es un cambio separado y coordinado.

```
PUT /me/password          Auth: ✅ Bearer
Body: { "actual": "<contraseña actual>", "nueva": "<nueva, >=6>" }
- Identidad = token (findUserById(req.user.id)). Verifica 'actual' contra hash (bcrypt).
- 200 { message } | 400 MISSING_FIELDS / WEAK_PASSWORD | 401 sin token
  | 403 PASSWORD_MISMATCH ('actual' incorrecta) | 404 USER_NOT_FOUND
- NO usa Correo. Verificado: 401 / 403 PASSWORD_MISMATCH / 400 MISSING_FIELDS.
```

**B) Recuperación (anónima, OTP server-side) — ⏳ BLOQUEADO (falta el contrato en el repo).**
Proveedor autorizado (`https://api-otp.apps.isdapps.uk`). **Verificado 2026-08-17: el
contrato `docs/backend/otp-service-contract.md` NO está en este repo** (`docs/backend/` no
existe). No implemento las llamadas al proveedor sin sus payloads/headers/respuestas reales
(no se adivina una API externa). `OTP_URL` añadido al `.env` local (gitignored).

Endpoints a implementar cuando llegue el contrato: `POST /password/forgot` (proveedor
envía OTP; respuesta genérica, no revela si la cuenta existe), `POST /password/verify-otp`
(valida server-side contra el proveedor; si OK emite `resetToken` propio: cripto-seguro,
expiración corta, un solo uso, ligado al usuario, hasheado si se persiste, invalidado al
usarse), `POST /password/reset` (valida resetToken, aplica política, actualiza hash,
invalida el token, y **revoca refresh tokens/sesiones previas**). El OK del proveedor NO
permite cambiar la contraseña sin pasar por el `resetToken`.

Persistencia propuesta (migración, sin aplicar): tabla `PasswordReset(Id, IdLogin, OtpRef?,
ResetTokenHash, ExpiraEn, UsadoEn, FechaCreacion)`.

**Insumos que necesito para desbloquear:** (1) copiar `otp-service-contract.md` a este repo
(o pegar su contenido); (2) confirmar el secreto del proveedor (`OTP_PASSWORD`/API key) **solo
por variable de entorno** — no versionar. La credencial OTP históricamente versionada en
Flutter debe considerarse **comprometida** y rotarse en esta migración.

`PUT /password/:Correo` queda VIVO (log `[DEPRECATION][Task7.1]`) hasta que 7.1.B esté
desplegado + Frontend migre recuperación + smoke OK; luego se cierra y se marca Task 7.1
completa.
```
POST /password/forgot     Auth: —   Body: { "correo" }
- Genera OTP (6 dígitos), guarda HASH del OTP + expiración (~10 min) + intentos.
- Entrega el OTP por el canal definido (bloqueante arriba).
- 200 SIEMPRE (respuesta genérica; no revela si el correo existe).

POST /password/verify-otp Auth: —   Body: { "correo", "otp" }
- Valida OTP (hash + no expirado + intentos). Consume el OTP.
- 200 { resetToken } (token corto, ~10 min, un solo uso) | 400 OTP inválido/expirado.

POST /password/reset      Auth: —   Body: { "resetToken", "nueva" }
- Valida resetToken (no usado, no expirado). Actualiza contraseña. Invalida el token.
- 200 { message } | 400 token inválido/expirado.
```
Regla: **no** debe poder llamarse `/password/reset` sin haber pasado por `verify-otp`.

### Persistencia (migración, diseño — NO aplicar aún)
Tabla `PasswordReset`: `Id, IdLogin, OtpHash, ExpiraEn, Intentos, ResetTokenHash,
ResetExpiraEn, UsadoEn, FechaCreacion`. (OTP y reset token siempre hasheados, como
`RefreshToken`.)

---

## Task 7.2 — Endpoints self / bajo riesgo — ✅ ACTIVADO (2026-08-12)

Frontend confirmó Bearer en los 6 y dio luz verde (§29). Regla: `verifyToken` + identidad
del token. Body identifiers aceptados por compatibilidad pero **ignorados** como identidad.

| Endpoint | Identidad | Ownership / regla | Ignora | Verificado |
|---|---|---|---|---|
| `POST /permission` | token.id | crea con `IdUser = token.id` | `IdUser` (body) | ✅ guardó IdUser del token |
| `PUT /permission/:Id` (cancelar) | token.id | `Permission.IdUser == token.id`; set `Cancelado` (no borra) | — | ✅ 401/403/200/404 |
| `POST /doctosMul` | token.id | crea con `IdLogin = token.id` | `IdLogin` (body) | ✅ 401 |
| `PUT /doctosMul/updateProfile` | token.id | doc.`IdLogin == token.id` | `IdLogin` (body) | ✅ 401 |
| `DELETE /doctosMul/:Id` | token.id | ownership validado antes de borrar | `:Id` (path) | ✅ 401 / 403 ajeno / 404 |
| `PUT /TokenDispositivo/:Matricula` | token.matricula | matrícula del token, no del path | `:Matricula` (path) | ✅ 401 |

Ownership de `PUT /permission/:Id` vía `requireOwnership` + `findPermissionOwnerId`
(403 `FORBIDDEN_OWNERSHIP` si no es dueño, 404 `PERMISSION_NOT_FOUND` si no existe).
`verifyToken` corre ANTES de multer en las subidas (no procesa archivo sin auth).
Nota: un 403 en `/TokenDispositivo` no bloquea login (el cliente lo traga).

**DELETE /doctosMul — ownership + hallazgo de esquema.** `IdDocumento` es un **TIPO**
de documento (compartido entre usuarios; ej. IdDocumento=6 en 6 cuentas); el id único
por documento es **`IdDoctos`** (PK). Por eso:
- Si el body trae **`IdDoctos`** (recomendado): se valida el documento único →
  404 `DOC_NOT_FOUND` si no existe, 403 `FORBIDDEN_OWNERSHIP` si `IdLogin != token.id`,
  si no borra. Esto habilita el 403 "ajeno" real que pidió Frontend.
- Si el body trae solo **`IdDocumento`** (legacy, tipo): se opera sobre el doc propio
  del token (no puede alcanzar ajenos), por lo que "no es tuyo" = 404 (no hay 403).
- **Acción Frontend:** para ownership real (403/404 por documento), enviar `IdDoctos`.

Tests de integración (no destructivos, tokens generados en el test): permiso ajeno→403,
permiso inexistente→404, `IdDoctos` ajeno→403, `IdDoctos` inexistente→404
(`tests/ownership.integration.test.js`, con guard de DB).

---

## Cierres y candidatos (aplicados/instrumentados este pase)

- **`DELETE /permission/:Id`** → **cerrado a ADMIN** (`verifyToken + requireCapability(['ADMIN'])`).
  Frontend confirmó que no lo usa. Las cancelaciones normales van por `PUT /permission/:Id`.
- **`PUT /statusRevision/:Id`** → instrumentado con log `[DEPRECATION][Task7]`. Backend no
  tiene consumidores internos; pendiente revisar logs de producción antes de deprecar/eliminar.

---

## Task 7.3 — Revisión documental (CONTRATO propuesto; no implementar hasta handshake)

Modelo **TOKEN + ROL + ÁMBITO**. No basta `usuario.tipo == PRECEPTOR`: el reviewer solo
opera sobre alumnos de **su dormitorio**.

**Identidad y ámbito del reviewer = del token** (no del body):
- reviewer = `req.user.id` / `req.user.matricula`; dormitorio = `req.user.dormitorio`.
- Roles reviewer permitidos: `PRECEPTOR`, `EMPLEADO`, `VIGILANCIA` (mismo set que hoy usa
  `rejectDocument`). Se puede sumar `ADMINISTRATIVO`.
- **Regla de ámbito** (derivada de los dashboards): permitido si
  `req.user.dormitorio == alumno.Dormitorio`, **o** el reviewer es global
  (`ADMINISTRATIVO` con `dormitorio == 5` → cubre dorms 1–4). Si no → **403 `FORBIDDEN_SCOPE`**.
- El dormitorio del **alumno** se resuelve en BD desde el dueño del documento
  (doc `IdLogin`/matrícula → `LoginUniPass.Dormitorio`), nunca del cliente.

Infra a construir: `requireScopeDormitorio(resolveAlumnoDormitorio)` (análogo a
`requireOwnership`, pero compara dormitorio del token contra el del alumno, con la excepción
global dorm 5).

| Endpoint | Rol | Identidad (token) | Ámbito | Corrige |
|---|---|---|---|---|
| `PUT /doctosMul/reject/:Id` | PRECEPTOR/EMPLEADO/VIGILANCIA | reviewer = token; `RechazadoPor` = `token.matricula` | alumno(`:Id`).Dormitorio ∈ scope | ⚠️ hoy usa `MatriculaPreceptor` del body → ignorar como identidad |
| `PUT /statusRevision/:Id` (aprobar) | idem | reviewer = token | alumno(`:Id`).Dormitorio ∈ scope | 🔴 hoy no registra quién aprobó · **candidato muerto** (§10): decidir deprecar antes de endurecer |
| `PUT /Documentacion/:Matricula` | reviewer / ADMIN | reviewer = token | alumno(`:Matricula`).Dormitorio ∈ scope | matrícula del path → validar contra scope |

Nota: `DELETE /doctosMul/:Id` quedó **self-only** en 7.2 (alumno dueño). Si un preceptor
debe poder borrar docs de su dormitorio, es una **extensión de scope** a decidir aquí
(hoy no está permitido para reviewer). Requiere confirmación de Frontend.

Pendiente de Frontend antes de gatear (§29): migrar estas llamadas a `AuthHttpClient` y
confirmar Bearer; confirmar si `/statusRevision` sigue vivo; definir si el reviewer borra docs.

## Task 7.4A — Creación transaccional Permission + Authorize (Tipo 1) — ✅ IMPLEMENTADO (2026-08-18)
Solo Tipo 1 (Pueblo). Orden **Jefe (1) → Preceptor (2)**, dedupe por matrícula. API-ULV fuera
de la transacción; Permission+Authorize atómico; idempotencia por `Idempotency-Key` (migración
009). Tipos 2/3 **sin cambios** de coordinador (`PENDING_DOMAIN_DECISION_COORDINATOR_TYPE_2_3`).
7.4B intacto. Detalle e indicaciones Flutter en [[task7.4a-analysis]]. Tests: unit (cadena) +
integración (DB, `UlvApiService` mockeado): normal 2-auth, dedupe 1-auth, idempotencia, sin work,
sin jefe/preceptor, autorizador sin cuenta, API-ULV caída, rollback.

## (histórico) Task 7.4A — análisis previo
Análisis + contrato en **[[task7.4a-analysis]]** (`docs/task7.4a-analysis.md`), actualizado
2026-08-18 con **API-ULV** (verificado en vivo). Regla Pueblo aprobada: Preceptor → Jefe de
trabajo (dedupe por matrícula). Cadena resuelta vía API-ULV (`ULV_API_URL`): preceptor por
`prece/:Bedroom.Identificador`, jefe por `work.ID DEPTO → JefeDepto/:IdDepto.EmpMatricula`
(vigente; `work.ID JEFE` = cross-check, puede estar stale), coordinador por
`coordinador/:matricula`. Conversión matrícula institucional → `LoginUniPass` → `IdLogin`;
si falta cuenta → `AUTHORIZER_NOT_REGISTERED`. API-ULV **fuera** de la transacción; regla
Permission+Authorize completos o ninguno. Capa `UlvApiService` (sin hosts hardcodeados).
**3 decisiones de dominio pendientes:** (1) Pueblo con alumno sin `work`; (2) discrepancia
`work.ID JEFE` vs `JefeDepto`; (3) coordinador por-alumno (API-ULV) vs global (264) en tipo 2/3.
Permission 7048 = huérfana confirmada. **Sin cambios productivos**; no se toca 7.4B.

## Task 7.3 — EN ESPERA (prioridad: 7.1.B → 7.4A → 7.3)

## Task 7.4 — Rediseño cadena de autorización (NO tocar hasta acordar contrato)
Orquestación hoy en Flutter (`POST /permission`→`POST /authorize`; luego
`PUT /autorizarPermission`→`PUT /permissionValorado`→`POST /checks`). Objetivo: moverla a
backend con transacciones e idempotencia. `POST /authorize` hoy lo ejecuta el **ALUMNO** →
**NO** gatearlo con rol PRECEPTOR/ADMIN sobre el diseño actual (rompería la creación).

**Ticket ligado (Frontend):** bug de Salida Pueblo (tipo 1) — el cliente arma la cadena con
`idJefe!`/`idDepto!` desde prefs de datos de trabajo/empleado (null para alumnos) → crashea
tras crear el permiso y lo deja huérfano (Permission sin Authorize). El backend debe
determinar la cadena de Pueblo desde los datos del alumno en BD (parte del flujo
transaccional `Permission + Authorize`). Detalle en el repo de Frontend:
`docs/backend/ticket-tipo1-pueblo-cadena-autorizacion.md`.

## Task 7.5 — Administración
`POST /createPosition`, `PUT /activarCargo`, `PUT /cambiarCargo`, `PUT /terminarCargo`,
`POST /register` → `ADMIN/ADMINISTRATIVO`. `POST /register` pendiente de definir contrato
(auto-registro vs administración).

## SUPERVISOR
Read-only permanente: solo `GET /admin/{dashboard,reporte,observaciones}`. Nunca en
allow-list de escritura → cualquier escritura de SUPERVISOR = 403. Ver [[supervisor-capability]].

---

## Rollout (orden aprobado)
7.1 Password (crítica) · 7.2 Self · 7.3 Revisión documental · 7.4 Rediseño autorización
(conjunto) · 7.5 Administración. Handshake por endpoint (§29). Compatibilidad: backend
acepta pero ignora identificadores viejos del body durante la transición (§30).
