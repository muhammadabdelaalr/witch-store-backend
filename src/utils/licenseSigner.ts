import crypto from 'crypto';

export interface LicenseSnapshot {
  license_key_hash: string;
  company_id: number;
  company_name: string;
  app_name?: string | null;
  license_type: string;
  expires_at: string | null;
  allowed_modules: string[];
  allowed_features: string[];
  device_id: string;
  last_validated_at: string;
}

function getPrivateKey(): string {
  if (process.env.LICENSE_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.LICENSE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }
  if (process.env.LICENSE_PRIVATE_KEY) {
    return process.env.LICENSE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  throw new Error('Missing LICENSE_PRIVATE_KEY_BASE64 or LICENSE_PRIVATE_KEY in environment variables');
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
  const privateKeyPem = getPrivateKey();

  // Sign using Ed25519 asymmetric private key
  const signatureBuffer = crypto.sign(null, Buffer.from(serialized, 'utf8'), privateKeyPem);
  return signatureBuffer.toString('base64');
}

export function verifyLicenseSnapshot(snapshotWithSignature: any, publicKeyPem?: string): boolean {
  try {
    const { signature, ...snapshot } = snapshotWithSignature;
    if (!signature) return false;

    const orderedSnapshot = Object.keys(snapshot)
      .sort()
      .reduce((obj: any, key) => {
        obj[key] = (snapshot as any)[key];
        return obj;
      }, {});

    const serialized = JSON.stringify(orderedSnapshot);
    const sigBuffer = Buffer.from(signature, 'base64');

    if (!publicKeyPem) {
      const privateKey = getPrivateKey();
      const pubKeyObject = crypto.createPublicKey(privateKey);
      publicKeyPem = pubKeyObject.export({ type: 'spki', format: 'pem' }).toString();
    }

    return crypto.verify(null, Buffer.from(serialized, 'utf8'), publicKeyPem, sigBuffer);
  } catch {
    return false;
  }
}
