import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { setupSwagger } from "./swagger";

// Import Routers
import categoriesRouter from "./routes/categories";
import productsRouter from "./routes/products";
import customersRouter from "./routes/customers";
import suppliersRouter from "./routes/suppliers";
import salesRouter from "./routes/sales";
import expensesRouter from "./routes/expenses";
import reportsRouter from "./routes/reports";
import usersRouter from "./routes/users";
import licenseRouter from "./routes/license";
import ownerRouter from "./routes/owner";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Environment validation
const requiredSecrets = [
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "LICENSE_SIGNING_SECRET",
];
const missingSecrets = requiredSecrets.filter((key) => !process.env[key]);
if (missingSecrets.length > 0) {
  console.error(
    `[FATAL] Missing required environment variables: ${missingSecrets.join(", ")}`
  );
  process.exit(1);
}

// CORS allowlist
const corsOriginEnv = process.env.CORS_ORIGIN;
const corsOrigin = corsOriginEnv
  ? corsOriginEnv.split(",").map((o) => o.trim())
  : NODE_ENV === "production"
    ? []
    : "*";

app.use(
  cors({
    origin: corsOrigin,
    credentials: false,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request ID middleware
app.use((req, res, next) => {
  const requestId =
    (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (req as any).id = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

// Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const requestId = (req as any).id || "-";
    console.log(
      `[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`,
    );
  });
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/categories", categoriesRouter);
app.use("/api/products", productsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/sales", salesRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);
app.use("/api/license", licenseRouter);
app.use("/api/owner", ownerRouter);

// Global Error Handler
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const requestId = (req as any).id || "-";
    console.error(`[Error] [${requestId}]`, err);

    const status = err.status || err.statusCode || 500;
    const code = err.code || "INTERNAL_SERVER_ERROR";
    const message = err.message || "حدث خطأ داخلي في النظام.";

    res.status(status).json({
      success: false,
      code,
      message,
      details: err.details || undefined,
    });
  },
);

// Setup Swagger Documentation (dev only by default)
if (NODE_ENV !== "production") {
  setupSwagger(app);
}

// Start Server
app.listen(PORT, () => {
  console.log(
    `⚡️ [server]: ERP Store Backend API is running at http://localhost:${PORT}`,
  );
});

export default app;
