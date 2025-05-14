
# UniPass API - Refactorización con Clean Architecture 🏛️

## 📌 Descripción del Proyecto
Este proyecto es la API de **UniPass**, diseñada para gestionar la información de estudiantes, permisos de salida, documentación y autenticación de usuarios. Se ha refactorizado siguiendo los principios de **Clean Architecture**, lo que permite un código más modular, mantenible y escalable.

---

## 📂 Estructura del Proyecto

```plaintext
/src
│── /adapter               # Capa de Adaptación (Controladores y Rutas)
│   ├── /controllers       # Maneja las solicitudes HTTP
│   ├── /routes            # Define las rutas de la API
|   ├── /repositories      # Acceso a la base de datos
│
│── /domain                # Capa de Dominio (Modelos y Repositorios)
│   ├── /models            # Modelos de datos
│   
│
│── /usecases              # Casos de Uso (Lógica de negocio)
│
│── /infrastructure        # Configuración y servicios externos
│   ├── /config            # Variables de entorno, etc.
│   ├── /database          # Conexión a la base de datos
│
│── /utils                 # Utilidades como hash, JWT, validaciones
│
│── /queries               # Encargado de almacenar las consulta de la base de datos
│── app.js                 # Configuración de Express
│── index.js               # Punto de entrada de la API
```

---

## 🎯 Principios de Clean Architecture Aplicados

### ✅ Separación de responsabilidades
- **Adaptador**: sólo HTTP.
- **Casos de uso**: sólo reglas de negocio.
- **Repositorio**: sólo acceso a datos.
- **Infraestructura**: conexión a SQL Server, express, multer, etc.

---

## 📦 Módulos Refactorizados

## 🔐 Módulo de Autenticación - UniPass API

### 📌 Descripción
El módulo de autenticación es responsable de validar el acceso de usuarios a través de su **matrícula o correo electrónico** y contraseña. También permite actualizar contraseñas de manera segura utilizando funciones de hashing.

---

### 📂 Estructura del Módulo
```bash
/src
│── /adapter
│   ├── /controllers
│   │   └── auth.controller.js        # Controlador de autenticación
│   ├── /routes
│   │   └── auth.routes.js            # Rutas de autenticación
│   ├── /repositories
│       └── auth.repository.js        # Acceso a la base de datos
│
│── /domain
│   ├── /models
│       └── user.js                   # Modelo de usuario
│
│── /usecases
│   └── auth.usecase.js               # Lógica de negocio
│
│── /queries
│   └── auth.queries.js               # Consultas SQL parametrizadas
│
│── /utils
│   └── hashData.js                   # Funciones de hash para contraseñas
```

---

### 🔁 Flujo de Autenticación

#### 📥 Entrada:
- `Matricula` o `Correo`
- `Contraseña`

#### 📤 Salida:
- Usuario autenticado o mensaje de error.

---

### 🧠 Casos de Uso
#### loginUserUseCase
```js
export async function loginUserUseCase(matricula, correo, contraseña) {
    const user = await authRepository.getUserByMatriculaOrCorreo(matricula, correo);

    if (!user) return { success: false, message: "Credenciales inválidas" };

    const isPasswordValid = await VerifyHashData(contraseña, user.contraseña);

    if (!isPasswordValid) return { success: false, message: "Credenciales inválidas" };

    return { success: true, user };
}
```

#### updatePasswordUseCase
```js
export async function updatePasswordUseCase(correo, newPassword) {
    const hashedPassword = await hashData(newPassword);
    return await authRepository.updatePassword(correo, hashedPassword);
}
```

---

### 📡 Interfaces de Servicios (Rutas)
#### POST `/login`
```json
{
  "Matricula": "20231001",
  "Contraseña": "mi_clave_segura"
}
```
- Autentica a un usuario con matrícula o correo y contraseña.

#### PUT `/password/:Correo`
```json
{
  "NewPassword": "nueva_clave_segura"
}
```
- Actualiza la contraseña de un usuario (excepto tipo `DEPARTAMENTO`).

---

### 🧱 Consultas SQL (auth.queries.js)
```sql
-- Buscar por matrícula
SELECT * FROM LoginUniPass WHERE Matricula = @Matricula;

-- Buscar por correo
SELECT * FROM LoginUniPass WHERE Correo = @Correo;

-- Actualizar contraseña (excluyendo usuarios tipo DEPARTAMENTO)
UPDATE LoginUniPass 
SET Contraseña = @Password 
WHERE Correo = @Correo AND TipoUser != @TipoUser;
```

---

### ✅ Beneficios del Módulo Refactorizado
- 🔐 **Seguridad**: Contraseñas encriptadas con hash.
- 📦 **Reutilización**: Casos de uso independientes de Express.
- 🧪 **Testabilidad**: Casos de uso fáciles de probar.
- 🔄 **Escalabilidad**: Diseño extensible para futuros métodos de autenticación.


## 📄 Módulo de Usuario - Documentación Técnica (Clean Architecture)

### 🔍 Descripción
Este módulo maneja toda la funcionalidad relacionada con usuarios en el sistema UniPass. Abarca:
- Consultas por ID o matrícula
- Búsqueda de usuarios (por nombre o tipo)
- Manejo de tokens FCM
- Estado de documentación
- Asignación y eliminación de cargos

---

### 🔹 Estructura Modular

```bash
/src
├── adapter/
│   ├── controllers/
│   │   └── user.controller.js  # Controlador HTTP
│   └── routes/
│   │   └── user.routes.js      # Definición de rutas
|   ├── repositories/
│   │   └── user.repository.js  # Acceso a la base de datos
|
├── domain/
│   ├── models/
│   │   └── user.js             # Modelo de usuario
├── usecases/
│   └── user.usecase.js         # Casos de uso
├── queries/
│   └── user.queries.js         # SQL parametrizado reutilizable
```

---

### 🔧 Casos de Uso
```js
import { UserRepository } from "../adapter/repositories/user.repository.js";
const userRepository = new UserRepository();

export async function getUserByIdUseCase(id) {
    return await userRepository.getUserById(id);
}

export async function buscarUserMatriculaUseCase(matricula) {
    return await userRepository.getUserByMatricula(matricula);
}

export async function getBuscarCheckersUseCase(email) {
    return await userRepository.getCheckersByEmail(email);
}

export async function buscarPersonaUseCase(nombre) {
    return await userRepository.searchPerson(nombre);
}

export async function getTokenFCMUseCase(matricula) {
    return await userRepository.getTokenFCM(matricula);
}

export async function documentCompletUseCase(matricula, statusDoc) {
    return await userRepository.updateDocumentStatus(matricula, statusDoc);
}

export async function registerTokenFCMUseCase(matricula, tokenCFM) {
    return await userRepository.updateTokenFCM(matricula, tokenCFM);
}

export async function endCargoUseCase(matricula) {
    const result = await userRepository.endCargo(matricula);
    return result
        ? { success: true, message: "Cargo eliminado y desvinculado con éxito" }
        : { success: false, message: "No se pudo completar la operación" };
}

export async function updateCargoUseCase(matricula, idCargoDelegado) {
    return await userRepository.updateCargo(matricula, idCargoDelegado);
}

export async function getInfoCargoUseCase(id) {
    return await userRepository.getInfoCargo(id);
}
```

---

### 🔍 Rutas del Módulo
```js
router.get("/user/:Id", getUser);
router.get("/userChecks/:EmailAsignador", getBuscarCheckers);
router.get("/userMatricula/:Matricula", buscarUserMatricula);
router.get("/buscarUser/:Nombre", buscarPersona);
router.get("/VerToken/:Matricula", SearchTokenFCM);
router.put("/TokenDispositivo/:Matricula", registerTokenFCM);
router.put("/Documentacion/:Matricula", documentComplet);
router.put("/terminarCargo/:Matricula", endCargo);
router.put("/cambiarCargo/:Matricula", updateCargo);
router.get("/infoCargo/:Id", getInfoCargo);
```

---

### 🔮 Consultas SQL Separadas (queries/user.queries.js)
Ejemplo de consultas reutilizables:
```js
export const getUserByIdQuery = `
SELECT * FROM LoginUniPass WHERE IdLogin = @Id
`;

export const updateDocumentStatusQuery = `
UPDATE LoginUniPass SET Documentacion = @StatusDoc WHERE Matricula = @Matricula
`;

export const deletePositionQuery = `
DELETE FROM Position WHERE IdCargo = @IdCargo
`;
```

---

### 📊 Beneficios
- Reutilización de consultas SQL
- Separación clara entre lógica de negocio y controladores HTTP
- Casos de uso independientes y testeables
- Más fácil de mantener, escalar y refactorizar


# Documentación del Módulo de Documentos - UniPass API

## 📄 Descripción
El módulo de documentos permite a los usuarios:
- Adjuntar documentos
- Consultar documentos previamente cargados
- Actualizar documentos de perfil
- Eliminar documentos
- Obtener expedientes por dormitorio
- Aprobar documentos por parte de personal responsable

Se encuentra totalmente separado por capas según Clean Architecture.

---

## 🔹 Diagrama de Flujo de Capas
```text
Controller -> Use Case -> Repository -> Query (SQL)
```

---

### 🔹 Estructura Modular

```bash
/src
├── adapter/
│   ├── controllers/
│   │   └── doctos.controller.js  # Controlador HTTP
│   └── routes/
│   │   └── doctos.routes.js      # Definición de rutas
|   ├── repositories/
│   │   └── doctos.repository.js  # Acceso a la base de datos
|
├── usecases/
│   └── doctos.usecase.js         # Casos de uso
├── queries/
│   └── doctos.queries.js         # SQL parametrizado reutilizable
```

---

### 1. **Use Cases:** `src/usecases/doctos.usecase.js`
```js
export async function getDocumentsByUserUseCase(idLogin) { ... }
export async function saveDocumentUseCase(data) { ... }
export async function deleteFileDocUseCase(id, idDocumento, deleteCallback) { ... }
// Y otros similares...
```

### 2. **Queries (SQL)** `src/queries/doctos.queries.js`
```js
export const getProfileQuery = "SELECT Archivo FROM Doctos WHERE IdLogin = @id AND IdDocumento = @IdDocumento";
export const saveDocumentQuery = "INSERT INTO Doctos ...";
// Y demás queries reutilizables...
```

### 3. **Repositorio:** `src/adapter/repositories/doctos.repository.js`
```js
export class DoctosRepository {
    async getDocumentsByUser(idLogin) { ... }
    async saveDocument(data) { ... }
    async deleteFileDoc(...) { ... }
    // Todos los métodos usan queries separadas
}
```

### 4. **Controlador:** `src/adapter/controller/doctos.controller.js`
```js
export async function getDocumentsByUser(req, res) { ... }
export async function saveDocument(req, res) { ... }
export async function deleteFileDoc(req, res) { ... }
// Llama a su respectivo useCase
```

### 5. **Rutas:** `src/adapter/routes/doctos.routes.js`
```js
router.get("/doctos/:Id", getDocumentsByUser);
router.post("/doctosMul", Subirimagen.single("Archivo"), saveDocument);
router.delete("/doctosMul/:Id", deleteFileDoc);
```

---

## 🎓 Ejemplo: Subida y Actualización de Documento

### ✅ **Caso de Uso**
```js
export async function saveDocumentUseCase(data) {
    return await repository.saveDocument(data);
}
```

### 📊 **Repositorio**
```js
async saveDocument({ IdDocumento, Archivo, IdLogin }) {
    const result = await pool.request()
        .input("IdDocumento", sql.Int, IdDocumento)
        .input("Archivo", sql.VarChar, Archivo)
        .input("StatusDoctos", sql.VarChar, "Adjunto")
        .input("IdLogin", sql.Int, IdLogin)
        .query(queries.saveDocumentQuery);
    return result.recordset[0];
}
```

### 🔧 **Query SQL**
```sql
INSERT INTO Doctos (IdDocumento, Archivo, StatusDoctos, IdLogin)
VALUES (@IdDocumento, @Archivo, @StatusDoctos, @IdLogin);
SELECT SCOPE_IDENTITY() AS IdDoctos;
```

### 📁 **Controlador**
```js
export async function saveDocument(req, res) {
    const filePath = "/uploads/" + req.file.filename;
    const result = await saveDocumentUseCase({
        IdDocumento: req.body.IdDocumento,
        Archivo: filePath,
        IdLogin: req.body.IdLogin
    });
    res.json(result);
}
```

---

## ✨ Beneficios
- Claramente dividido en responsabilidades
- Las queries son reutilizables en cualquier repo
- Se puede testear cada capa de forma independiente




# ✉️ UniPass - Módulo de Permisos (Permission Module)

Este módulo gestiona todas las operaciones relacionadas con los permisos de salida de los estudiantes, incluyendo la solicitud, autorización, cancelación, validaciones por preceptores, filtros, y visualización en dashboard.

---

## 📂 Estructura del Módulo (Clean Architecture)

```bash
/src
│
├── adapter/
│   ├── controllers/
│   │   └── permission.controller.js
│   └── routes/
│   |   └── permission.routes.js
│   ├── repositories/
│       └── permission.repository.js
│
├── usecases/
│   └── permission.usecase.js
│
├── queries/
│   └── permission.queries.js
```

---

## 🎓 Caso de Uso Ejemplo: Crear Permiso

### Use Case: `/usecases/permission.usecase.js`
```js
export async function createPermissionUseCase(data) {
    return await repository.createPermission(data);
}
```

### Repositorio: `/domain/repositories/permission.repository.js`
```js
async createPermission(data) {
    const pool = await getConnection();
    // Validación de existencia
    const userCheck = await pool.request()
        .input("IdUser", sql.Int, data.IdUser)
        .query(queries.checkUserExistsQuery);

    if (userCheck.recordset.length === 0) {
        await pool.close();
        return null;
    }

    // Formateo de fechas
    const fechaSolicitada = new Date(data.FechaSolicitada);
    fechaSolicitada.setHours(fechaSolicitada.getHours() - 6);

    // Inserción
    const result = await pool.request()
        .input("FechaSolicitada", sql.DateTime, fechaSolicitada.toISOString())
        .input("StatusPermission", sql.VarChar, data.StatusPermission)
        .input("FechaSalida", sql.DateTime, new Date(data.FechaSalida).toISOString())
        .input("FechaRegreso", sql.DateTime, new Date(data.FechaRegreso).toISOString())
        .input("Motivo", sql.VarChar, data.Motivo)
        .input("IdUser", sql.Int, data.IdUser)
        .input("IdTipoSalida", sql.Int, data.IdTipoSalida)
        .input("Observaciones", sql.VarChar, "Ninguna")
        .query(queries.createPermissionQuery);

    await pool.close();

    return {
        Id: result.recordset[0].IdPermission,
        FechaSolicitada: fechaSolicitada.toISOString(),
        ...data
    };
}
```

### Controlador: `/adapter/controllers/permission.controller.js`
```js
export async function createPermission(req, res) {
    try {
        const result = await createPermissionUseCase(req.body);
        if (!result) {
            return res.status(400).json({ error: "El IdUsuario no existe en LoginUniPass" });
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error al crear el permiso" });
    }
}
```

---

## 🌟 Beneficios 

- Separa responsabilidad de acceso a datos, lógica de negocio y controladores.
- Facilita pruebas unitarias y mocks a nivel de casos de uso.
- Reutilización de queries parametrizadas.
- Estandariza las respuestas y errores.

---

# ✅ Módulo Checks - UniPass API (Clean Architecture)

Este módulo se encarga de gestionar los puntos de control (CheckPoints) para validar salidas y retornos de los estudiantes desde diferentes ubicaciones: Dormitorio y Caseta. Incluye operaciones para registrar, consultar y actualizar el estado de los checkpoints.

---

## 📂 Estructura del Módulo

```bash
/src
 ├── /adapter
 │   ├── /controllers/checks.controller.js
 │   └── /routes/checks.routes.js
 ├── /domain
 │   └── /repositories/checks.repository.js
 ├── /queries/checks.queries.js
 └── /usecases/checks.usecase.js
```

---

## 🔎 Casos de Uso (`/usecases/checks.usecase.js`)

```js
export async function createChecksPermissionUseCase(data) { ... }
export async function getChecksDormitorioUseCase(idDormitorio) { ... }
export async function getChecksDormitorioFinalUseCase(idDormitorio) { ... }
export async function getChecksVigilanciaUseCase() { ... }
export async function getChecksVigilanciaRegresoUseCase() { ... }
export async function putCheckPointUseCase(idCheck, FechaCheck, Estatus, Observaciones) { ... }
```

---

## 📁 Repositorio (`/adapter/repositories/checks.repository.js`)

Contiene la lógica de acceso a datos para CheckPoints:

```js
async createChecksPermission({ Accion, IdPoint, IdPermission }) { ... }
async getChecksDormitorio(dormitorioId) { ... }
async getChecksDormitorioFinal(dormitorioId) { ... }
async getChecksVigilancia() { ... }
async getChecksVigilanciaRegreso() { ... }
async putCheckPoint(idCheck, FechaCheck, Estatus, Observaciones) { ... }
```

---

## 🔢 Consultas SQL (`/queries/checks.queries.js`)

- `createChecksPermissionQuery`: Inserta un nuevo CheckPoint.
- `getChecksDormitorioQuery`: Consulta puntos de salida pendientes en Dormitorio.
- `getChecksDormitorioFinalQuery`: Consulta puntos de retorno en Dormitorio tras confirmación.
- `getChecksVigilanciaQuery`: Consulta puntos en Caseta para salida.
- `getChecksVigilanciaRegresoQuery`: Consulta puntos en Caseta para retorno.
- `putCheckPointQuery`: Actualiza un CheckPoint existente.

---

## 🚪 Rutas (`/adapter/routes/checks.routes.js`)

```js
POST   /checks                        -> createChecksPermission
GET    /checksDormitorio/:Id         -> getChecksDormitorio
GET    /checksDormitorioFin/:Id      -> getChecksDormitorioFinal
GET    /checksVigilancia             -> getChecksVigilancia
GET    /checksVigilanciaRegreso      -> getChecksVigilanciaRegreso
PUT    /checks/:id                   -> putCheckPoint
```

---

## ✅ Controlador (`/adapter/controllers/checks.controller.js`)

Define las funciones para manejar las peticiones HTTP:

```js
export async function createChecksPermission(req, res) { ... }
export async function getChecksDormitorio(req, res) { ... }
export async function getChecksDormitorioFinal(req, res) { ... }
export async function getChecksVigilancia(req, res) { ... }
export async function getChecksVigilanciaRegreso(req, res) { ... }
export async function putCheckPoint(req, res) { ... }
```

---

## 🚀 Ejemplo de flujo

1. Un permiso aprobado genera puntos de control.
2. El estudiante se presenta en el punto de salida (`SALIDA`).
3. La vigilancia o encargado marca el punto como "Confirmado".
4. En el retorno, el punto `RETORNO` se confirma.
5. Se valida si la secuencia de checkpoints fue completada correctamente.

---

## 📈 Beneficios
- Claramente desacoplado por capas.
- Separa la lógica de negocio de la persistencia.
- Promueve testeo individual por componentes.
- Estructura mantenible y escalable.

---

# 🧾 Módulo: Checker

Este módulo permite la gestión de los usuarios con el rol de DEPARTAMENTO (checkers). A través de este módulo se pueden buscar, activar/desactivar y eliminar checkers.

---


## 📂 Estructura del Módulo

```bash
/src
 ├── /adapter
 │   ├── /controllers/checker.controller.js
 │   └── /routes/checker.routes.js
 ├── /domain
 │   └── /repositories/checker.repository.js
 ├── /queries/checker.queries.js
 └── /usecases/checker.usecase.js
```

---

## 🧠 Casos de Uso (`/src/usecases/checker.usecase.js`)
```js
import { CheckerRepository } from "../adapter/repositories/checker.repository.js";
const repository = new CheckerRepository();

export async function buscarCheckersUseCase(correoEmpleado) {
    return await repository.buscarCheckers(correoEmpleado);
}

export async function cambiarActividadUseCase(idLogin, status, matricula) {
    return await repository.cambiarActividad(idLogin, status, matricula);
}

export async function eliminarCheckerUseCase(idLogin) {
    return await repository.eliminarChecker(idLogin);
}
```

---

## 📄 Consultas SQL (`/src/queries/checker.queries.js`)
```sql
-- Buscar checkers activos
SELECT * FROM LoginUniPass 
WHERE Correo = @CorreoCheck AND TipoUser = @User AND StatusActividad = @Activo;

-- Cambiar estado de actividad
UPDATE LoginUniPass 
SET StatusActividad = @Actividad 
WHERE IdLogin = @IdLogin AND Matricula = @Credencial;

-- Eliminar checker
DELETE FROM LoginUniPass 
WHERE IdLogin = @IdLogin;
```

---

## 🔌 Rutas API (`/src/adapter/routes/checker.routes.js`)
```js
import { Router } from "express";
import { buscarCheckers, cambiarActividad, eliminarChecker } from "../controller/checker.controller.js";

const router = Router();

router.get("/buscarCheckers/:CorreoEmpleado", buscarCheckers);
router.put("/DesactivarChecker/:IdLogin", cambiarActividad);
router.delete("/EliminarChecker/:IdLogin", eliminarChecker);

export default router;
```

---

## 🗄️ Repositorio (`/src/adapter/repositories/checker.repository.js`)
```js
import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/checker.queries.js";

export class CheckerRepository {
    async buscarCheckers(correoEmpleado) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input("CorreoCheck", sql.VarChar, correoEmpleado)
            .input("User", sql.VarChar, "DEPARTAMENTO")
            .input("Activo", sql.Int, 1)
            .query(queries.buscarCheckersQuery);
        return result.recordset;
    }

    async cambiarActividad(idLogin, status, matricula) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input("IdLogin", sql.Int, idLogin)
            .input("Actividad", sql.Int, status)
            .input("Credencial", sql.VarChar, matricula)
            .query(queries.cambiarActividadQuery);
        return result.rowsAffected[0] > 0;
    }

    async eliminarChecker(idLogin) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input("IdLogin", sql.Int, idLogin)
            .query(queries.eliminarCheckerQuery);
        return result.rowsAffected[0] > 0;
    }
}
```

---

## 📲 Controlador (`/src/adapter/controllers/checker.controller.js`)
```js
import { buscarCheckersUseCase, cambiarActividadUseCase, eliminarCheckerUseCase } from "../../usercases/checker.usercase.js";

export async function buscarCheckers(req, res) {
    try {
        const data = await buscarCheckersUseCase(req.params.CorreoEmpleado);
        if (!data.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(data);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function cambiarActividad(req, res) {
    try {
        const success = await cambiarActividadUseCase(
            req.params.IdLogin,
            req.body.StatusActividad,
            req.body.Matricula
        );
        if (!success) return res.status(404).json({ message: "Dato no encontrado" });
        res.json("Dato Actualizado");
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function eliminarChecker(req, res) {
    try {
        const success = await eliminarCheckerUseCase(req.params.IdLogin);
        if (!success) return res.status(404).json({ message: "Dato no encontrado" });
        res.json("Dato Eliminado");
    } catch (error) {
        res.status(500).send(error.message);
    }
}
```


## 🔐 Módulo de Autorizaciones

Este módulo gestiona la asignación y validación de autorizaciones de permisos por parte de los empleados autorizadores.

## 📂 Estructura del Módulo (Clean Architecture)

```bash
/src
│
├── adapter/
│   ├── controllers/
│   │   └── authorize.controller.js
│   └── routes/
│   |   └── authorize.routes.js
│   ├── repositories/
│       └── authorize.repository.js
│
├── usecases/
│   └── authorize.usecase.js
│
├── queries/
│   └── authorize.queries.js
```

---

### 🧠 Casos de Uso
Ubicado en `src/usecases/authorize.usecase.js`:
```js
import { AuthorizeRepository } from "../adapter/repositories/authorize.repository.js";
const repository = new AuthorizeRepository();

export async function createAuthorizeUseCase(data) {
    return await repository.createAuthorize(data);
}

export async function asignarPreceptorUseCase(nivel, sexo) {
    return await repository.asignarPreceptor(nivel, sexo);
}

export async function definirAutorizacionUseCase(idPermiso, idEmpleado, statusAuthorize) {
    return await repository.definirAutorizacion(idPermiso, idEmpleado, statusAuthorize);
}

export async function verificarValidacionUseCase(idEmpleado, idPermiso) {
    return await repository.verificarValidacion(idEmpleado, idPermiso);
}

export async function advancePermissionUseCase(idPermission) {
    return await repository.advancePermission(idPermission);
}
```

---

### 🧩 Repositorio
Ubicado en `src/domain/repositories/authorize.repository.js`:
```js
import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/authorize.queries.js";

export class AuthorizeRepository {
    async createAuthorize(data) {
        const pool = await getConnection();
        const result = await pool.request()
            .input('IdEmpleado', sql.Int, data.IdEmpleado)
            .input('NoDepto', sql.Int, data.NoDepto)
            .input('IdPermission', sql.Int, data.IdPermission)
            .input('StatusAuthorize', sql.VarChar, data.StatusAuthorize)
            .query(queries.createAuthorizeQuery);
        await pool.close();
        return result.recordset[0];
    }

    async asignarPreceptor(nivel, sexo) {
        const pool = await getConnection();
        const result = await pool.request()
            .input('NivelDormitorio', sql.VarChar, nivel)
            .input('Sexo', sql.VarChar, sexo)
            .query(queries.asignarPreceptorQuery);
        await pool.close();
        return result.recordset[0];
    }

    async definirAutorizacion(idPermiso, idEmpleado, statusAuthorize) {
        const pool = await getConnection();
        const updateResult = await pool.request()
            .input('IdPermiso', sql.Int, idPermiso)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(queries.definirAutorizacionQuery);

        if (updateResult.rowsAffected[0] === 0) {
            await pool.close();
            return null;
        }

        const updated = await pool.request()
            .input('IdPermiso', sql.Int, idPermiso)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(queries.selectUpdatedAuthorizationQuery);

        await pool.close();
        return updated.recordset[0];
    }

    async verificarValidacion(idEmpleado, idPermiso) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('IdPermiso', sql.Int, idPermiso)
            .query(queries.verificarValidacionQuery);
        await pool.close();
        return result.recordset[0] || null;
    }

    async advancePermission(idPermission) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input('Id', sql.Int, idPermission)
            .query(queries.advancePermissionQuery);
        await pool.close();
        return result.recordset;
    }
}
```

---

### 🌐 Rutas
Ubicado en `src/adapter/routes/authorize.routes.js`:
```js
import { Router } from "express";
import { createAuthorize, asignarPreceptor, definirAutorizacion, verificarValidacion, advancePermission } from "../controller/authorize.controller.js";

const router = Router();

router.post("/authorize", createAuthorize);
router.get("/asignarPrece/:Nivel", asignarPreceptor);
router.put("/autorizarPermission/:Id", definirAutorizacion);
router.get("/validarAuthorize/:Id", verificarValidacion);
router.get("/progresAuthorize/:Id", advancePermission);

export default router;
```

---

### 🧾 Controlador
Ubicado en `src/adapter/controllers/authorize.controller.js`:
```js
import { createAuthorizeUseCase, asignarPreceptorUseCase, definirAutorizacionUseCase, verificarValidacionUseCase, advancePermissionUseCase } from "../../usercases/authorize.usercase";

export async function createAuthorize(req, res) {
    try {
        const result = await createAuthorizeUseCase(req.body);
        if (!result) return res.status(404).json({ message: "No se puede guardar el archivo" });
        res.json({ ...req.body, Id: result.IdAuthorize });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el servicio' });
    }
}

export async function asignarPreceptor(req, res) {
    try {
        const result = await asignarPreceptorUseCase(req.params.Nivel, req.query.Sexo);
        if (!result) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function definirAutorizacion(req, res) {
    try {
        const result = await definirAutorizacionUseCase(
            req.params.Id,
            req.body.IdEmpleado,
            req.body.StatusAuthorize
        );
        if (!result) return res.status(404).json({ message: "Dato no actualizado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function verificarValidacion(req, res) {
    try {
        const result = await verificarValidacionUseCase(req.params.Id, req.query.IdPermiso);
        if (!result) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function advancePermission(req, res) {
    try {
        const result = await advancePermissionUseCase(req.params.Id);
        if (!result.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
```

---


## 📈 Beneficio

✅ **Este módulo permite validar el avance de un permiso, asignar preceptores automáticamente según el nivel y sexo, y registrar o actualizar la autorización de un permiso por parte del empleado responsable.**


## 📐 Diagrama de Arquitectura

```plaintext
[Express Router]
       |
[ Controllers ]
       |
[ Use Cases ]
       |
[ Repositories ]
       |
[ SQL Server (via MSSQL) ]
```

---

## 🧱 Diagrama de Clases (simplificado)

```plaintext
+--------------------+
|   AuthRepository   |
+--------------------+
| + getUserBy...()   |
| + updatePassword() |
+--------------------+

+--------------------+
|   UserRepository   |
+--------------------+
| + getUserById()    |
| + endCargo()       |
+--------------------+

+----------------------+
|   PermissionRepository   |
+----------------------+
| + createPermission()     |
| + filtrarPermisos()      |
+----------------------+
```

---

## 🔧 Interfaces de Servicio

- `GET /permission/:Id`
- `POST /permission`
- `PUT /permissionValorado/:Id`
- `GET /dashboardPermission/:IdPreceptor`
- `GET /doctos/:Id`
- `POST /doctosMul`
- `PUT /doctosMul/updateProfile`
- `DELETE /doctosMul/:Id`

---

## 💡 Decisiones de diseño

- Se usó MSSQL en vez de ORM por rendimiento y control total del SQL, ademas de ser el gestor con el que ya cuenta la institucion.
- Separamos `multer` y lógica de archivos del controlador.
- La verificación de delegados y preceptores se hizo en la base de datos para garantizar consistencia.
- Se usó `async/await` con `try/catch/finally` para asegurar el cierre correcto del `pool`.
- Simplemento un diseño de arquitectura para evitar el alto acoplamiento del proyecto original y tener un mejor mantemiento y escalabilidad

---

## ✅ Conclusión
La refactorización hacia Clean Architecture no solo organiza el código, sino que facilita su mantenibilidad, testeo y escalabilidad. Cada módulo ahora es reutilizable, independiente y con responsabilidades claras.


npm install
```

---

## 🔐 3. Configurar Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_SERVER=localhost
DB_DATABASE=UniPassDB
PORT=3000
```

Asegúrate de que estos datos coincidan con la configuración de tu SQL Server.

---

## 🛠 4. Configurar la Base de Datos

- Asegúrate de que la base de datos esté creada en SQL Server.
- Verifica que las tablas y relaciones estén creadas según el esquema esperado.
- (Opcional) Puedes incluir un script de respaldo (.bak) o script `.sql` para automatizar este paso.

---

## 🚀 5. Iniciar el Servidor

```bash
npm run dev
```

O para producción:

```bash
npm start
```

---

## 🧪 6. Probar Conexión

Puedes probar el endpoint principal:

```bash
GET http://localhost:3000/permission/:Id
```

También puedes usar herramientas como Postman para probar la API.

---

## 🔄 7. Habilitar Inicio Automático (Opcional)

Para mantener el servidor activo incluso tras reinicios:

### Instalar PM2

```bash
npm install pm2 -g
```

### Ejecutar con PM2

```bash
pm2 start index.js --name unipass-api
pm2 save
pm2 startup
```

---

## 📡 8. Acceso Remoto a la API

- Si deseas exponer la API públicamente:
  - Configura el router para redireccionar el puerto 3000.
  - Asegúrate de que el firewall permita tráfico entrante en ese puerto.
  - Usa una IP pública o dominio configurado.

---

## ✅ Verificación

Una vez hecho esto, deberías poder acceder a tu API desde otro equipo:

```bash
curl http://IP_DEL_SERVIDOR:3000/permission/:Id
```

---
