// Shared between the server-side upload service and the client forms that
// submit to it. Lives apart from lib/files/service.ts because that module is
// `server-only` and client components cannot import it.
//
// NOTE: next.config.ts must keep serverActions.bodySizeLimit ABOVE this value,
// with headroom for multipart overhead. Below it, Next rejects the request body
// with a 413 before the action runs, so the message below is never reached.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
export const MAX_UPLOAD_LABEL = "10 MB";
export const TOO_LARGE_MESSAGE = `File is too large (max ${MAX_UPLOAD_LABEL}).`;
