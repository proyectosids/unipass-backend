import "dotenv/config"
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import usersRoutes from "./adapter/routes/user.routes.js";
import authRouters from "./adapter/routes/auth.routes.js";
import pointRouters from "./adapter/routes/point.routes.js";
import positionRoutes from "./adapter/routes/position.routes.js";
import checkerRoutes from "./adapter/routes/checker.routes.js";
import bedroomRoutes from "./adapter/routes/bedroom.routes.js"
import authorizeRoutes from "./adapter/routes/authorize.routes.js";
import checksRoutes from "./adapter/routes/checks.routes.js";
import doctosRoutes from "./adapter/routes/doctos.routes.js";
import permissionRoutes from "./adapter/routes/permission.routes.js";


const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Servir archivos estáticos
app.use(express.static('public'));

app.use(usersRoutes);

app.use(authRouters);

app.use(pointRouters);

app.use(positionRoutes);

app.use(checkerRoutes)

app.use(bedroomRoutes)

app.use(authorizeRoutes)

app.use(checksRoutes);

app.use(doctosRoutes);

app.use(permissionRoutes)

export default app;
