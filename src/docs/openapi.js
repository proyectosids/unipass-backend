// OpenAPI 3.0 de la API UniPass (71 endpoints). Se sirve en /api-docs (UI) y
// /api-docs.json (spec cruda). La spec se genera a partir de una lista compacta de
// endpoints (E) para evitar boilerplate. Auth: 'bearer' = requiere JWT;
// 'ADMIN'/'ADMIN|SUPERVISOR'/'PRECEPTOR|VIGILANCIA' = además capability/rol.

const PORT = process.env.PORT || 3000;

// [ metodo, ruta(OpenAPI {param}), tag, resumen, { auth, query, body, notes } ]
const E = [
  // --- Sesión y usuarios ---
  ['post', '/login', 'Sesión', 'Login (matrícula o correo)', { body: { Matricula: '221068', 'Contraseña': 'tu_password' } }],
  ['post', '/refresh-token', 'Sesión', 'Rotar tokens', { body: { refreshToken: '<refresh>' } }],
  ['post', '/logout', 'Sesión', 'Cerrar sesión', { auth: 'bearer', body: { refreshToken: '<refresh>' } }],
  ['get', '/verifyToken', 'Sesión', 'Validar sesión', { auth: 'bearer' }],
  ['post', '/register', 'Sesión', 'Alta de usuario', { body: { Matricula: '230001', 'Contraseña': 'abc12345', Correo: 'a@ulv.edu.mx', Nombre: 'Ana', Apellidos: 'Pérez', TipoUser: 'ALUMNO', Sexo: 'F', FechaNacimiento: '2004-05-12', Celular: '9611234567', Dormitorio: 1 } }],
  ['get', '/me', 'Usuarios', 'Perfil del usuario autenticado (proyección segura, sin hash/TokenCFM)', { auth: 'bearer' }],
  // RETIRADO (BOLA/IDOR R1-C) → 404: GET /user/{Id} y GET /userMatricula/{Matricula} (usar GET /me).
  // RETIRADO (BOLA/IDOR R1-A) → 404: GET /buscarUser (usar /buscarPersona), /userChecks (legado), /VerToken (TokenCFM interno).
  ['put', '/cambiarCargo/{Matricula}', 'Usuarios', 'Asignar cargo delegado', { body: { IdCargoDelegado: 7 } }],
  ['put', '/terminarCargo/{Matricula}', 'Usuarios', 'Terminar cargo + borrar Position'],
  ['put', '/TokenDispositivo/{Matricula}', 'Usuarios', 'Registrar token FCM (Task 7.2: matrícula del token)', { auth: 'bearer', body: { TokenCFM: 'fcm_token' } }],
  ['put', '/Documentacion/{Matricula}', 'Usuarios', 'CONTENIDO (7.3 D1-A, DEPRECATED): Bearer; ignora Matricula/StatusDoc; devuelve Documentacion propia (SELF)', { auth: 'bearer' }],
  // --- Contraseña ---
  ['put', '/me/password', 'Contraseña', 'Cambio autenticado (min 8, 1 letra, 1 número)', { auth: 'bearer', body: { actual: 'PASS_ACTUAL', nueva: 'NuevaPass123' } }],
  ['post', '/password/forgot', 'Contraseña', 'Recuperación por matrícula (respuesta genérica)', { body: { matricula: '221068' } }],
  ['post', '/password/verify-otp', 'Contraseña', 'Validar OTP -> resetToken', { body: { matricula: '221068', otp: '1234' } }],
  ['post', '/password/reset', 'Contraseña', 'Aplicar nueva contraseña', { body: { resetToken: '<opaco>', nueva: 'NuevaPass123' } }],
  // RETIRADO (P0): PUT /password/{Correo} eliminado. El correo del cliente no autoriza cambios.
  // --- Permisos ---
  ['post', '/permission', 'Permisos', 'Crear permiso (cadena server-side tipos 1/2/3; tipo 4 no disponible)', { auth: 'bearer', body: { FechaSolicitada: '2026-08-24T10:00:00', FechaSalida: '2026-08-25T09:00:00', FechaRegreso: '2026-08-25T18:00:00', Motivo: 'Trámite', IdTipoSalida: 1, MedioSalida: 'Autobús' } }],
  ['get', '/permission/{Id}', 'Permisos', 'Historial paginado del alumno', { query: { page: '1', limit: '10' } }],
  ['put', '/permission/{Id}', 'Permisos', 'Cancelar (solo dueño)', { auth: 'bearer' }],
  ['delete', '/permission/{Id}', 'Permisos', 'Eliminar (cerrado a ADMIN)', { auth: 'ADMIN' }],
  // RETIRADO (Task 7.4B, Commit A): PUT /permissionValorado/{Id} eliminado. El estado global lo calcula el backend.
  ['get', '/PermissionsPreceptor/{Id}', 'Permisos', 'Bandeja del preceptor'],
  ['get', '/permissionsEmployee/{Id}', 'Permisos', 'Bandeja del empleado'],
  ['get', '/permissionTop/Student/{Id}', 'Permisos', 'Últimos 10 del alumno'],
  ['get', '/permissionTop/Employee/{Id}', 'Permisos', 'Últimos 10 del empleado'],
  ['get', '/permissionTop/Preceptor/{Id}', 'Permisos', 'Últimos 10 del preceptor'],
  ['get', '/dashboardPermission/{IdPreceptor}', 'Permisos', 'Conteos de permisos'],
  ['get', '/dashboardDocumentos/{IdPreceptor}', 'Permisos', 'Conteos de documentos'],
  ['get', '/permissions/filter/{IdPreceptor}', 'Permisos', 'Filtro de permisos', { query: { fechaInicio: '2026-08-01', fechaFin: '2026-08-31', status: '', nombre: '', matricula: '' } }],
  // --- Autorización ---
  ['get', '/autorizadorSalida', 'Autorización', 'Resuelve autorizador salidas 2/3 (solo lectura; ya NO requerido para crear el permiso)', { query: { tipo: '2', nivelAcademico: 'UNIVERSITARIO', sexo: 'M' } }],
  // RETIRADO (Task 7.4B, Commit B): POST /authorize eliminado. La cadena se crea server-side en POST /permission.
  ['put', '/autorizarPermission/{Id}', 'Autorización', 'Resolver eslabón (actor = token; global recalculado)', { auth: 'bearer', body: { StatusAuthorize: 'Aprobada' } }],
  ['get', '/validarAuthorize/{Id}', 'Autorización', '¿Participa en la cadena?', { query: { IdPermiso: '7069' } }],
  ['get', '/progresAuthorize/{Id}', 'Autorización', 'Avance de la cadena'],
  ['get', '/asignarPrece/{Nivel}', 'Autorización', 'Dormitorio/preceptor por nivel+sexo', { query: { Sexo: 'M' } }],
  // --- Checks ---
  // RETIRADO (Checks Hardening C2): POST /checks eliminado. Los 4 CheckPoints se crean server-side al aprobar el permiso.
  ['get', '/checksDormitorio/{Id}', 'Checks', 'Pendientes paso 1 (salida dormitorio)'],
  ['get', '/checksVigilancia', 'Checks', 'Pendientes paso 2 (salida caseta)'],
  ['get', '/checksVigilanciaRegreso', 'Checks', 'Pendientes paso 3 (regreso caseta)'],
  ['get', '/checksDormitorioFin/{Id}', 'Checks', 'Pendientes paso 4 (regreso dormitorio)'],
  ['put', '/checks/{id}', 'Checks', 'Confirmar check (grant + orden 1->4)', { auth: 'bearer', body: { FechaCheck: '2026-08-24T09:05:00', Estatus: 'Confirmada', Observaciones: 'Ninguna' } }],
  // --- Capabilities ---
  ['get', '/getCapabilities', 'Capabilities', 'Capabilities del usuario', { auth: 'bearer' }],
  ['post', '/checkerGrant', 'Capabilities', 'Otorgar CHECKER', { auth: 'PRECEPTOR|VIGILANCIA', body: { IdLogin: 1, Scope: 'AMBOS', Vigencia: 'PERMANENTE' } }],
  ['get', '/checkerGrants', 'Capabilities', 'Grants activos scopeados', { auth: 'PRECEPTOR|VIGILANCIA' }],
  ['get', '/checkerGrantsByUser/{idLogin}', 'Capabilities', 'Grants de un usuario', { auth: 'PRECEPTOR|VIGILANCIA' }],
  ['put', '/checkerGrant/{idGrant}', 'Capabilities', 'Activar/desactivar', { auth: 'PRECEPTOR|VIGILANCIA', body: { Activo: 0 } }],
  ['delete', '/checkerGrant/{idGrant}', 'Capabilities', 'Revocar CHECKER', { auth: 'PRECEPTOR|VIGILANCIA' }],
  ['get', '/buscarPersona/{Nombre}', 'Capabilities', 'Personas asignables (campos seguros)', { auth: 'PRECEPTOR|VIGILANCIA' }],
  ['post', '/supervisorGrant', 'Capabilities', 'Otorgar SUPERVISOR', { auth: 'ADMIN', body: { IdLogin: 1 } }],
  ['delete', '/supervisorGrant/{idLogin}', 'Capabilities', 'Revocar SUPERVISOR', { auth: 'ADMIN' }],
  // --- Admin ---
  ['get', '/admin/dashboard', 'Admin', 'Panel del coordinador (conteos)', { auth: 'ADMIN|SUPERVISOR', query: { desde: '2026-08-01', hasta: '2026-08-31' } }],
  ['get', '/admin/reporte', 'Admin', 'Salidas valoradas 2/3', { auth: 'ADMIN|SUPERVISOR', query: { desde: '2026-08-01', hasta: '2026-08-31' } }],
  ['get', '/admin/observaciones', 'Admin', 'Observaciones de checadores', { auth: 'ADMIN|SUPERVISOR', query: { desde: '2026-08-01', hasta: '2026-08-31' } }],
  // --- Documentos ---
  ['post', '/doctosMul', 'Documentos', 'Subir documento (multipart, campo Archivo)', { auth: 'bearer', form: true }],
  ['put', '/doctosMul/updateProfile', 'Documentos', 'Reemplazar documento propio', { auth: 'bearer', form: true }],
  ['delete', '/doctosMul/{Id}', 'Documentos', 'Borrar documento propio', { auth: 'bearer', body: { IdDoctos: 512 } }],
  ['get', '/doctosProfile/{id}', 'Documentos', 'Documento puntual', { query: { IdDocumento: '1' } }],
  ['get', '/doctos/{Id}', 'Documentos', 'Documentos del usuario'],
  ['get', '/getExpediente/{IdDormi}', 'Documentos', 'Expedientes por dormitorio'],
  ['get', '/getArchivos/{Dormitorio}', 'Documentos', 'Archivos filtrados'],
  // RETIRADO (7.3 D1-A): PUT /statusRevision/{Id} eliminado (aprobación anónima, 0 consumidores) → 404.
  ['put', '/documents/{idDoctos}/reject', 'Documentos', '7.3 D1-A: rechazo SEGURO (PRECEPTOR del dorm; state machine + AuditLog)', { auth: 'bearer', body: { motivo: 'DOCUMENTO_ILEGIBLE', comentario: '' } }],
  ['put', '/doctosMul/reject/{Id}', 'Documentos', 'LEGADO CONTENIDO (DEPRECATED — REMOVE D1-C): Bearer; actor del token; ignora MatriculaPreceptor', { auth: 'bearer', body: { IdDocumento: 2, Motivo: 'DOCUMENTO_ILEGIBLE', Comentario: '' } }],
  // --- Dormitorios / puntos / cargos ---
  ['get', '/dormitorio/{Sexo}/{NivelAcademico}', 'Catálogos', 'Bedroom por sexo/nivel'],
  ['get', '/getPoints/{Id}', 'Catálogos', 'Puntos de un tipo de salida'],
  ['get', '/InfoCargo/{Id}', 'Catálogos', 'Cargo por matrícula del suplente'],
  ['get', '/InfoDelegado/{Id}', 'Catálogos', 'Delegaciones del encargado'],
  ['post', '/createPosition', 'Catálogos', 'Alta de suplencia', { body: { MatriculaEncargado: '41', ClassUser: 'PRECEPTOR', Asignado: '273' } }],
  ['put', '/activarCargo/{Id}', 'Catálogos', 'Activar/desactivar suplencia', { body: { Activo: 1 } }]
];

const authLabel = (a) => (a === 'bearer' ? 'Requiere Bearer JWT.' : `Requiere Bearer JWT + capability/rol ${a}.`);

const buildPaths = () => {
  const paths = {};
  for (const [method, ruta, tag, summary, opt = {}] of E) {
    const op = { tags: [tag], summary, responses: { 200: { description: 'OK' } } };
    if (opt.auth) {
      op.security = [{ bearerAuth: [] }];
      op.description = authLabel(opt.auth);
      op.responses[401] = { description: 'No autenticado' };
      if (opt.auth !== 'bearer') op.responses[403] = { description: 'Sin permiso (FORBIDDEN_ROLE / FORBIDDEN_CAPABILITY)' };
    }
    // path params desde {..}
    const params = [];
    for (const m of ruta.matchAll(/\{(\w+)\}/g)) {
      params.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
    }
    for (const [q, ej] of Object.entries(opt.query || {})) {
      params.push({ name: q, in: 'query', required: false, schema: { type: 'string' }, example: ej });
    }
    if (params.length) op.parameters = params;
    if (opt.form) {
      op.requestBody = { content: { 'multipart/form-data': { schema: { type: 'object', properties: { Archivo: { type: 'string', format: 'binary' }, IdDocumento: { type: 'integer' } } } } } };
    } else if (opt.body) {
      op.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object' }, example: opt.body } } };
    }
    paths[ruta] = paths[ruta] || {};
    paths[ruta][method] = op;
  }
  return paths;
};

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'UniPass API',
    version: '1.0.0',
    description: 'API del sistema UniPass (permisos de salida, checador, autorización, expediente). ' +
      'Autenticación: obtén el token en POST /login y úsalo con "Authorize" (Bearer). ' +
      'Endpoints marcados con candado requieren token; algunos además una capability/rol.'
  },
  servers: [{ url: `http://localhost:${PORT}`, description: 'Local' }],
  tags: [
    { name: 'Sesión' }, { name: 'Usuarios' }, { name: 'Contraseña' }, { name: 'Permisos' },
    { name: 'Autorización' }, { name: 'Checks' }, { name: 'Capabilities' }, { name: 'Admin' },
    { name: 'Documentos' }, { name: 'Catálogos' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
  },
  paths: buildPaths()
};
