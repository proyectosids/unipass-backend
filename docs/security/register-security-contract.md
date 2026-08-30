# UniPass — Contrato de seguridad de registro (autoregistro seguro)

> Cierra el flujo de `POST /register`. Reemplaza el gating ADMIN-only (incompatible con el
> autoregistro real) por un flujo de **prueba de posesión del correo institucional (OTP) →
> `registrationToken` → alta con datos derivados de ULV server-side**. No mezcla otros bloques.

## 1. Flujo ANTERIOR y vulnerabilidad
- **Vuln original:** `POST /register` **anónimo** que confiaba en `TipoUser` del body → cualquiera
  creaba `ADMINISTRATIVO` y escalaba a ADMIN.
- **Parche intermedio (hardening P0):** `verifyToken + requireCapability(['ADMIN'])`. Cerró la vuln
  **pero rompe el autoregistro** (un alumno nuevo no tiene token ADMIN). **Incompatible con Flutter.**
- **Flujo Flutter real (confirmado):** matrícula → consulta ULV → OTP al correo institucional →
  **verifica OTP EN CLIENTE** → calcula `TipoUser` en Flutter → `POST /register` con todos los campos.
  Problema: el backend **no recibe prueba** de que el OTP se validó → una llamada directa a la API
  se salta Flutter. Y el `TipoUser`/`Dormitorio`/datos vienen del cliente (no confiables).

## 2. Flujo NUEVO (server-side)
```
1) POST /register/otp        { matricula }
   Backend: valida matrícula en ULV, resuelve correo institucional, envía OTP (proveedor).
   Respuesta 200 genérica (anti-enumeración). Solo envía si la matrícula existe en ULV y NO está ya registrada.

2) POST /register/verify-otp { matricula, otp }
   Backend: verifica OTP server-side contra el proveedor. Si es válido -> emite registrationToken
   (opaco) ligado a (matrícula + correo institucional). 400 INVALID_OTP si no. 429 si demasiados intentos.

3) POST /register           { Matricula, Contraseña, registrationToken }
   Backend:
     - valida registrationToken (existe / no expirado / no usado / matrícula coincide);
     - consulta ULV /api/datos/:matricula (server-side) y toma de ahí TODOS los datos institucionales;
     - deriva TipoUser server-side (§4) y resuelve Dormitorio server-side (§5);
     - aplica política de contraseña (min 8 + letra + número);
     - verifica unicidad (no duplicado);
     - crea la cuenta (StatusActividad=1) SIN capabilities;
     - consume el registrationToken (single-use, atómico con el alta).
   201 con respuesta saneada (sin hash/tokens).
```

## 3. `registrationToken`
- Emitido por el backend **solo tras OTP válido**. Opaco (32 bytes hex).
- **Ligado a matrícula + correo institucional validado**. Un solo uso. Expira en **10 min**.
- Se guarda **solo su hash SHA-256** (tabla `RegistrationToken`, migración `013`). Flutter recibe
  únicamente el valor opaco; nunca el hash. No contiene datos sensibles.
- No reutilizable ni modificable por el cliente: el `/register` valida hash + matrícula + expiración + no-usado.

## 4. Reglas de `TipoUser` (precedencia, server-side)
Fuente autoritativa: `Data.type` de ULV (`ALUMNO` | `EMPLEADO`). **El `TipoUser` del body se IGNORA.**
```
ULV type = ALUMNO   -> TipoUser = ALUMNO
ULV type = EMPLEADO -> TipoUser = EMPLEADO
```
**PRECEPTOR / VIGILANCIA / ADMINISTRATIVO NO se autoasignan en el registro.** Motivo (verificado en
vivo): ULV no distingue de forma fiable esos subtipos por sus datos (p.ej. el empleado de vigilancia
aparece con `DEPARTAMENTO='SEGURIDAD INSTITUCIONAL'`, no 'VIGILANCIA'). Autoescalar sería un riesgo.
→ Estos subtipos se **provisionan de forma controlada** (institucional/BD), igual que las capabilities.
> 🚩 **Deuda / decisión de dominio pendiente:** definir la fuente ULV fiable para detectar
> PRECEPTOR/VIGILANCIA/coordinador (ADMINISTRATIVO). Hasta entonces, registro = ALUMNO o EMPLEADO.
- **ADMINISTRATIVO** (coordinador de dormitorio): nunca vía `{ "TipoUser":"ADMINISTRATIVO" }`; se
  identifica/asigna server-side por la fuente institucional (pendiente §domain). El puente transitorio
  `ADMINISTRATIVO → capability ADMIN` se mantiene (documentado en authorization-model).

## 5. Reglas de `Dormitorio` (server-side)
- ALUMNO **interno** (`RESIDENCIA='INTERNO'`) → `Dormitorio` = `Bedroom.IdBedroom` resuelto por
  `SEXO` + `NIVEL_EDUCATIVO` (misma lógica que `/asignarPrece`). Si no hay match → NULL.
- ALUMNO no interno / EMPLEADO → `Dormitorio` = NULL. **El valor del body se IGNORA.**

## 6. Capabilities
`POST /register` **NUNCA** crea CHECKER / SUPERVISOR / ADMIN / SUPERADMIN ni capability alguna del
cliente. Identidad (TipoUser) y capabilities (`CapabilityGrant`) son conceptos separados. El único
"privilegio" derivado es el puente transitorio ADMINISTRATIVO→ADMIN, y ADMINISTRATIVO no se crea por registro.

## 7. Campos confiables vs. NO confiables
| Confiable (del cliente) | NO confiable (se ignora; se deriva de ULV/servidor) |
|---|---|
| `Matricula` (identificador inicial), `Contraseña`, `registrationToken` | `TipoUser`, `Dormitorio`, `Correo`, `Nombre`, `Apellidos`, `Sexo`, `FechaNacimiento`, `Celular`, cualquier capability/rol/scope |

Flutter puede seguir enviando los viejos por compatibilidad; el backend los **ignora como autoridad**.

## 8. Códigos HTTP / errores
| Situación | HTTP | code |
|---|---|---|
| `/register/otp` (siempre genérico) | 200 | — |
| OTP inválido/expirado (`verify-otp`) | 400 | `INVALID_OTP` |
| Demasiados intentos de OTP | 429 | `TOO_MANY_ATTEMPTS` |
| Proveedor OTP caído/timeout | 502/504 | `OTP_PROVIDER_UNAVAILABLE`/`_TIMEOUT` |
| ULV caído/timeout | 502/504 | `ULV_API_UNAVAILABLE`/`_TIMEOUT` |
| Matrícula no existe en ULV (en `/register`) | 409 | `STUDENT_NOT_FOUND` |
| registrationToken inválido | 400 | `REGISTRATION_TOKEN_INVALID` |
| registrationToken expirado | 400 | `REGISTRATION_TOKEN_EXPIRED` |
| registrationToken ya usado | 400 | `REGISTRATION_TOKEN_USED` |
| Token de otra matrícula | 400 | `REGISTRATION_TOKEN_MISMATCH` |
| Falta registrationToken | 400 | `MISSING_FIELDS` |
| Contraseña débil | 400 | `WEAK_PASSWORD` |
| Cuenta ya registrada | 409 | `USER_ALREADY_EXISTS` |

## 9. Amenazas mitigadas
- **Escalada de privilegios por `TipoUser`** (Caso A/B): TipoUser derivado de ULV; el del body se ignora.
- **Registro de identidad ajena** (Caso D + §9 duplicados): requiere **posesión del correo institucional**
  (OTP) → `registrationToken`; conocer solo la matrícula ajena **no basta**.
- **Saltarse Flutter / OTP falso**: el backend verifica el OTP y emite el token; no confía en `otpVerified:true`.
- **Dormitorio manipulado** (Caso C): resuelto server-side; el del body se ignora.
- **Reuso de token** (single-use), **token de otra matrícula** (mismatch), **token expirado** (TTL 10m).

## 10. Rate-limiting
La verificación de OTP se delega al proveedor externo (que aplica lockout). El backend añade un
**guard ligero en memoria** por matrícula en `verify-otp` (máx. intentos por ventana → 429
`TOO_MANY_ATTEMPTS`). Limitación: en memoria (por instancia); un rate-limit distribuido queda como mejora.

## 11. Conservado del hardening anterior
Respuesta sin hash de contraseña, sin `TokenCFM`, sin access/refresh tokens; sin `console.log(req.body)`
con contraseña; respuesta saneada; pruebas de seguridad reutilizables.

## 12. Contrato para Flutter
- **Registro (3 pasos):**
  1. `POST /register/otp` `{ "matricula": "..." }` → `200 { message }` (genérico). Envía OTP al correo institucional.
  2. `POST /register/verify-otp` `{ "matricula": "...", "otp": "1234" }` → `200 { "registrationToken": "<opaco>" }` | `400 INVALID_OTP` | `429 TOO_MANY_ATTEMPTS`.
  3. `POST /register` `{ "Matricula": "...", "Contraseña": "...", "registrationToken": "<opaco>" }` → `201 { IdLogin, Matricula, Correo, Nombre, Apellidos, TipoUser, Sexo, FechaNacimiento, Celular, StatusActividad, Dormitorio }` (sin hash/tokens).
- Flutter **deja de**: verificar OTP en cliente, calcular `TipoUser`, enviar Dormitorio/datos institucionales como autoridad, y hardcodear credenciales OTP (el backend asume el envío/verificación).
- Flutter **solo** captura: matrícula, código OTP y contraseña elegida. Navegación: pantalla matrícula →
  pantalla OTP → pantalla contraseña → alta.
- Expiraciones: OTP según proveedor; `registrationToken` 10 min, un solo uso.
