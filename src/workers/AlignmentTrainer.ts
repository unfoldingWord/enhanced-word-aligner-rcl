import { MorphJLBoostWordMap } from "wordmapbooster/dist/boostwordmap_tools";
import wordmapLexer, { Token } from "wordmap-lexer";
import { Alignment, Ngram } from "wordmap";
import { TTrainingAndTestingData } from "./WorkerComTypes";
import { updateTokenLocations } from "wordmapbooster/dist/wordmap_tools";

/**
 * Creates and trains a word alignment model
 * @param data - The training and testing data
 * @returns Promise that resolves to the trained MorphJLBoostWordMap model
 */
export async function createTrainedWordAlignerModel(data: TTrainingAndTestingData): Promise<MorphJLBoostWordMap> {
  // Convert the data into the structure which the training model expects.
  const sourceVersesTokenized: { [reference: string]: Token[] } = {};
  const targetVersesTokenized: { [reference: string]: Token[] } = {};
  const alignments: { [reference: string]: Alignment[] } = {};
  
  Object.entries(data.alignments).forEach(([reference, training_data]) => {
    sourceVersesTokenized[reference] = training_data.sourceVerse.map(n => new Token(n));
    targetVersesTokenized[reference] = training_data.targetVerse.map(n => new Token(n));
    updateTokenLocations(sourceVersesTokenized[reference]);
    updateTokenLocations(targetVersesTokenized[reference]);

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
    sourceCorpusTokenized[reference] = training_data.sourceTokens.map(n => new Token(n));
    targetCorpusTokenized[reference] = training_data.targetTokens.map(n => new Token(n));
    updateTokenLocations(sourceCorpusTokenized[reference]);
    updateTokenLocations(targetCorpusTokenized[reference]);
  });

  // Create the training object.
  // There are several different word map classes,
  // and there are different hyper parameters which can be passed into it as well.
  const wordAlignerModel = new MorphJLBoostWordMap({ 
    targetNgramLength: 5, 
    warnings: false, 
    forceOccurrenceOrder: false, 
    train_steps: 1000 
  });
  
  wordAlignerModel.appendKeyedCorpusTokens(sourceCorpusTokenized, targetCorpusTokenized);
  // Do a test to see if adding the alignment stuff as corpus as well helps.
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

self.addEventListener('message', (event: { data: TTrainingAndTestingData }) => {
  processTrainingData(event.data);
});