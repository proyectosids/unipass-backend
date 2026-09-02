import "dotenv/config"
import express from 'express';
import cors from 'cors';
import usersRoutes from "./routes/user.routes.js";
import permissionRoutes from "./routes/permission.routes.js";
import doctosRoutes from "./routes/doctos.routes.js";
import registerRoutes from "./routes/resgister.routes.js";
import autorizaRoutes from "./routes/authorize.routes.js";
import bedroomRoutes from "./routes/bedroom.routes.js";
import checkRoutes from "./routes/checks.routes.js"
import pointRoutes from "./routes/point.routes.js"
import positionRoutes from "./routes/position.routes.js"
import checkerGrantRoutes from "./routes/checkerGrant.routes.js"
import adminRoutes from "./routes/admin.routes.js"
import passwordRoutes from "./routes/password.routes.js"
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from './docs/openapi.js';
import morgan from 'morgan';


const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// Task 7.3 D2-C: RETIRADO `app.use(express.static('public'))`. `public/` solo contenia `uploads/` (+ .gitignore)
// y Flutter (D2-B3, `61f28bd`) ya no depende de `/uploads/*`. Los binarios documentales se sirven UNICAMENTE
// por `GET /files/:idDoctos` (Bearer + politica). El path fisico `public/uploads` sigue existiendo como
// ALMACENAMIENTO interno (donde escribe multer y de donde lee /files), pero ya NO se expone por HTTP.
// Cierra DIRECT_FILE_ACCESS_BYPASS: `GET /uploads/<archivo>` -> 404 (con o sin token).

// Documentación interactiva (Swagger UI) + spec cruda OpenAPI
app.get('/api-docs.json', (req, res) => res.json(openapiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: 'UniPass API — Docs' }));

app.use(usersRoutes);

app.use(permissionRoutes);

app.use(doctosRoutes);

app.use(registerRoutes);

app.use(autorizaRoutes);

app.use(bedroomRoutes);

app.use(checkRoutes);

app.use(pointRoutes);

app.use(positionRoutes);

app.use(checkerGrantRoutes);

app.use(adminRoutes);

app.use(passwordRoutes);

export default app;
