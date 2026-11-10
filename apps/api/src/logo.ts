import { ApiError } from './http';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Identify a logo from its bytes. The client MIME type is ignored. */
export function detectLogo(bytes: Buffer): 'png' | 'jpg' | 'svg' {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.includes(0)) throw new ApiError(400, 'validation', 'Logo must be a PNG, JPG or SVG');
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '').trim();
  const xmlThenSvg = /^<\?xml[\s\S]{0,200}<\s*svg[\s>/]/i.test(text);
  const svg = /^<\s*svg[\s>/]/i.test(text);
  if (!xmlThenSvg && !svg) throw new ApiError(400, 'validation', 'Logo must be a PNG, JPG or SVG');
  if (svgUnsafe(text)) throw new ApiError(400, 'validation', 'This SVG is not allowed');
  return 'svg';
}

function svgUnsafe(text: string): boolean {
  const compact = text.replace(/<!--[\s\S]*?-->/g, '');
  if (/<\s*script/i.test(compact)) return true;
  if (/<\s*foreignobject/i.test(compact)) return true;
  if (/<\s*(iframe|embed|object|applet|handler|set|animate|animatetransform|use|image|link|meta)\b/i.test(compact)) return true;
  if (/javascript\s*:/i.test(compact)) return true;
  if (/data\s*:/i.test(compact)) return true;
  if (/\son[a-z0-9]+\s*=/i.test(compact)) return true;
  if (/<!doctype|<!entity/i.test(compact)) return true;
  if (/&#/i.test(compact)) return true;
  return false;
}

export function logoContentType(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg') return 'image/jpeg';
  return 'image/svg+xml';
}
