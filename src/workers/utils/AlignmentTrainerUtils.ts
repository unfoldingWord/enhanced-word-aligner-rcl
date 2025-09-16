import { MorphJLBoostWordMap, updateTokenLocations } from 'uw-wordmapbooster';
import { Token } from 'wordmap-lexer';
import { Alignment, Ngram } from 'wordmap';
import {
    TAlignmentMemoryVerseCounts,
    TAlignmentSuggestionsConfig,
    TAlignmentVerseCounts,
    TTrainedWordAlignerModelResults,
    TTrainedWordAlignerModelWorkerResults,
    TTrainingAndTestingData,
    TVerseCounts,
} from '../WorkerComTypes';
import {ContextId, TTranslationMemoryType} from '@/common/classes';
import {DEFAULT_MAX_COMPLEXITY} from '@/common/constants';

enum ReduceType {
    anything,
    otherBook,
    otherChapter,
    otherBooksAll, // remove all other books regardless of complexity
}

export const TRAINING_RESULTS = 'trainingResults';
export const TRAINING_STATUS = 'trainingStatus';
export const START_TRAINING = 'startTraining';

let lastProgress = 0;

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

interface RemoveComplexityParams {
    alignedComplexityCount: number;
    alignments: { [key: string]: Alignment[] };
    contextId: ContextId;
    deletedAlignments: { [key: string]: Alignment[] };
    deletedTargetVerses: { [key: string]: Token[] };
    deletedSourceVerses: { [key: string]: Token[] };
    keyCount: number;
    keys: string[];
    maxComplexity: number;
    minTrainingVerseCount: number;
    reduceType: ReduceType;
    sourceVersesTokenized: { [key: string]: Token[] };
    targetVersesTokenized: { [key: string]: Token[] };
    trimmedVerseCount: number;
}

interface RemoveComplexityResult {
    alignedComplexityCount: number;
    deletedSourceVerses: { [key: string]: Token[] };
    deletedTargetVerses: { [key: string]: Token[] };
    trimmedVerseCount: number;
}

/**
 * Reduces the complexity of alignment data by selectively removing entries
 * until the aligned complexity count is below or equal to the maximum allowed complexity.
 *
 * @param {RemoveComplexityParams} props - Parameters object containing all necessary data for complexity reduction
 * @param {number} props.alignedComplexityCount - The current total complexity count of aligned data.
 * @param {number} props.maxComplexity - The maximum allowable aligned complexity count.
 * @param {number} props.keyCount - The total number of keys in the alignment data.
 * @param {string[]} props.keys - An array of keys representing verses or alignment entries.
 * @param {{ [key: string]: Token[] }} props.sourceVersesTokenized - A mapping of source verses to their tokenized content.
 * @param {{ [key: string]: Token[] }} props.targetVersesTokenized - A mapping of target verses to their tokenized content.
 * @param {{ [key: string]: Alignment[] }} props.alignments - A mapping of keys to their respective alignment data.
 * @param {number} props.trimmedVerseCount - Count of verses that have been trimmed or removed.
 * @param {ContextId} props.contextId - The context identifier associated with the alignment operations.
 * @param {ReduceType} props.reduceType - A parameter to define the type or strategy for reducing complexity.
 */
export function removeComplexity(props: RemoveComplexityParams) {
    let {
        alignedComplexityCount,
        alignments,
        contextId,
        deletedAlignments,
        deletedSourceVerses,
        deletedTargetVerses,
        keyCount,
        keys,
        maxComplexity,
        minTrainingVerseCount,
        reduceType,
        sourceVersesTokenized,
        targetVersesTokenized,
        trimmedVerseCount,
    } = props;
    console.log(`removeComplexity - reduceType: ${reduceType}`);
    let toKeep: string = '';
    let doSequentialOrder = false
    const bookId = contextId?.reference?.bookId;
    if ((reduceType === ReduceType.otherBook) || (reduceType === ReduceType.otherBooksAll)) {
        doSequentialOrder = true
        toKeep = `${bookId} `;
        console.log(`removeComplexity - book toKeep: ${toKeep}`);
    } else if (reduceType === ReduceType.otherChapter) {
        toKeep = `${bookId} ${contextId?.reference?.chapter}:`;
        console.log(`removeComplexity - chapter toKeep: ${toKeep}`);
    }
    let currentIndex = -1;

    const maxComplexity_ = (reduceType === ReduceType.otherBooksAll) ? -1 : maxComplexity;
    while (alignedComplexityCount > maxComplexity_) { // remove verses if we exceed the complexity count to reduce memory usage and training time.
        if (!doSequentialOrder) {
            const randomIndex = Math.floor(Math.random() * keyCount);
            currentIndex = randomIndex
        } else { // in other cases do in order
            currentIndex++;
            if (currentIndex >= keyCount) {
                break;
            }       
        }

        const key = keys[currentIndex];
        
        if (toKeep) {
            if (!key) { // skip over what we want to keep
                console.log(`removeComplexity - currentIndex ${currentIndex}, key is null, skipping`, key);
                continue;
            }
            if (key?.startsWith(toKeep)) { // skip over what we want to keep
                continue;
            }
        }
        
        keyCount--;
        const complexityCount = getComplexityOfVerse(sourceVersesTokenized[key].length, targetVersesTokenized[key].length);

        alignedComplexityCount -= complexityCount;

        keys.splice(currentIndex, 1);
        deletedSourceVerses[key] = sourceVersesTokenized[key];
        delete sourceVersesTokenized[key]
        deletedTargetVerses[key] = targetVersesTokenized[key];
        delete targetVersesTokenized[key]
        deletedAlignments[key] = alignments[key]
        delete alignments[key]

        trimmedVerseCount++;
        
        if (doSequentialOrder) {
            currentIndex--; // backup since we removed item for keys
        }
    }

    if (reduceType === ReduceType.otherBooksAll) {
        let restoredVerseCount = 0;
        const deletedKeys = Object.keys(deletedAlignments);
        // put back deleted verses to meet the minimum aligned verse count
        while ((deletedKeys.length > 0) && (keys.length < minTrainingVerseCount)) {
            const key = deletedKeys.pop()
            keys.push(key);
            sourceVersesTokenized[key] = deletedSourceVerses[key]
            delete deletedSourceVerses[key]
            targetVersesTokenized[key] = deletedTargetVerses[key]
            delete deletedTargetVerses[key]
            alignments[key] = deletedAlignments[key]
            delete deletedTargetVerses[key]
            restoredVerseCount++
            trimmedVerseCount--
            keyCount++

            // put back in the complexity
            const complexityCount = getComplexityOfVerse(sourceVersesTokenized[key].length, targetVersesTokenized[key].length);
            alignedComplexityCount+= complexityCount;
        }
        console.log(`restoredVerseCount = ${restoredVerseCount}`)
    }
    
    // update prop values
    props.alignedComplexityCount = alignedComplexityCount;
    props.keyCount = keyCount;
    props.keys = keys;
    props.trimmedVerseCount = trimmedVerseCount;
}

/**
 * Processes alignment data to calculate the verse count of chapters and books,
 * mapping chapters to the number of their occurrences and books to their chapter counts.
 *
 * @param {Object} alignmentData - An object where keys represent book and chapter references and values hold alignment data.
 * @param {string} subject - The subject string for which alignment data is being processed.
 * @return {TAlignmentVerseCounts} An object consisting of two properties:
 * 1. booksCount: A mapping of book identifiers to their respective verse counts.
 * 2. chaptersCount: A mapping of book and chapter references to their verse counts.
 */
function getBookChapterData(alignmentData: { [p: string]: any }, subject: string):TAlignmentVerseCounts {
    const chaptersCount: { [key: string]: number } = {}
    const booksCount: { [key: string]: number } = {}
    const keys = Object.keys(alignmentData)
    keys.forEach(key => {
        const book_chapter = key.split(':')[0];
        if (!chaptersCount[book_chapter]) {
            chaptersCount[book_chapter] = 1;
            console.log(`'${subject}' includes ${book_chapter}`)
        } else {
            chaptersCount[book_chapter]++;
        }
        const bookId = book_chapter.split(' ')[0];
        if (!booksCount[bookId]) {
            booksCount[bookId] = 1;
        } else {
            booksCount[bookId]++;
        }
    })
    return {
        booksCount,
        chaptersCount,
    }
}

/**
 * Adds alignment corpus by appending tokenized data to the word aligner model. Also limits complexity
 * to prevent memory overflow in worker.
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
 * @param {ContextId} contextId - The context identifier for the alignment operations.
 * @param {TAlignmentSuggestionsConfig|null} config - special configuration settings
 * @param {TVerseCounts|null} currentBookVerseCounts 
 * @return {{alignedComplexityCount: number, trimmedVerses: number}} An object containing the updated aligned complexity count and the number of trimmed verses.
 */
export function addAlignmentCorpus(
    alignedComplexityCount: number,
    unalignedComplexityCount: number,
    maxComplexity: number,
    wordAlignerModel: MorphJLBoostWordMap,
    sourceCorpusTokenized: { [p: string]: Token[] },
    targetCorpusTokenized: { [p: string]: Token[] },
    sourceVersesTokenized: { [p: string]: Token[] },
    targetVersesTokenized: { [p: string]: Token[] },
    alignments: { [p: string]: Alignment[] },
    contextId: ContextId,
    config: TAlignmentSuggestionsConfig|null,
    currentBookVerseCounts: TVerseCounts|null
) {
    let trimmedVerseCount = 0;
    let deletedBookTargetVerses: { [key: string]: Token[] } = {};
    let deletedBookSourceVerses: { [key: string]: Token[] } = {};
    const keys = Object.keys(targetVersesTokenized)
    let keyCount = keys.length;
    let removedVersesFromBook = 0;
    const deletedTargetVerses: { [key: string]: Token[] } = {};
    const deletedSourceVerses: { [key: string]: Token[] } = {};
    const deletedAlignments: { [p: string]: Alignment[] } = {};

    const bookVerseCount = currentBookVerseCounts ? Math.max(currentBookVerseCounts.alignmentVerseCount, currentBookVerseCounts.sourceVerseCount, currentBookVerseCounts.targetVerseCount) : 0
    let minTrainingVerseCount = 0
    if (config?.minTrainingVerseRatio) {
        minTrainingVerseCount = bookVerseCount * config?.minTrainingVerseRatio
        console.log(`minTrainingVerseRatio = ${config?.minTrainingVerseRatio} and minTrainingVerseCount is ${minTrainingVerseCount}`)
    }
    const percentBookAligned = (bookVerseCount > 0) ? currentBookVerseCounts.alignmentCompletedVerseCount / bookVerseCount * 100 : 0

    const removeComplexityParams = {
        alignedComplexityCount,
        alignments,
        contextId,
        deletedAlignments,
        deletedSourceVerses,
        deletedTargetVerses,
        keyCount,
        keys,
        reduceType: ReduceType.otherBook,
        maxComplexity,
        minTrainingVerseCount,
        sourceVersesTokenized,
        targetVersesTokenized,
        trimmedVerseCount,
    }
    let singleBookTrimCount = 0
    let currentBookTrimCount = 0

    if (config.trainOnlyOnCurrentBook) {
        // next remove all from other books
        console.log(`removing corpus from all other books`)
        removeComplexityParams.reduceType = ReduceType.otherBooksAll;
        removeComplexity(removeComplexityParams);
        alignedComplexityCount = removeComplexityParams.alignedComplexityCount;
        let changed = removeComplexityParams.trimmedVerseCount - trimmedVerseCount;
        console.log(`Removed ${changed} verses from other books, complexity now ${alignedComplexityCount}`);
        singleBookTrimCount = changed;
        trimmedVerseCount = removeComplexityParams.trimmedVerseCount;
    }

    if (alignedComplexityCount + unalignedComplexityCount < maxComplexity) {
        console.log('The corpus is not too complex to train the word map.The corpus complexity is:', alignedComplexityCount);
        wordAlignerModel.appendKeyedCorpusTokens(sourceCorpusTokenized, targetCorpusTokenized);

        // Do a test to see if adding the alignment stuff as corpus as well helps.
        wordAlignerModel.appendKeyedCorpusTokens(sourceVersesTokenized, targetVersesTokenized);
    } else if (alignedComplexityCount > maxComplexity) {
        console.warn('The corpus is too complex to train the word map.  Trimming. The corpus complexity is:', alignedComplexityCount);

        // remove from other books
        console.log(`reducing training complexity by removing corpus from other books`)
        removeComplexityParams.reduceType = ReduceType.otherBook;
        removeComplexity(removeComplexityParams);
        alignedComplexityCount = removeComplexityParams.alignedComplexityCount;
        let changed = removeComplexityParams.trimmedVerseCount - trimmedVerseCount;
        console.log(`Removed ${changed} verses from other books, complexity now ${alignedComplexityCount}`);
        trimmedVerseCount = removeComplexityParams.trimmedVerseCount = 0; // ignore removing alignments from other books, optional data

        // next remove from other chapters
        console.log(`reducing training complexity by removing corpus from other chapters`)
        removeComplexityParams.reduceType = ReduceType.otherChapter
        removeComplexity(removeComplexityParams);
        alignedComplexityCount = removeComplexityParams.alignedComplexityCount;
        changed = removeComplexityParams.trimmedVerseCount - trimmedVerseCount;
        console.log(`Removed ${changed} verses from other chapters, complexity now ${alignedComplexityCount}`);
        trimmedVerseCount = removeComplexityParams.trimmedVerseCount;

        // finally just remove random
        console.log(`reducing training complexity by removing corpus at random`)
        removeComplexityParams.reduceType = ReduceType.anything
        removeComplexity(removeComplexityParams);
        alignedComplexityCount = removeComplexityParams.alignedComplexityCount;
        changed = removeComplexityParams.trimmedVerseCount - trimmedVerseCount;
        console.log(`Removed ${changed} verses from current book, complexity now ${alignedComplexityCount}`);
        trimmedVerseCount = removeComplexityParams.trimmedVerseCount;

        console.log(`Trimmed ${trimmedVerseCount} verses, complexity now ${alignedComplexityCount}`);
        console.log( `Removed verses from this Books: ${removedVersesFromBook}`)
        
        wordAlignerModel.appendKeyedCorpusTokens(sourceVersesTokenized, targetVersesTokenized);
    }

    // if (singleBookTrimCount > 0) {
    //     trimmedVerseCount -= singleBookTrimCount; // don't count those removed from other books when running single book training
    //     console.log(`Excluding singleBookTrimCount of ${singleBookTrimCount} from trimmedVerseCount, now ${trimmedVerseCount}`);
    // }

    const trainedAlignmentMemoryVerseCounts = getBookChapterData(targetVersesTokenized, 'Training Data');

    return {
        alignedComplexityCount,
        deletedAlignments,
        deletedBookTargetVerses,
        deletedBookSourceVerses,
        percentBookAligned,
        trainedAlignmentMemoryVerseCounts,
        trimmedVerseCount,
    };
}

/**
 * runs within a worker, creates and trains a word aligner model using the provided data and parameters.
 * Processes alignment and corpus data, applies complexity limitations, and trains the model.
 *
 * @param {Worker} worker - A worker instance used for processing the training task.
 * @param {TTrainingAndTestingData} data - The training and testing data including alignments, corpus, and context details.
 * @param {(step: number, trainingSteps: number, current_loss: number) => void} progress_callback - A callback function invoked during training to report progress, training steps, and current loss.
 * @return {Promise<TTrainedWordAlignerModelResults>} A promise that resolves to the results of the trained word aligner model, including context ID, training details, and the trained model instance.
 */
export async function createTrainedWordAlignerModel(worker: Worker, data: TTrainingAndTestingData, progress_callback: (step: number, trainingSteps, current_loss: number) => void): Promise<TTrainedWordAlignerModelResults> {
  const maxComplexity = data.maxComplexity || DEFAULT_MAX_COMPLEXITY;
  // Convert the data into the structure which the training model expects.
  const sourceVersesTokenized: { [reference: string]: Token[] } = {};
  const targetVersesTokenized: { [reference: string]: Token[] } = {};
  const alignments: { [reference: string]: Alignment[] } = {};
  let alignedCount = 0;
  let alignedVerseCount = 0;
  let unalignedVerseCount = 0;
  let alignedComplexityCount = 0;
  let unalignedComplexityCount = 0;

  const alignmentMemoryVerseCounts:TAlignmentMemoryVerseCounts = {
      untrained: null,
      trained: null,
  }
  
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
  console.log(`createTrainedWordAlignerModel: max complexity: ${maxComplexity}`);
    
  // Create the training object.
  // There are several different word map classes,
  // and there are different hyper parameters which can be passed into it as well.
    const wordMapOptions = {
        forceOccurrenceOrder: false,
        nGramWarnings: false,
        progress_callback,
        targetNgramLength: 5,
        train_steps: 1000,
        verbose_training: false,
        warnings: false,
    };
    const wordAlignerModel = new MorphJLBoostWordMap(wordMapOptions);
  
  const {
      deletedAlignments,
      deletedBookTargetVerses,
      deletedBookSourceVerses,
      percentBookAligned,
      trainedAlignmentMemoryVerseCounts,
      trimmedVerseCount,
  } = addAlignmentCorpus(alignedComplexityCount, unalignedComplexityCount, maxComplexity,
      wordAlignerModel, sourceCorpusTokenized, targetCorpusTokenized, sourceVersesTokenized,
      targetVersesTokenized, alignments, data.contextId, data.config, data.currentBookVerseCounts);

  // Train the model and return it
  await wordAlignerModel.add_alignments_2(sourceVersesTokenized, targetVersesTokenized, alignments);

  let keepAllAlignmentMemory = data.config.keepAllAlignmentMemory
  if (!keepAllAlignmentMemory && data.config.keepAllAlignmentMinThreshold) {
      if (percentBookAligned < data.config.keepAllAlignmentMinThreshold) {
          keepAllAlignmentMemory = true
      }
  }

    console.log(`percent Book Aligned ${percentBookAligned}`);
    if (keepAllAlignmentMemory) {
      // TRICKY: EXPERIMENTAL - put removed verses back into translation memory
      // @ts-ignore
      const map: WordMap = wordAlignerModel.wordMap
      let translationMemoryVersesAdded = 0;
      Object.entries(deletedAlignments).forEach(([key, alignment]) => {
          map.appendAlignmentMemory(alignment);
          translationMemoryVersesAdded++;
      })
      alignmentMemoryVerseCounts.untrained = getBookChapterData(deletedAlignments, 'Other Translation Memory');
      console.log(`translation Memory Verses Added back ${translationMemoryVersesAdded}`);
    }

  alignmentMemoryVerseCounts.trained = trainedAlignmentMemoryVerseCounts;

  delete wordMapOptions.progress_callback; // remove the progress callback since it will not pass well.
  return {
      config: data.config,
      contextId: data.contextId,
      currentBookVerseCounts: data.currentBookVerseCounts,
      currentSha: data.currentSha,
      maxComplexity,
      percentBookAligned,
      sourceLanguageId: data.sourceLanguageId,
      targetLanguageId: data.targetLanguageId,
      trimmedVerses: trimmedVerseCount,
      wordAlignerModel,
      wordMapOptions,
      trainingInfo: {
          alignmentMemoryVerseCounts
      }
  };
}

/**
 * Creates a translation memory object containing source and target USFM data for a book
 *
 * @param {string} bookId - The identifier for the book
 * @param {string} originalBibleBookUsfm - The USFM content for the original (source) Bible book
 * @param {string} targetBibleBookUsfm - The USFM content for the target Bible book
 * @returns {TTranslationMemoryType} A translation memory object with sourceUsfms and targetUsfms
 */
export function makeTranslationMemory(bookId: string, originalBibleBookUsfm: string, targetBibleBookUsfm: string): TTranslationMemoryType {
    const memory: TTranslationMemoryType = {
        sourceUsfms: {},
        targetUsfms: {}
    };

    if (bookId) {
        if (originalBibleBookUsfm) {
            memory.sourceUsfms = {
                [bookId]: originalBibleBookUsfm
            };
        }
        if (targetBibleBookUsfm) {
            memory.targetUsfms = {
                [bookId]: targetBibleBookUsfm
            };
        }
    }

    return memory;
}

/**
 * Business Logic to processes training data within a worker thread. Sends training progress
 * updates and communicates results or errors back to the worker.
 *
 * @param {Worker} worker - The worker instance responsible for handling the training process.
 * @param {TTrainingAndTestingData} data - The training and testing data to be processed.
 * @return {Promise<void>} A promise that resolves when the training process completes.
 */
export async function processTrainingData(worker: Worker, data: TTrainingAndTestingData) {
    const contextId = data.contextId;
    console.log('Training worker has started, contextId', contextId);
    worker.postMessage({ type: 'log', message: 'Training worker has started' });

    /**
     * Callback for training:
     * Tracks and reports the progress of a training process by calculating the percentage completed, then sends this data for further handling.
     *
     * @param {number} step - The current step in the training process.
     * @param {number} trainingSteps - The total number of steps in the training process.
     * @param {number} current_loss - The current loss value at the given step.
     * @return {void} This method does not return a value.
     */
    function progress_callback(step: number, trainingSteps, current_loss: number) {
        try {
            const percent_complete = Math.round(step / trainingSteps * 100); // calculate the percent complete as integer
            if (percent_complete !== lastProgress) { // only send the message if the rounded percent has changed
                // console.log(`progress_callback: step ${step} of ${trainingSteps}, loss ${current_loss}, percent_complete ${percent_complete}%`);
                lastProgress = percent_complete;
                const workerStatus = {
                    type: TRAINING_STATUS,
                    contextId,
                    current_loss,
                    percent_complete,
                    step,
                    trainingSteps
                }
                worker.postMessage(workerStatus);
            }
        } catch (error) {
            console.log(error);
        }
    }


    try {
        const trainingModelResults = await createTrainedWordAlignerModel(worker, data, progress_callback);
        const trainedModel = trainingModelResults.wordAlignerModel.save();
        delete trainingModelResults.wordAlignerModel; // trim the model to save memory
        const workerResults: TTrainedWordAlignerModelWorkerResults = {
            type: TRAINING_RESULTS,
            message: 'Worker has finished',
            trainedModel,
            ...trainingModelResults,
        }

        worker.postMessage(workerResults);
    } catch (error) {
        console.log(error);
        //TODO, need to communicate error back to the other side.
        worker.postMessage({
            type: TRAINING_RESULTS,
            message: 'There was an error while training the word map.',
            error: error.toString()
        });
    }
}
