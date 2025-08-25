import { MorphJLBoostWordMap, updateTokenLocations } from "wordmapbooster";
import { Token } from "wordmap-lexer";
import { Alignment, Ngram } from "wordmap";
import {TTrainedWordAlignerModelResults, TTrainingAndTestingData} from "../WorkerComTypes";
import {ContextId, translationMemoryType} from "@/common/classes";
import {DEFAULT_MAX_COMPLEXITY} from "@/common/constants";

enum ReduceType {
    anything,
    otherBook,
    otherChapter,
}

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
    maxComplexity: number;
    keyCount: number;
    keys: string[];
    sourceVersesTokenized: { [key: string]: Token[] };
    targetVersesTokenized: { [key: string]: Token[] };
    alignments: { [key: string]: Alignment[] };
    trimmedVerseCount: number;
    contextId: ContextId;
    reduceType: ReduceType;
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
 * @param {RemoveComplexityParams} params - Parameters object containing all necessary data for complexity reduction
 * @param {number} params.alignedComplexityCount - The current total complexity count of aligned data.
 * @param {number} params.maxComplexity - The maximum allowable aligned complexity count.
 * @param {number} params.keyCount - The total number of keys in the alignment data.
 * @param {string[]} params.keys - An array of keys representing verses or alignment entries.
 * @param {{ [key: string]: Token[] }} params.sourceVersesTokenized - A mapping of source verses to their tokenized content.
 * @param {{ [key: string]: Token[] }} params.targetVersesTokenized - A mapping of target verses to their tokenized content.
 * @param {{ [key: string]: Alignment[] }} params.alignments - A mapping of keys to their respective alignment data.
 * @param {number} params.trimmedVerseCount - Count of verses that have been trimmed or removed.
 * @param {ContextId} params.contextId - The context identifier associated with the alignment operations.
 * @param {ReduceType} params.reduceType - A parameter to define the type or strategy for reducing complexity.
 * @return {RemoveComplexityResult} Object containing updated metrics about complexity reduction results
 */
export function removeComplexity({
    alignedComplexityCount,
    maxComplexity,
    keyCount,
    keys,
    sourceVersesTokenized,
    targetVersesTokenized,
    alignments,
    trimmedVerseCount,
    contextId,
    reduceType,
}: RemoveComplexityParams): RemoveComplexityResult {
    const deletedTargetVerses: { [key: string]: Token[] } = {};
    const deletedSourceVerses: { [key: string]: Token[] } = {};
    let toKeep: string = '';
    const bookId = contextId?.reference?.bookId;
    if (reduceType === ReduceType.otherBook) {
        toKeep = `[${contextId?.bibleId}] ${bookId} `;
        console.log(`removeComplexity - book toKeep: ${toKeep}`);
    } else if (reduceType === ReduceType.otherChapter) {
        toKeep = `[${contextId?.bibleId}] ${bookId} ${contextId?.reference?.chapter}:`;
    }
    let currentIndex = -1;
    const doSequentialOrder = reduceType === ReduceType.otherBook;

    while (alignedComplexityCount > maxComplexity) {
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
        delete alignments[key]

        trimmedVerseCount++;
        
        if (doSequentialOrder) {
            currentIndex--; // backup since we removed item for keys
        }
    }
    return {
        alignedComplexityCount,
        deletedSourceVerses,
        deletedTargetVerses,
        trimmedVerseCount,
    };
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
 * @return {{alignedComplexityCount: number, trimmedVerses: number}} An object containing the updated aligned complexity count and the number of trimmed verses.
 */
export function addAlignmentCorpus(alignedComplexityCount: number, unalignedComplexityCount: number, maxComplexity: number, wordAlignerModel: MorphJLBoostWordMap, sourceCorpusTokenized: {
    [p: string]: Token[]
 }, targetCorpusTokenized: { [p: string]: Token[] }, sourceVersesTokenized: {
    [p: string]: Token[]
 }, targetVersesTokenized: { [p: string]: Token[] }, alignments: { [p: string]: Alignment[] }
 , contextId: ContextId) {
    let trimmedVerseCount = 0;
    let deletedBookTargetVerses: { [key: string]: Token[] } = {};
    let deletedBookSourceVerses: { [key: string]: Token[] } = {};

    if (alignedComplexityCount + unalignedComplexityCount < maxComplexity) {
        wordAlignerModel.appendKeyedCorpusTokens(sourceCorpusTokenized, targetCorpusTokenized);

        // Do a test to see if adding the alignment stuff as corpus as well helps.
        wordAlignerModel.appendKeyedCorpusTokens(sourceVersesTokenized, targetVersesTokenized);
    } else if (alignedComplexityCount > maxComplexity) {
        console.warn("The corpus is too complex to train the word map.  Trimming.  The corpus complexity is:", alignedComplexityCount);
        const keys = Object.keys(targetVersesTokenized)
        let keyCount = keys.length;
        let removedVersesFromBook = 0;

        // first remove from other books
        console.log(`reducing complexity by removing alignments from other books`)
        const removeComplexityParams = {
            alignedComplexityCount,
            maxComplexity,
            keyCount,
            keys,
            sourceVersesTokenized,
            targetVersesTokenized,
            alignments,
            trimmedVerseCount,
            contextId,
            reduceType: ReduceType.otherBook,
        }
        let __ret = removeComplexity(removeComplexityParams);
        alignedComplexityCount = __ret.alignedComplexityCount;
        let changed = __ret.trimmedVerseCount - trimmedVerseCount;
        console.log(`Removed ${changed} verses from other books, complexity now ${alignedComplexityCount}`);
        trimmedVerseCount = __ret.trimmedVerseCount;

        // second remove from other chapters
        console.log(`reducing complexity by removing alignments from other chapters`)
        removeComplexityParams.reduceType = ReduceType.otherChapter
        removeComplexityParams.trimmedVerseCount = trimmedVerseCount;
        removeComplexityParams.alignedComplexityCount = alignedComplexityCount;
        __ret = removeComplexity(removeComplexityParams);
        alignedComplexityCount = __ret.alignedComplexityCount;
        changed = __ret.trimmedVerseCount - trimmedVerseCount;
        removedVersesFromBook = changed;
        console.log(`Removed ${changed} verses from other chapters, complexity now ${alignedComplexityCount}`);
        if (changed > 0) {
            deletedBookTargetVerses = __ret.deletedTargetVerses
            deletedBookSourceVerses = __ret.deletedSourceVerses
        }
        trimmedVerseCount = __ret.trimmedVerseCount;

        // finally just remove random
        console.log(`reducing complexity by removing alignments at random`)
        removeComplexityParams.reduceType = ReduceType.otherChapter
        removeComplexityParams.trimmedVerseCount = trimmedVerseCount;
        removeComplexityParams.alignedComplexityCount = alignedComplexityCount;
        __ret = removeComplexity(removeComplexityParams);
        alignedComplexityCount = __ret.alignedComplexityCount;
        changed = __ret.trimmedVerseCount - trimmedVerseCount;
        console.log(`Removed ${changed} verses at random, complexity now ${alignedComplexityCount}`);
        if (changed > 0) {
            deletedBookTargetVerses = {...deletedBookTargetVerses, ...__ret.deletedTargetVerses}
            deletedBookSourceVerses = {...deletedBookSourceVerses, ...__ret.deletedSourceVerses}
        }
        trimmedVerseCount = __ret.trimmedVerseCount;

        console.log(`Trimmed ${trimmedVerseCount} verses, complexity now ${alignedComplexityCount}`);
        console.log( `Removed verses from this Books: ${removedVersesFromBook}`)
        
        const shown: string[] = []
        const targetKeys = Object.keys(targetVersesTokenized)
        targetKeys.forEach(key => {
            const book_chapter = key.split(':')[0];
            if (!shown.includes(book_chapter)) {
                shown.push(book_chapter);
                console.log(`Training data includes ${book_chapter}`)
            }
        })

        wordAlignerModel.appendKeyedCorpusTokens(sourceVersesTokenized, targetVersesTokenized);
    }
    return {
        alignedComplexityCount,
        trimmedVerseCount,
        deletedBookTargetVerses,
        deletedBookSourceVerses,
    };
}

/**
 * Creates and trains a word alignment model using the provided training data.
 * Processes alignment and corpus data, applies complexity limitations, and trains the model.
 *
 * @param {TTrainingAndTestingData} data - The training and testing data containing alignments, corpus, contextId, and maxComplexity options.
 * @returns {Promise<{trimmedVerses: number, wordAlignerModel: MorphJLBoostWordMap}>} Promise that resolves to an object containing the number of trimmed verses and the trained word alignment model.
 */
export async function createTrainedWordAlignerModel(data: TTrainingAndTestingData): Promise<TTrainedWordAlignerModelResults> {
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
  const wordAlignerModel = new MorphJLBoostWordMap({ 
    targetNgramLength: 5, 
    warnings: false, 
    forceOccurrenceOrder: false, 
    train_steps: 1000 
  });
  
  const {
      trimmedVerseCount,
      deletedBookTargetVerses,
      deletedBookSourceVerses,
  } = addAlignmentCorpus(alignedComplexityCount, unalignedComplexityCount, maxComplexity,
      wordAlignerModel, sourceCorpusTokenized, targetCorpusTokenized, sourceVersesTokenized,
      targetVersesTokenized, alignments, data.contextId);

  // Train the model and return it
  await wordAlignerModel.add_alignments_2(sourceVersesTokenized, targetVersesTokenized, alignments);
  
  return {
      contextId: data.contextId,
      maxComplexity,
      sourceLanguageId: data.sourceLanguageId,
      targetLanguageId: data.targetLanguageId,
      trimmedVerses: trimmedVerseCount,
      wordAlignerModel
  };
}

/**
 * Creates a translation memory object containing source and target USFM data for a book
 *
 * @param {string} bookId - The identifier for the book
 * @param {string} originalBibleBookUsfm - The USFM content for the original (source) Bible book
 * @param {string} targetBibleBookUsfm - The USFM content for the target Bible book
 * @returns {translationMemoryType} A translation memory object with sourceUsfms and targetUsfms
 */
export function makeTranslationMemory(bookId: string, originalBibleBookUsfm: string, targetBibleBookUsfm: string): translationMemoryType {
    const memory: translationMemoryType = {
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
