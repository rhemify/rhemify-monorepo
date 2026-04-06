/**
 * Decode a Solana private key from various formats.
 * Supports: JSON array (Solana CLI keypair), base64, hex.
 *
 * SECURITY: never log or serialize the output.
 */
export function decodeSolanaKey(key: string): Uint8Array {
  // JSON array format (Solana CLI keypair file: [1,2,3,...])
  try {
    const parsed = JSON.parse(key);
    if (Array.isArray(parsed) && parsed.length >= 32) {
      return new Uint8Array(parsed);
    }
  } catch {
    // not JSON
  }

  // Base64 (common for exported keypair files)
  try {
    const bytes = Buffer.from(key, "base64");
    if (bytes.length >= 64) return new Uint8Array(bytes);
  } catch {
    // not base64
  }

  // Hex (128+ hex chars = 64+ bytes)
  if (/^[0-9a-fA-F]+$/.test(key) && key.length >= 128) {
    const bytes = new Uint8Array(key.length / 2);
    for (let i = 0; i < key.length; i += 2) {
      bytes[i / 2] = parseInt(key.substring(i, i + 2), 16);
    }
    return bytes;
  }

  throw new Error(
    "Invalid Solana private key format. Expected JSON array, base64, or hex.",
  );
}
