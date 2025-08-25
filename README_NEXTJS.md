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

console.log("AlignmentTrainerNextJS.worker.js: Worker script loaded and started", self);
const TRAINING_RESULTS = 'trainingResults';

/**
 * Processes the training data and performs word alignment training sending results back to main thread
 * @param data - The training and testing data received from the main thread
 */
async function processTrainingData(data) {
  self.postMessage({ type: 'log', message: 'Training worker has started' });
  console.log("Training worker has started");

  try {
    const trainingModelResults = await AlignmentTrainerUtils.createTrainedWordAlignerModel(data);
    const trainedModel = trainingModelResults.wordAlignerModel.save();
    delete trainingModelResults.wordAlignerModel; // trim the model to save memory
    const workerResults = {
      type: TRAINING_RESULTS,
      message: 'Worker has finished',
      trainedModel,
      ...trainingModelResults,
    }
    self.postMessage(workerResults);
  } catch (error) {
    console.error("Worker error:", error);
    self.postMessage({
      type: TRAINING_RESULTS,
      message: 'There was an error while training the word map.',
      error: error.toString()
    });
  }
}

// Add a listener for uncaught errors in the worker
self.addEventListener('error', (error) => {
  console.error("Error inside worker:", error);
  self.postMessage({
    type: 'error',
    message: 'Uncaught error in worker',
    error: error.toString()
  });
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  const messageData = event?.data;
  console.log("AlignmentTrainer received message:", messageData);

  // Send acknowledgment back to main thread
  self.postMessage({ type: 'ack', received: messageData });

  if (messageData?.data && messageData.type === "startTraining") {
    processTrainingData(messageData.data);
  }
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