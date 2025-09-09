/**
 * Creates an alignment worker using dynamic import
 * This approach is more compatible across different bundlers and environments
 */
export async function createAlignmentTrainingWorker(): Promise<Worker> {
    try {
        // Try dynamic import first (works with most modern bundlers)
        const AlignmentWorkerModule = await import('../AlignmentTrainer.worker');
        const AlignmentWorker = AlignmentWorkerModule.default;
        return new AlignmentWorker();
    } catch (error) {
        console.error('Failed to load worker via dynamic import:', error);
        throw new Error('Unable to create alignment worker. Please ensure your bundler supports web workers.');

        // try {
        //     // Fallback: try to create worker from URL (modern browsers with module workers)
        //     const workerUrl = new URL('../AlignmentTrainer.worker.js', import.meta.url);
        //     return new Worker(workerUrl, { type: 'module' });
        // } catch (urlError) {
        //     console.error('Failed to load worker via URL:', urlError);
        //
        //     // Final fallback: try without module type
        //     try {
        //         const workerUrl = new URL('../AlignmentTrainer.worker.js', import.meta.url);
        //         return new Worker(workerUrl);
        //     } catch (finalError) {
        //         console.error('All worker creation methods failed:', finalError);
        //         throw new Error('Unable to create alignment worker. Please ensure your bundler supports web workers.');
        //     }
        // }
    }
}

