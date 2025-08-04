
import { MorphJLBoostWordMap, updateTokenLocations } from "wordmapbooster";
import wordmapLexer, { Token } from "wordmap-lexer";
import { Alignment, Ngram } from "wordmap";
import { TTrainingAndTestingData } from "./WorkerComTypes";

/**
 * Calculates the complexity of a verse based on the lengths of the source and target text.
 *
 * @param {number} sourceLength - The length of the source text.
 * @param {number} targetLength - The length of the target text.
 * @return {number} The calculated complexity as a numeric value.
 */
function getComplexityOfVerse(sourceLength: number, targetLength: number): number {
    const totalLength = sourceLength + targetLength + sourceLength * targetLength;
    return totalLength;
}

/**
 * Creates and trains a word alignment model
 * @param data - The training and testing data
 * @returns Promise that resolves to the trained MorphJLBoostWordMap model
 */
export async function createTrainedWordAlignerModel(data: TTrainingAndTestingData): Promise<MorphJLBoostWordMap> {
  const maxComplexity = 300000;
    // Convert the data into the structure which the training model expects.
  const sourceVersesTokenized: { [reference: string]: Token[] } = {};
  const targetVersesTokenized: { [reference: string]: Token[] } = {};
  const alignments: { [reference: string]: Alignment[] } = {};
  let alignedCount = 0;
  let alignedVerseCount = 0;
  let unalignedVerseCount = 0;
  let alignedComplexityCount = 0;
  let unalignedComplexityCount = 0;

 Object.entries(data.alignments).forEach(([reference, training_data]) => {
   const tokenizedSourceVerse = training_data.sourceVerse.map(n => new Token(n));
   sourceVersesTokenized[reference] = tokenizedSourceVerse;
   const tokenizedTargetVerse = training_data.targetVerse.map(n => new Token(n));
   targetVersesTokenized[reference] = tokenizedTargetVerse;
   updateTokenLocations(sourceVersesTokenized[reference]);
   updateTokenLocations(targetVersesTokenized[reference]);

   alignedVerseCount++;
   alignedCount += training_data.alignments.length
   alignedComplexityCount += getComplexityOfVerse(tokenizedSourceVerse.length, tokenizedTargetVerse.length);
    
   alignments[reference] = training_data.alignments.map(alignment => 
     new Alignment(
       new Ngram(alignment.sourceNgram.map(n => new Token(n))), 
       new Ngram(alignment.targetNgram.map(n => new Token(n)))
     )
   );
  });

  const sourceCorpusTokenized: { [reference: string]: Token[] } = {};
  const targetCorpusTokenized: { [reference: string]: Token[] } = {};
  
  Object.entries(data.corpus).forEach(([reference, training_data]) => {
    const tokenizedSourceVerse = training_data.sourceTokens.map(n => new Token(n));
    sourceCorpusTokenized[reference] = tokenizedSourceVerse;
    const tokenizedTargetVerse = training_data.targetTokens.map(n => new Token(n));
    targetCorpusTokenized[reference] = tokenizedTargetVerse;
    updateTokenLocations(sourceCorpusTokenized[reference]);
    updateTokenLocations(targetCorpusTokenized[reference]);

    unalignedVerseCount++;
    unalignedComplexityCount += getComplexityOfVerse(tokenizedSourceVerse.length, tokenizedTargetVerse.length);
  });

  console.log(`createTrainedWordAlignerModel: total alignments: ${alignedCount}`);
  console.log(`createTrainedWordAlignerModel: aligned verses: ${alignedVerseCount}`);
  console.log(`createTrainedWordAlignerModel: unaligned verses: ${unalignedVerseCount}`);
  console.log(`createTrainedWordAlignerModel: aligned verses complexity: ${alignedComplexityCount}`);
  console.log(`createTrainedWordAlignerModel: unaligned verses complexity: ${unalignedComplexityCount}`);
    
  // Create the training object.
  // There are several different word map classes,
  // and there are different hyper parameters which can be passed into it as well.
  const wordAlignerModel = new MorphJLBoostWordMap({ 
    targetNgramLength: 5, 
    warnings: false, 
    forceOccurrenceOrder: false, 
    train_steps: 1000 
  });
  
  if (alignedComplexityCount + unalignedComplexityCount < maxComplexity) {
      wordAlignerModel.appendKeyedCorpusTokens(sourceCorpusTokenized, targetCorpusTokenized);

      // Do a test to see if adding the alignment stuff as corpus as well helps.
      wordAlignerModel.appendKeyedCorpusTokens(sourceVersesTokenized, targetVersesTokenized);      
  } else if (alignedComplexityCount > maxComplexity) {
      console.warn("The corpus is too complex to train the word map.  The corpus complexity is:", alignedComplexityCount);
  }

  wordAlignerModel.appendKeyedCorpusTokens(sourceVersesTokenized, targetVersesTokenized);

  // Train the model and return it
  await wordAlignerModel.add_alignments_2(sourceVersesTokenized, targetVersesTokenized, alignments);
  
  return wordAlignerModel;
}

/**
 * Processes the training data and performs word alignment training sending results back to main thread
 * @param data - The training and testing data received from the main thread
 */
async function processTrainingData(data: TTrainingAndTestingData) {
  console.log("Training worker has started");

  try {
    const wordAlignerModel = await createTrainedWordAlignerModel(data);
    
    self.postMessage({ 
      message: 'Worker has finished', 
      trainedModel: wordAlignerModel.save() 
    });
  } catch (error) {
    console.log(error);
      //TODO, need to communicate error back to the other side.
      self.postMessage({ 
      message: 'There was an error while training the word map.', 
      error: error 
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