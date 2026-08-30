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
- **Binding fuerte matrícula + correo:** en `/register`, tras reconsultar ULV, el correo guardado en el
  token debe **seguir coincidiendo** (normalizado: `trim`+minúsculas) con el correo institucional que
  ULV devuelve ahora. Si no coinciden → `409 IDENTITY_MISMATCH` (error genérico). Así el token prueba
  posesión de **matrícula + correo institucional**, no solo de la matrícula.

## 4. Reglas de `TipoUser` (precedencia, server-side)
Fuente autoritativa: ULV. **El `TipoUser` del body se IGNORA por completo.**
```
ULV type = ALUMNO   -> TipoUser = ALUMNO
ULV type = EMPLEADO -> se resuelve la FUNCIÓN institucional con endpoints específicos de ULV,
                       con esta PRECEDENCIA:
   1. VIGILANCIA  -> (rama PENDIENTE del contrato de /api/datos/vigilancia/:idEmpleado, ver abajo)
   2. PRECEPTOR   -> es preceptor si /api/datos/prece/:idDepartamento devuelve "ID JEFE" == su matrícula
   3. EMPLEADO    -> si no cumple ninguna de las anteriores
```
**No se decide por texto libre** (p.ej. `DEPARTAMENTO='SEGURIDAD INSTITUCIONAL'`), sino por los
endpoints institucionales específicos. La lógica vive en `registration.service.js` (`resolveTipoUser`).

**Precedencia / incompatibilidad:** si ULV llegara a marcar a la misma persona como vigilancia **y**
preceptor, gana **VIGILANCIA** (primer criterio). Es una regla explícita, no un accidente de orden.

- **VIGILANCIA (rama pendiente):** `/api/datos/vigilancia/:idEmpleado` **no está confirmado** en el
  código todavía. Hasta tener el contrato real (ruta + campo que confirma la función), el hook
  `esVigilancia()` devuelve `false` y el empleado de seguridad cae en **EMPLEADO**. El hook está
  **aislado** para cablearlo sin tocar el resto del flujo cuando se confirme el contrato.
- **ADMINISTRATIVO NO se auto-asigna en el registro.** Razones: (1) `/api/datos/coordinador/:matricula`
  es el **coordinador de FACULTAD/CARRERA de un ALUMNO** (flujo Tipo 4), **no** el coordinador de
  dormitorio; (2) el coordinador de dormitorio **no es un dato de ULV**: es una cuenta interna que
  resuelve `findCoordinadorActivo()` (`TipoUser='ADMINISTRATIVO'` + `Configuracion`); (3) `ADMINISTRATIVO`
  **concede la capability ADMIN** vía el puente `ADMINISTRATIVO→ADMIN`, así que auto-asignarlo en el
  registro violaría "el registro nunca concede capabilities". → Se provisiona de forma **controlada/manual**.

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
| Correo del token ≠ correo actual de ULV (binding) | 409 | `IDENTITY_MISMATCH` |
| Demasiadas solicitudes de OTP (`/register/otp`) | 429 | `TOO_MANY_ATTEMPTS` |
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
- **Correo cambiado entre OTP y registro** (§3 binding): si ULV devuelve un correo distinto al que
  quedó ligado al token, se rechaza (`IDENTITY_MISMATCH`). El token no es transferible a otra identidad.
- **Spam de OTP / abuso de envío de correo** (§10): límite por matrícula + IP en `/register/otp`.

## 10. Rate-limiting
Dos guards **en memoria** (además del lockout del proveedor OTP, del que **no se depende en
exclusiva**):
- **`/register/otp` (anti-spam de envío):** cuenta por **matrícula** y por **IP** en una ventana de
  10 min; agotar cualquiera de las dos dimensiones → `429 TOO_MANY_ATTEMPTS`. Máximo **5** envíos por
  matrícula/IP en la ventana. Se evalúa **antes** de consultar ULV/existencia, por lo que el 429 **no
  revela** si la matrícula existe (misma respuesta exista o no).
- **`verify-otp` (anti-fuerza-bruta):** máx. **5** intentos de verificación por matrícula en 10 min → `429`.

> ⚠️ **Limitación explícita (una sola instancia).** Ambos guards son **per-proceso**:
> - se **reinician** al reiniciar el proceso;
> - **no** funcionan correctamente con **múltiples instancias** (cada réplica cuenta por separado);
> - **antes de escalar horizontalmente** deben migrarse a un **store compartido/persistente** (p.ej.
>   Redis). No se introduce esa infraestructura todavía porque el despliegue actual es de una instancia.

## 11. Conservado del hardening anterior
Respuesta sin hash de contraseña, sin `TokenCFM`, sin access/refresh tokens; sin `console.log(req.body)`
con contraseña; respuesta saneada; pruebas de seguridad reutilizables.

## 12. Contrato para Flutter
- **Registro (3 pasos):**
  1. `POST /register/otp` `{ "matricula": "..." }` → `200 { message }` (genérico, siempre) | `429 TOO_MANY_ATTEMPTS` (spam). Envía OTP al correo institucional.
  2. `POST /register/verify-otp` `{ "matricula": "...", "otp": "1234" }` → `200 { "registrationToken": "<opaco>" }` | `400 INVALID_OTP` | `429 TOO_MANY_ATTEMPTS`.
  3. `POST /register` `{ "Matricula": "...", "Contraseña": "...", "registrationToken": "<opaco>" }` → `201 { IdLogin, Matricula, Correo, Nombre, Apellidos, TipoUser, Sexo, FechaNacimiento, Celular, StatusActividad, Dormitorio }` (sin hash/tokens). Errores: `400 REGISTRATION_TOKEN_*`/`WEAK_PASSWORD`, `409 USER_ALREADY_EXISTS`/`STUDENT_NOT_FOUND`/`IDENTITY_MISMATCH`.
  - `TipoUser` devuelto: `ALUMNO` | `EMPLEADO` | `PRECEPTOR` (según ULV). `VIGILANCIA`/`ADMINISTRATIVO` **no** se asignan por registro.
- Flutter **deja de**: verificar OTP en cliente, calcular `TipoUser`, enviar Dormitorio/datos institucionales como autoridad, y hardcodear credenciales OTP (el backend asume el envío/verificación).
- Flutter **solo** captura: matrícula, código OTP y contraseña elegida. Navegación: pantalla matrícula →
  pantalla OTP → pantalla contraseña → alta.
- Expiraciones: OTP según proveedor; `registrationToken` 10 min, un solo uso.
