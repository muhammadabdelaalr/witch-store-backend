import crypto from 'crypto';

const PLACEHOLDER_PATTERNS = [
  /change[-_ ]?me/i,
  /placeholder/i,
  /fallback/i,
  /replace[-_ ]?in[-_ ]?env/i,
];

// SPKI DER for the Ed25519 public key embedded in witch-store/src/main/licenseKeys.ts.
const POS_LICENSE_PUBLIC_KEY_SPKI_BASE64 = 'MCowBQYDK2VwAyEA++ieUM1DepNOQAsfOJxSq0C/Jx1ODnUWEU/+8TXDhEs=';

export function requireSecret(name: string, minimumLength = 32): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength || PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
    throw new Error(`${name} must be configured with a non-placeholder value of at least ${minimumLength} characters`);
  }
  return value;
}

export function validateRuntimeEnvironment(): void {
  requireSecret('JWT_SECRET');
  requireSecret('JWT_REFRESH_SECRET');
  const encodedPrivateKey = requireSecret('LICENSE_PRIVATE_KEY_BASE64');

  let privateKey: crypto.KeyObject;
  try {
    const privateKeyPem = Buffer.from(encodedPrivateKey, 'base64').toString('utf8');
    privateKey = crypto.createPrivateKey(privateKeyPem);
  } catch {
    throw new Error('LICENSE_PRIVATE_KEY_BASE64 must contain a valid PKCS8 private key');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('LICENSE_PRIVATE_KEY_BASE64 must contain an Ed25519 private key');
  }

  const derivedPublicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const embeddedPublicKey = Buffer.from(POS_LICENSE_PUBLIC_KEY_SPKI_BASE64, 'base64');
  if (
    derivedPublicKey.length !== embeddedPublicKey.length ||
    !crypto.timingSafeEqual(derivedPublicKey, embeddedPublicKey)
  ) {
    throw new Error('LICENSE_PRIVATE_KEY_BASE64 does not match the public key embedded in the POS app');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN?.trim()) {
    throw new Error('CORS_ORIGIN is required in production');
  }
}
