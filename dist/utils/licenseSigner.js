"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signLicenseSnapshot = signLicenseSnapshot;
exports.verifyLicenseSnapshot = verifyLicenseSnapshot;
const crypto_1 = __importDefault(require("crypto"));
const SIGNING_SECRET = process.env.LICENSE_SIGNING_SECRET || 'witch-store-secret-key-2026-secure-hmac';
function signLicenseSnapshot(snapshot) {
    // Deterministic sorting of object keys
    const orderedSnapshot = Object.keys(snapshot)
        .sort()
        .reduce((obj, key) => {
        obj[key] = snapshot[key];
        return obj;
    }, {});
    const serialized = JSON.stringify(orderedSnapshot);
    return crypto_1.default.createHmac('sha256', SIGNING_SECRET).update(serialized).digest('hex');
}
function verifyLicenseSnapshot(snapshotWithSignature) {
    try {
        const { signature, ...snapshot } = snapshotWithSignature;
        if (!signature)
            return false;
        const computedSignature = signLicenseSnapshot(snapshot);
        const sigBuffer = Buffer.from(signature, 'hex');
        const compBuffer = Buffer.from(computedSignature, 'hex');
        if (sigBuffer.length !== compBuffer.length) {
            return false;
        }
        return crypto_1.default.timingSafeEqual(sigBuffer, compBuffer);
    }
    catch {
        return false;
    }
}
