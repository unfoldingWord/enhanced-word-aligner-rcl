import {TTrainedWordAlignerModelWorkerResults, TTrainingAndTestingData} from "./WorkerComTypes";
import {createTrainedWordAlignerModel} from "./utils/AlignmentTrainerUtils";

const TRAINING_RESULTS = 'trainingResults';
const TRAINING_STATUS = 'trainingStatus';
let lastProgress = 0;

/**
 * Processes the training data and performs word alignment training sending results back to main thread
 * @param data - The training and testing data received from the main thread
 */
async function processTrainingData(data: TTrainingAndTestingData) {
  console.log("Training worker has started");

    function progress_callback(step: number, trainingSteps, current_loss: number) {
        try {
            const percent_complete = Math.round(step / trainingSteps * 100);
            if (percent_complete !== lastProgress) {
                console.log(`progress_callback: step ${step} of ${trainingSteps}, loss ${current_loss}, percent_complete ${percent_complete}%`);
                lastProgress = percent_complete;
                const workerStatus = {
                    type: TRAINING_STATUS,
                    current_loss,
                    percent_complete,
                    step,
                    trainingSteps
                }
                self.postMessage(workerStatus);
            }
        } catch (error) {
            console.log(error);
        }
    }

    try {
    const trainingModelResults = await createTrainedWordAlignerModel(data, progress_callback);
    const trainedModel = trainingModelResults.wordAlignerModel.save();
    delete trainingModelResults.wordAlignerModel; // trim the model to save memory
    const workerResults: TTrainedWordAlignerModelWorkerResults = {
      type: TRAINING_RESULTS,
      message: 'Worker has finished',
      trainedModel,
      ...trainingModelResults,
    }
    
    self.postMessage(workerResults);
  } catch (error) {
    console.log(error);
      //TODO, need to communicate error back to the other side.
    self.postMessage({
      type: TRAINING_RESULTS,
      message: 'There was an error while training the word map.', 
      error: error.toString()
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