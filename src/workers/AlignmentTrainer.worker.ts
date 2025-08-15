import { TTrainingAndTestingData } from "./WorkerComTypes";
import {createTrainedWordAlignerModel} from "./utils/AlignmentTrainerUtils";

const TRAINING_RESULTS = 'trainingResults';

/**
 * Processes the training data and performs word alignment training sending results back to main thread
 * @param data - The training and testing data received from the main thread
 */
async function processTrainingData(data: TTrainingAndTestingData) {
  console.log("Training worker has started");

  try {
    const {
        trimmedVerses,
        wordAlignerModel
    } = await createTrainedWordAlignerModel(data);
    
    self.postMessage({ 
      type: TRAINING_RESULTS,
      message: 'Worker has finished', 
      trainedModel: wordAlignerModel.save(),
      trimmedVerses
    });
  } catch (error) {
    console.log(error);
      //TODO, need to communicate error back to the other side.
    self.postMessage({
      type: TRAINING_RESULTS,
      message: 'There was an error while training the word map.', 
      error: error .toString()
    });
  }
}

// This is the main worker context - add the event listener here
const ctx: Worker = self as any;

ctx.addEventListener('message', (event: { data: { type: string, data: TTrainingAndTestingData }}) => {
  const messageData = event?.data;
  console.log("AlignmentTrainer called with:", event);
  if (messageData?.data && messageData.type === "startTraining") {
    processTrainingData(messageData.data);
  }
});

// Export empty default for worker-loader
export default {} as typeof Worker & (new () => Worker);