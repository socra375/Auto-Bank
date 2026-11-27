/** Server-side read guard: never throws into the page; the caller renders an ErrorState. */
export async function safe<T>(p: Promise<T>): Promise<{ data: T; failed: false } | { data?: undefined; failed: true }> {
  try {
    return { data: await p, failed: false };
  } catch (e) {
    console.error("page data load failed", e);
    return { failed: true };
  }
}
