import { accessToken, cloudinaryCloudName } from './cloud';
import { ReceiptRecord, ReceiptSync } from './receipts';

/**
 * Cloudinary as the remote archive for bill photos.
 *
 * The server holds the API secret and signs one upload at a time, so nothing
 * here can write outside the caller's own folder — `liquid/<user id>/<receipt
 * id>` is decided server-side from the bearer token, never from this file.
 *
 * That naming is also what makes a second device work. A transaction carries
 * its `receiptId` through Supabase, so a phone that has never seen the blob
 * can still derive the delivery URL without any extra column to sync.
 */

interface SignedUpload {
  signature: string;
  timestamp: number;
  folder: string;
  publicId: string;
  apiKey: string;
}

const UPLOAD_TIMEOUT_MS = 60_000;

async function signUpload(receiptId: string): Promise<SignedUpload | null> {
  const token = await accessToken();
  // Signed out, or local-only: there is no account to file the bill under.
  if (!token) return null;

  try {
    const response = await fetch('/api/uploads/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receiptId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.warn(`Bill upload was not signed (${response.status}); keeping it on this device.`);
      return null;
    }
    return (await response.json()) as SignedUpload;
  } catch {
    return null;
  }
}

/** Full Cloudinary public id for a receipt belonging to `userId`. */
function publicIdFor(userId: string, receiptId: string): string {
  return `liquid/${userId}/${receiptId}`;
}

export function cloudinaryConfigured(): boolean {
  return Boolean(cloudinaryCloudName);
}

/**
 * Builds the sync target for one account. Returns null when Cloudinary is not
 * configured, which keeps the app's "everything still works locally" promise:
 * a build with no cloud name simply never registers a target.
 */
export function createCloudinaryReceiptSync(userId: string): ReceiptSync | null {
  const cloudName = cloudinaryCloudName;
  if (!cloudName) return null;

  return {
    name: 'Cloudinary',

    async upload(record: ReceiptRecord): Promise<string | null> {
      const signed = await signUpload(record.id);
      if (!signed) return null;

      const form = new FormData();
      form.append('file', record.blob);
      form.append('api_key', signed.apiKey);
      form.append('timestamp', String(signed.timestamp));
      form.append('folder', signed.folder);
      form.append('public_id', signed.publicId);
      form.append('signature', signed.signature);

      try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        });
        if (!response.ok) {
          // "Invalid Signature" here almost always means the account's
          // signature algorithm does not match CLOUDINARY_SIGN_ALGO.
          console.warn(`Cloudinary refused the bill upload (${response.status}).`);
          return null;
        }
        const result = (await response.json()) as { public_id?: string };
        return result.public_id ?? null;
      } catch {
        return null;
      }
    },

    async remove(remoteId: string): Promise<void> {
      const token = await accessToken();
      if (!token) return;
      try {
        await fetch('/api/uploads/destroy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ publicId: remoteId }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        // A bill that outlives its transaction is untidy, not broken.
      }
    },

    /**
     * The URL for a bill this device has never held. Derived, not stored, so
     * it works on a fresh install the moment the ledger has synced.
     */
    resolve(receiptId: string): string | null {
      return `https://res.cloudinary.com/${cloudName}/image/upload/${publicIdFor(userId, receiptId)}`;
    },
  };
}
