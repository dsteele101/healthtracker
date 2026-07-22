/** Downscales and re-encodes a photo client-side before it ever reaches disk.
 *  DDR result screens are legible well below camera resolution, and nothing
 *  needs the original once it's been captured. */

const MAX_EDGE = 1600
const QUALITY = 0.75

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not supported.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo.'))),
        'image/jpeg',
        QUALITY,
      )
    })
  } finally {
    bitmap.close()
  }
}
