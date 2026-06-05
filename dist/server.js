"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const swagger_1 = require("./swagger");
// Import Routers
const categories_1 = __importDefault(require("./routes/categories"));
const products_1 = __importDefault(require("./routes/products"));
const customers_1 = __importDefault(require("./routes/customers"));
const suppliers_1 = __importDefault(require("./routes/suppliers"));
const sales_1 = __importDefault(require("./routes/sales"));
const expenses_1 = __importDefault(require("./routes/expenses"));
const reports_1 = __importDefault(require("./routes/reports"));
const users_1 = __importDefault(require("./routes/users"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Request Logger (Premium/Modern UX)
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});
// API Routes
app.use("/api/categories", categories_1.default);
app.use("/api/products", products_1.default);
app.use("/api/customers", customers_1.default);
app.use("/api/suppliers", suppliers_1.default);
app.use("/api/sales", sales_1.default);
app.use("/api/expenses", expenses_1.default);
app.use("/api/reports", reports_1.default);
app.use("/api/users", users_1.default);
// Global Error Handler
app.use((err, req, res, next) => {
    console.error("[Error] Handler caught exception:", err);
    res.status(500).json({
        error: "Internal Server Error",
        message: err.message,
    });
});
// Setup Swagger Documentation
(0, swagger_1.setupSwagger)(app);
// Start Server
app.listen(PORT, () => {
    console.log(`⚡️ [server]: ERP Store Backend API is running at http://localhost:${PORT}`);
});
exports.default = app;
