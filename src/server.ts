import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger (Premium/Modern UX)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`,
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


// Global Error Handler
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("[Error] Handler caught exception:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  },
);

// Setup Swagger Documentation
setupSwagger(app);

// Start Server
app.listen(PORT, () => {
  console.log(
    `⚡️ [server]: ERP Store Backend API is running at http://localhost:${PORT}`,
  );
});

export default app;
