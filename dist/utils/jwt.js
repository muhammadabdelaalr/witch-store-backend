"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'witch-store-jwt-secret-key-2026-default-fallback';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'witch-store-jwt-refresh-secret-key-2026';
function generateAccessToken(payload) {
    // Access tokens last 15 minutes in standard configs, but for local retail stability we can set to 2 hours
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}
function generateRefreshToken(payload) {
    // Refresh tokens last 30 days
    return jsonwebtoken_1.default.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_REFRESH_SECRET);
}
