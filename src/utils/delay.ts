/**
 * wraps timer in a Promise to make an async function that continues after a specific number of milliseconds.
 * @param ms - The number of milliseconds to delay
 * @returns A Promise that resolves after the specified delay
 */
export default function delay(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}