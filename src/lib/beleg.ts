import { supabase } from './supabase';

const MAX_WIDTH = 1400;
const JPEG_QUALITY = 0.75;

/**
 * Komprimiert ein Bild auf max. 1400px Breite und 75% JPEG-Qualität.
 * Liefert ein Blob (image/jpeg) zurück.
 */
async function compressImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = bitmap.width > MAX_WIDTH ? MAX_WIDTH / bitmap.width : 1;
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/**
 * Lädt ein Beleg-Foto in den Storage-Bucket "belege" hoch.
 * Pfad-Konvention: belege/<shop_id>/<datum>/<schicht_nr>.jpg
 * (Anon-Insert-Policy verlangt heutiges Datum als zweites Path-Segment.)
 */
export async function uploadBeleg(
  file: File | Blob,
  shopId: string,
  datum: string,
  schichtNr: 1 | 2,
): Promise<string> {
  const compressed = await compressImage(file);
  const path = `${shopId}/${datum}/${schichtNr}.jpg`;
  const { error } = await supabase.storage
    .from('belege')
    .upload(path, compressed, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) throw error;
  return path;
}

/**
 * Liefert eine signierte URL (60 min Gültigkeit) zum Anzeigen eines Belegs.
 * Storage-Bucket "belege" ist privat.
 */
export async function getBelegUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('belege')
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteBeleg(path: string): Promise<void> {
  const { error } = await supabase.storage.from('belege').remove([path]);
  if (error) throw error;
}
