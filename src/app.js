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
import userchecksRoutes from "./routes/usercheckers.routes.js"
import morgan from 'morgan';


const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// Servir archivos estáticos
app.use(express.static('public'));

app.use(usersRoutes);

app.use(permissionRoutes);

app.use(doctosRoutes);

app.use(registerRoutes);

app.use(autorizaRoutes);

app.use(bedroomRoutes);

app.use(checkRoutes);

app.use(pointRoutes);

app.use(positionRoutes);

app.use(userchecksRoutes);

export default app;
