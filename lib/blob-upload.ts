// Public Blob URLs are served with the content type we store. Vercel Blob infers
// it from the pathname's extension when none is given, so a client-chosen file
// name like "photo.html" would be served as HTML. Every upload must derive the
// extension from the already-validated MIME type and pass it as contentType.

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export function blobUploadExtension(mimeType: string): string {
  const extension = EXTENSIONS[mimeType]
  if (!extension) throw new Error(`Unsupported upload type: ${mimeType}`)
  return extension
}

/** Pathname and contentType for a `put()` of a file whose MIME type was validated. */
export function blobUploadTarget(pathPrefix: string, file: { type: string }) {
  return {
    pathname: `${pathPrefix}.${blobUploadExtension(file.type)}`,
    contentType: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
  }
}
