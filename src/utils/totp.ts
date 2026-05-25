import * as OTPAuth from 'otpauth';

export const generateTOTPSecret = (): string => {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
};

export const getTOTPUri = (secret: string, label: string): string => {
  const totp = new OTPAuth.TOTP({
    issuer: 'NexChat',
    label: label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
};

export const validateTOTP = (secret: string, token: string): boolean => {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'NexChat',
      label: 'user',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
};
