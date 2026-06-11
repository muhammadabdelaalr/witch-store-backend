import crypto from 'crypto';

const SIGNING_SECRET = process.env.LICENSE_SIGNING_SECRET || 'witch-store-secret-key-2026-secure-hmac';

export interface LicenseSnapshot {
  license_key_hash: string;
  company_id: number;
  company_name: string;
  license_type: string;
  expires_at: string | null;
  allowed_modules: string[];
  allowed_features: string[];
  device_id: string;
  last_validated_at: string;
}

export function signLicenseSnapshot(snapshot: LicenseSnapshot): string {
  // Deterministic sorting of object keys
  const orderedSnapshot = Object.keys(snapshot)
    .sort()
    .reduce((obj: any, key) => {
      obj[key] = (snapshot as any)[key];
      return obj;
    }, {});
  
  const serialized = JSON.stringify(orderedSnapshot);
  return crypto.createHmac('sha256', SIGNING_SECRET).update(serialized).digest('hex');
}

export function verifyLicenseSnapshot(snapshotWithSignature: any): boolean {
  try {
    const { signature, ...snapshot } = snapshotWithSignature;
    if (!signature) return false;

    const computedSignature = signLicenseSnapshot(snapshot as LicenseSnapshot);
    const sigBuffer = Buffer.from(signature, 'hex');
    const compBuffer = Buffer.from(computedSignature, 'hex');

    if (sigBuffer.length !== compBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, compBuffer);
  } catch {
    return false;
  }
}
