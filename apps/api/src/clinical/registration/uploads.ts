import { ApiError } from '../../http';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DOC = 5_242_880;

export function detectPatientFile(bytes: Buffer): { ext: 'png' | 'jpg' | 'pdf'; mime: string } {
  if (bytes.length > MAX_DOC) throw new ApiError(400, 'validation', 'File must be 5 MB or smaller');
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG)) return { ext: 'png', mime: 'image/png' };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString() === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  throw new ApiError(400, 'validation', 'Use a PDF, JPG or PNG up to 5 MB');
}

export function patientPhotoMime(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg') return 'image/jpeg';
  return 'application/octet-stream';
}
