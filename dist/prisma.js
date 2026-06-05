"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.getUsername = getUsername;
exports.logUserActivity = logUserActivity;
const client_1 = require("./generated/prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Create connection pool and driver adapter
const connectionString = process.env.DATABASE_URL;
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
exports.prisma = new client_1.PrismaClient({ adapter });
// Helper to get username from request headers safely
function getUsername(req) {
    const header = req.headers['x-user-name'];
    const rawUsername = Array.isArray(header) ? (header[0] || 'System') : (header || 'System');
    try {
        return decodeURIComponent(rawUsername);
    }
    catch {
        return rawUsername;
    }
}
// Helper functions for user logging
async function logUserActivity(username, action, details) {
    if (!username)
        return;
    try {
        const user = await exports.prisma.user.findUnique({
            where: { name: username },
        });
        if (user) {
            const logs = JSON.parse(user.logs || '[]');
            logs.push({
                action,
                details,
                timestamp: new Date().toISOString(),
            });
            await exports.prisma.user.update({
                where: { id: user.id },
                data: { logs: JSON.stringify(logs) },
            });
        }
    }
    catch (error) {
        console.error(`Failed to log user activity for ${username}:`, error);
    }
}
