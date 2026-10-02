// Shared with the source check so path detection is exercised independently.
export function hasPersonalPath(text) {
  return /[A-Z]:[\\/]+Users[\\/]+[A-Za-z0-9]/i.test(text) ||
    /\/(?:home|Users)\/[a-z][a-z0-9_.-]*(?:\/|\\|\b)/i.test(text) ||
    /\/root[\\/]/.test(text);
}
