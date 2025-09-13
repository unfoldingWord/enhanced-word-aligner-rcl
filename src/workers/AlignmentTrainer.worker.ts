import {TTrainingAndTestingData} from './WorkerComTypes';
import {processTrainingData, START_TRAINING} from './utils/AlignmentTrainerUtils';

// This is the main worker context - add the event listener here
const ctx: Worker = self as any;

ctx.addEventListener('message', (event: { data: { type: string, data: TTrainingAndTestingData }}) => {
  const messageData = event?.data;
  console.log('AlignmentTrainer called with:', event);
  if (messageData?.data) {
      if (messageData.type === START_TRAINING) {
          processTrainingData(ctx, messageData.data);
      } else {
          console.error(`AlignmentTrainer called with unsupported message type ${messageData.type}`);
      }
  } else {
      console.error('AlignmentTrainer called without messageData:', event);
  }
});

// Export empty default for worker-loader
export default {} as typeof Worker & (new () => Worker);