# Task 7 — Plan de hardening (contratos backend)

Estado: **Fase 0 (auditoría) cerrada.** Este documento fija los contratos que backend
propone; cada endpoint se activa solo tras el handshake por endpoint (§29 de la directiva):
Backend propone contrato → Frontend confirma consumo y Bearer → deploy → prueba → regresión.

Principio transversal: **la identidad SIEMPRE sale de `req.user` (token)**. Flutter puede
seguir mandando `IdUser`, `IdLogin`, `IdEmpleado`, `Matricula`, `MatriculaPreceptor`,
`Correo` durante la transición, pero backend **los ignora como fuente de identidad**.

---

## Task 7.1 — Password Security (PRIORIDAD CRÍTICA)

**Vulnerabilidad viva:** `PUT /password/:Correo` está abierto y cambia la contraseña de
cualquier cuenta solo con el correo; el OTP hoy se valida **solo en Flutter** (backend no
recibe prueba). No se corrige con `verifyToken` porque el flujo de recuperación es
anónimo (el usuario olvidó su contraseña). Requiere rediseño server-side.

**🚩 Bloqueante a decidir por ustedes:** el backend **no tiene canal de correo/SMS**
(no hay mailer). Para OTP server-side hay que definir: (a) agregar un mailer al backend
(SMTP/SendGrid/etc.), o (b) reutilizar un servicio externo existente que entregue el OTP.
Sin esa decisión no se puede implementar la entrega del OTP.

### Contrato propuesto

**A) Cambio autenticado (desde perfil):**
```
PUT /me/password          Auth: ✅ Bearer
Body: { "actual": "<contraseña actual>", "nueva": "<nueva>" }
- Identidad = token. Verifica 'actual' contra hash en BD (bcrypt).
- 200 { message } | 400 faltan campos / nueva débil | 401 sin token
  | 403 'actual' incorrecta (code PASSWORD_MISMATCH)
- NO usa Correo. Deprecar PUT /password/:Correo para este caso.
```

**B) Recuperación (anónima, OTP server-side):**
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

## Task 7.2 — Endpoints self / bajo riesgo (contratos)

Regla: `verifyToken` + ownership (`req.user.id` = dueño). Body identifiers ignorados.
**No se activan en vivo hasta que Frontend confirme Bearer por endpoint (§29).**

| Endpoint | Identidad | Ownership / regla | Ignora del body | Respuestas |
|---|---|---|---|---|
| `POST /permission` | token.id | crea con `IdUser = token.id` | `IdUser` | 201 / 401 |
| `PUT /permission/:Id` (cancelar) | token.id | `Permission.IdUser == token.id`; set `Cancelado` (no borra) | — | 200 / 401 / 403 ajeno / 404 |
| `POST /doctosMul` | token.id | crea con `IdLogin = token.id` | `IdLogin` | 200 / 401 |
| `PUT /doctosMul/updateProfile` | token.id | doc.`IdLogin == token.id` | `IdLogin` | 200 / 401 / 403 / 404 |
| `DELETE /doctosMul/:Id` | token.id | doc.`IdLogin == token.id` (alumno) | — | 200 / 401 / 403 / 404 |
| `PUT /TokenDispositivo/:Matricula` | token | matrícula del token, no del path | `:Matricula` | 200 / 401 |

Infra lista: `src/Middleware/requireOwnership.js` (genérico, aún sin cablear).

---

## Cierres y candidatos (aplicados/instrumentados este pase)

- **`DELETE /permission/:Id`** → **cerrado a ADMIN** (`verifyToken + requireCapability(['ADMIN'])`).
  Frontend confirmó que no lo usa. Las cancelaciones normales van por `PUT /permission/:Id`.
- **`PUT /statusRevision/:Id`** → instrumentado con log `[DEPRECATION][Task7]`. Backend no
  tiene consumidores internos; pendiente revisar logs de producción antes de deprecar/eliminar.

---

## Task 7.3 — Revisión documental (diseño, no implementar aún)
Modelo TOKEN + ROL + ÁMBITO. Reviewer (PRECEPTOR/EMPLEADO/VIGILANCIA) solo dentro de su
dormitorio/ámbito. Identidad del reviewer desde token (hoy `rejectDocument` usa
`MatriculaPreceptor` del body → debe ignorarse como identidad).

## Task 7.4 — Rediseño cadena de autorización (NO tocar hasta acordar contrato)
Orquestación hoy en Flutter (`POST /permission`→`POST /authorize`; luego
`PUT /autorizarPermission`→`PUT /permissionValorado`→`POST /checks`). Objetivo: moverla a
backend con transacciones e idempotencia. `POST /authorize` hoy lo ejecuta el **ALUMNO** →
**NO** gatearlo con rol PRECEPTOR/ADMIN sobre el diseño actual (rompería la creación).

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
