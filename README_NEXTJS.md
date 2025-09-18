# Using Alignment Training Worker on NextJS

in the src folder create a workers folder and add file`startAlignmentTrainer.js` :

```javascript
// Import the worker - webpack's worker-loader will handle this
import Worker from './AlignmentTrainerNextJS.worker';

/**
 * Creates an alignment worker
 * This function creates a new worker instance bundled by worker-loader
 */
export async function createAlignmentTrainingWorker() {
  try {
    console.log('Creating AlignmentTrainerNextJS worker...');
    // Create a new worker instance - worker-loader converts this import into a constructor
    const worker = new Worker();

    // Log when worker is successfully created
    console.log('AlignmentTrainerNextJS worker successfully created');
    return worker;
  } catch (error) {
    console.error('Failed to create alignment worker:', error);
    throw new Error('Unable to create alignment worker: ' + (error.message || 'Unknown error'));
  }
}
```

Then in the workers folder and add file`AlignmentTrainerNextJS.worker.js` :

```javascript
import { AlignmentTrainerUtils } from "enhanced-word-aligner-rcl";
const {processTrainingData, START_TRAINING} = AlignmentTrainerUtils;

console.log("AlignmentTrainerNextJS.worker.js: Worker script loaded and started", self);

const ctx = self;

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  const messageData = event?.data;
  console.log("AlignmentTrainer called with:", messageData);
  if (messageData?.data && messageData.type === START_TRAINING) {
    processTrainingData(ctx, messageData.data);
  }
});

// Add a listener for uncaught errors in the worker
self.addEventListener('error', (error) => {
  console.error("Error inside worker:", error);
  self.postMessage({
    type: 'error',
    message: 'Uncaught error in worker',
    error: error.toString()
  });
});

// This export is required for worker-loader
export default {};
```

Then modify `next.config.js` to support web workers such as:

```javascript
/** @type {import('next').NextConfig} */
module.exports = {
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /canvas/,
      })
    );

    if (!isServer) {
      // Use worker-loader for .worker.js files - only for client-side bundle
      config.module.rules.push({
        test: /\.worker\.(js|ts)$/,
        use: {
          loader: 'worker-loader',
          options: {
            filename: 'static/chunks/[name].[contenthash].worker.js',
            publicPath: '/_next/',
            esModule: false,
            inline: 'no-fallback'
          }
        }
      });
    }

    // Fallbacks for Node.js modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };

    return config;
  },
  experimental: {
    esmExternals: 'loose',
  }
};
```