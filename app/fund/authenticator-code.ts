import "server-only";
import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";

export function open(value: string, key: Buffer, owner: string) {
  const sealed = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}

export function acceptedStep(secret: Buffer, code: unknown) {
  if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) return null;
  const step = Math.floor(Date.now() / 30000);
  for (const candidate of [step, step - 1, step + 1]) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(candidate));
    const digest = createHmac("sha1", secret).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const decimal = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
    if (timingSafeEqual(Buffer.from(decimal), Buffer.from(code))) return candidate;
  }
  return null;
}
