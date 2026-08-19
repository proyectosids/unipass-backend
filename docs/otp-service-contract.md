# Contrato del proveedor OTP externo (para Task 7.1.B) — vista desde Flutter

**Servicio:** base `OTP_URL` (default `https://api-otp.apps.isdapps.uk`).
**Cliente Flutter:** `lib/services/otp_service.dart` (`OtpServices`).
**Fecha:** 2026-08-19 (re-verificado contra el código actual para la entrega de 7.1.B).
**Seguridad:** este documento **NO** incluye credenciales, API keys, tokens ni secretos reales. Donde hay una credencial se referencia **solo el nombre de la variable** (p. ej. `OTP_PASSWORD=<variable de entorno>`). Los valores reales viven en `.env` (gitignored), inyectados con `--dart-define-from-file=.env`.

> ⚠️ **Hallazgo de seguridad (a resolver en 7.1.B):** `OTP_EMAIL` y `OTP_PASSWORD` están **hardcodeados como `defaultValue`** en `lib/config/config_url.dart:35-37` y esa credencial **fue versionada** (commit `27eb2db`, sigue en HEAD) → debe considerarse **comprometida** y **rotarse** al migrar server-side. No se incluye el valor aquí.

Todos los endpoints son **`POST`** y cuelgan de `OTP_URL`. Todos usan `Content-Type: application/json`. Los que requieren autenticación mandan el header **`x-access-token`** con el token obtenido en el paso 1.

---

## 1. Autenticación al servicio OTP — `loginOTP()`

Obligatorio antes de enviar/verificar/resetear (obtiene el token de servicio).

- **Método / URL:** `POST {OTP_URL}/api/v1/user/login`
- **Headers:** `Content-Type: application/json`
- **Body:** `{ "email": <OTP_EMAIL>, "password": <OTP_PASSWORD> }` ← credenciales de servicio (nombres de variable, no valores).
- **Respuesta 200:** `{ "token": "<jwt>" }`. El cliente guarda ese token en secure storage (`AuthUtils.saveAuthToken`, key `auth_token`) y lo reenvía como header **`x-access-token`** en los pasos 2, 4 y 5.
- **Errores observados:** cualquier no-200 → `AppException` (vía `HttpErrorMapper.fromResponse`), mensaje de usuario "No se pudo autenticar con el servicio de verificacion." **Precondición:** si `OTP_EMAIL` o `OTP_PASSWORD` están vacíos, el cliente lanza `ServerException` sin llamar al servicio.

> Es un token del **servicio OTP**, distinto del access token de UniPass. Hoy lo obtiene el cliente Flutter; en el rediseño server-side (7.1.B) lo obtendría el backend.

## 2. Enviar OTP de verificación de email (alta de cuenta) — `launchOTP(correo)`

- **Método / URL:** `POST {OTP_URL}/api/v1/otp_app`
- **Headers:** `Content-Type: application/json`, `x-access-token: <token del paso 1>`
- **Body:** `{ "email": <correo>, "subject": "Verificacion de Email", "message": "Verifica tu email con el codigo de abajo", "duration": 1 }` (`duration` = vigencia del OTP).
- **Respuesta 200:** OTP enviado (el cliente solo verifica el status; no parsea el body).
- **Errores observados:** no-200 → `AppException`, "No se pudo enviar el codigo de verificacion." **Precondición:** requiere `auth_token` en secure storage (si falta → `ServerException`).

## 3. Verificar OTP (alta de cuenta) — `verificationOTP(otp, correo)`

- **Método / URL:** `POST {OTP_URL}/api/v1/email_verification/verifyOTP`
- **Headers:** `Content-Type: application/json` **(sin `x-access-token`** en el cliente actual).
- **Body:** `{ "email": <correo>, "otp": <codigo> }`
- **Respuesta:** el cliente devuelve `statusCode == 200` como `bool`. **200 → válido (`true`); cualquier no-200 → inválido (`false`)** — un OTP inválido/expirado NO se trata como excepción, sino como `false`. Errores de red/formato sí → `AppException`.

## 4. Enviar OTP de recuperación de contraseña — `forgotOTP(correo)`

- **Método / URL:** `POST {OTP_URL}/api/v1/forgot_password_app/`
- **Headers:** `Content-Type: application/json`, `x-access-token: <token>`
- **Body:** `{ "email": <correo> }`
- **Respuesta 200:** OTP de recuperación enviado.
- **Errores observados:** no-200 → `AppException`, "No se pudo enviar el codigo de recuperacion." **Precondición:** requiere `auth_token`.

## 5. Resetear contraseña (recuperación) — `resetPassword(correo, otp, newpassword)`

- **Método / URL:** `POST {OTP_URL}/api/v1/forgot_password_app/reset`
- **Headers:** `Content-Type: application/json`, `x-access-token: <token>`
- **Body:** `{ "email": <correo>, "otp": <codigo>, "newPassword": <nueva> }`
- **Respuesta 200:** contraseña restablecida **en el servicio OTP** (devuelve `true`).
- **Errores observados:** no-200 → `AppException`, "No se pudo restablecer la contrasena." **Precondición:** requiere `auth_token`.

---

## 6. Formato de respuesta y errores (resumen transversal)

- **Éxito = HTTP 200** en todos los endpoints. El cliente **solo inspecciona el status code**; del body únicamente lee `token` en el paso 1. No consume `code`/`status`/mensajes de error específicos del proveedor OTP.
- **No-200** → se mapea a la jerarquía `AppException` (`HttpErrorMapper`) con mensajes de usuario genéricos (arriba). El cliente **no** ramifica por códigos de error del proveedor OTP.
- **Excepción de diseño:** `verificationOTP` (paso 3) devuelve `false` en no-200 en vez de lanzar (OTP inválido = "no válido", no error).
- **Precondiciones locales:** credenciales de servicio ausentes (paso 1) o `auth_token` ausente (pasos 2/4/5) → `ServerException` local sin llamar al proveedor.

## 7. Variables de configuración (nombres, sin valores)

En `.env`, leídas por `String.fromEnvironment` en `lib/config/config_url.dart`:
- `OTP_URL` — base del servicio OTP.
- `OTP_EMAIL` — usuario de servicio para `/user/login`.
- `OTP_PASSWORD=<variable de entorno>` — contraseña de servicio (⚠️ hardcodeada como default en `config_url.dart:37` y versionada → **rotar** en 7.1.B).

## 8. Cómo se usa hoy en los flujos reales (contexto para 7.1.B)

### Recuperación ("olvidé mi contraseña") — `lib/screen/recoverpassword/` — **objetivo de 7.1.B**
1. `maillAuthentication.dart`: `loginOTP()` (paso 1) + `forgotOTP(correo)` (paso 4) → envía OTP de recuperación.
2. `verificationPassword.dart`: el usuario captura el OTP.
3. `newPassword.dart` (`_resetPassword`): hace **DOS** llamadas:
   - `otpService.resetPassword(correo, otp, nueva)` (paso 5, servicio OTP), **y**
   - `authService.updatePassword(correo, nueva)` → **`PUT {BASE_URL}/password/:Correo`** (backend UniPass), body `{ "NewPassword": <nueva> }`.
   > **El hueco de 7.1.B:** hoy la contraseña se actualiza en el servicio OTP **y** en el backend, orquestado por el cliente. El backend confía en el **correo del path** sin prueba del OTP → cualquiera podría llamar `PUT /password/:Correo`. 7.1.B debe: validar el OTP server-side (contra este proveedor) y **deprecar `PUT /password/:Correo`**.

### Alta de cuenta — `lib/screen/new_account/`
- `loginOTP()` (paso 1) + `launchOTP(correo)` (paso 2) para enviar y `verificationOTP` (paso 3) para verificar el email en el registro.

### Cambio de contraseña autenticado (desde perfil) — **YA NO usa OTP**
- Migrado en **Task 7.1.A (Flutter-certified)** a **`PUT {BASE_URL}/me/password`** (Bearer, body `{actual, nueva}`, identidad solo-token). `ChangepasswordStudent` ya **no** llama al servicio OTP. Este flujo queda fuera de 7.1.B.

## 9. Implicaciones para Task 7.1.B (server-side)

- **No hace falta mailer nuevo:** el proveedor OTP ya envía y verifica.
- El backend puede **validar el OTP server-side** llamando `POST /api/v1/forgot_password_app/` (enviar) y verificando/reseteando con `/forgot_password_app/reset` (o `verifyOTP`), en vez de confiar en el cliente.
- Endpoint objetivo (propuesto por backend): `POST /password/forgot`, `POST /password/verify-otp`, `POST /password/reset` → orquestando este proveedor server-side; luego **deprecar `PUT /password/:Correo`**.
- **A confirmar por la directiva:** quién administra `api-otp.apps.isdapps.uk` y si el backend puede llamar sus endpoints (`/user/login`, `/forgot_password_app/*`, `/email_verification/verifyOTP`) desde el servidor.
- **Follow-up de 7.1.B:** una vez el backend absorba la integración, retirar de Flutter las llamadas directas al proveedor y **rotar `OTP_PASSWORD`**.

---

## 10. Alcance de esta entrega

Solo **documentación del contrato** para que el backend implemente 7.1.B. **No** se modifica el flujo Flutter de recuperación ni se elimina código legacy en este pase.
