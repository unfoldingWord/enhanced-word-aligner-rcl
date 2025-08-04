
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
 * Adds alignment corpus by appending tokenized data to the word aligner model. Also limits complexity
 *  to prevent memory overflow in worker.
 *
 * @param {number} alignedComplexityCount - The total complexity count of aligned verses in the corpus.
 * @param {number} unalignedComplexityCount - The total complexity count of unaligned verses in the corpus.
 * @param {number} maxComplexity - The maximum allowable complexity for the alignment corpus.
 * @param {MorphJLBoostWordMap} wordAlignerModel - The word alignment model used for aligning tokens.
 * @param {{[p: string]: Token[]}} sourceCorpusTokenized - The tokenized source corpus.
 * @param {{[p: string]: Token[]}} targetCorpusTokenized - The tokenized target corpus.
 * @param {{[p: string]: Token[]}} sourceVersesTokenized - The tokenized source verses.
 * @param {{[p: string]: Token[]}} targetVersesTokenized - The tokenized target verses.
 * @param {{[p: string]: Alignment[]}} alignments - The alignments associated with the verses.
 * @return {number} - The updated aligned complexity count after the adjustments.
 */
function addAlignmentCorpus(alignedComplexityCount: number, unalignedComplexityCount: number, maxComplexity, wordAlignerModel: MorphJLBoostWordMap, sourceCorpusTokenized: {
    [p: string]: Token[]
}, targetCorpusTokenized: { [p: string]: Token[] }, sourceVersesTokenized: {
    [p: string]: Token[]
}, targetVersesTokenized: { [p: string]: Token[] }, alignments: { [p: string]: Alignment[] }) {
    if (alignedComplexityCount + unalignedComplexityCount < maxComplexity) {
        wordAlignerModel.appendKeyedCorpusTokens(sourceCorpusTokenized, targetCorpusTokenized);

        // Do a test to see if adding the alignment stuff as corpus as well helps.
        wordAlignerModel.appendKeyedCorpusTokens(sourceVersesTokenized, targetVersesTokenized);
    } else if (alignedComplexityCount > maxComplexity) {
        console.warn("The corpus is too complex to train the word map.  Trimming.  The corpus complexity is:", alignedComplexityCount);
        const keys = Object.keys(targetVersesTokenized)
        let keyCount = keys.length;
        let trimmedVerses = 0;

        while (alignedComplexityCount > maxComplexity) {
            const randomIndex = Math.floor(Math.random() * keyCount);
            const key = keys[randomIndex];
            keyCount--;
            const complexityCount = getComplexityOfVerse(sourceVersesTokenized[key].length, targetVersesTokenized[key].length);

            alignedComplexityCount -= complexityCount;

            keys.splice(randomIndex, 1);
            delete sourceVersesTokenized[key]
            delete targetVersesTokenized[key]
            delete alignments[key]

            trimmedVerses++;
        }

        console.log(`Trimmed ${trimmedVerses} verses, complexity now ${alignedComplexityCount}`);
    }
    return alignedComplexityCount;
}

/**
 * Creates and trains a word alignment model
 * @param data - The training and testing data
 * @returns Promise that resolves to the trained MorphJLBoostWordMap model
 */
export async function createTrainedWordAlignerModel(data: TTrainingAndTestingData): Promise<MorphJLBoostWordMap> {
  // @ts-ignore
    const maxComplexity = data.maxComplexity || 300000;
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
  
  addAlignmentCorpus(alignedComplexityCount, unalignedComplexityCount, maxComplexity, wordAlignerModel, sourceCorpusTokenized, targetCorpusTokenized, sourceVersesTokenized, targetVersesTokenized, alignments);

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