import { TSourceTargetAlignment, TWord } from "word-aligner-rcl";
import {ContextId} from "@/common/classes";
import {MorphJLBoostWordMap} from "uw-wordmapbooster";

export interface TVerseCounts {
    alignmentCompletedVerseCount: number;
    alignmentVerseCount: number;
    sourceVerseCount: number;
    targetVerseCount: number;
}

export interface TTrainingAndTestingData {
    alignments: {
        [key: string]: {
            targetVerse: TWord[];
            sourceVerse: TWord[];
            alignments: TSourceTargetAlignment[];
        }
    };
    corpus: {
        [key: string]: {
            sourceTokens: TWord[];
            targetTokens: TWord[];
        }
    };
    config?: TAlignmentSuggestionsConfig;
    contextId?: ContextId;
    maxComplexity?: number;
    sourceLanguageId?: string;
    targetLanguageId?: string;
    currentBookVerseCounts?: TVerseCounts;
}

export interface TTestingWorkerData{
    data: TTrainingAndTestingData;
    serializedModel: {[key: string]: any};
}

export interface TTrainedWordAlignerModelResults {
    config: TAlignmentSuggestionsConfig;
    contextId: ContextId;
    currentBookVerseCounts: TVerseCounts;
    maxComplexity: number;
    percentBookAligned: number;
    sourceLanguageId: string;
    targetLanguageId: string;
    trimmedVerses: number;
    wordAlignerModel: MorphJLBoostWordMap;
    wordMapOptions?: object;
}

export interface TAlignmentTrainingWorkerData {
    worker: Worker;
    contextId: ContextId;
}

/**
 * More specific type if you want to define known properties
 * Based on typical word alignment model serialization
 */
export interface TWordAlignerModelData {
    modelType?: string;
    trainingData?: any;
    parameters?: {
        targetNgramLength?: number;
        warnings?: boolean;
        forceOccurrenceOrder?: boolean;
        train_steps?: number;
        [key: string]: any;
    };
    alignmentMappings?: any;
    vocabulary?: any;
    [key: string]: any; // Allow for additional properties
}

export interface TTrainedWordAlignerModelWorkerResults {
    contextId: ContextId;
    maxComplexity: number;
    message: string;
    sourceLanguageId: string;
    targetLanguageId: string;
    trainedModel: TWordAlignerModelData;
    trimmedVerses: number;
    type: string;
}

export interface TWordAlignmentTestScore{
    num_manual_mappings: number;
    num_suggested_mappings: number;
    num_correct_mappings: number;
    ratio_correct: number;
}

export interface TWordAlignmentTestResults{
    testResults: {[reference: string]: TWordAlignmentTestScore };
    average_ratio_correct: number;
}

export interface TAlignmentSuggestionsConfig {
    doAutoTraining?: boolean; // set true to enable auto training of alignment suggestions
    trainOnlyOnCurrentBook?: boolean; // if true, then training is sped up for small books by just training on alignment memory data for current book
    minTrainingVerseRatio?: number; // if trainOnlyOnCurrentBook, then this is protection for the case that the book is not completely aligned.  If a ratio such as 1.0 is set, then training will use the minimum number of verses for training.  This minimum is calculated by multiplying the number of verses in the book by this ratio
    keepAllAlignmentMemory?: boolean; // EXPERIMENTAL FEATURE - if true, then alignment data not used for training will be added back into wordMap after training.  This should improve alignment vocabulary, but may negatively impact accuracy in the case of fully aligned books.
    keepAllAlignmentMinThreshold?: number; // EXPERIMENTAL FEATURE - if threshold percentage is set (such as value 60), then alignment data not used for training will be added back into wordMap after training, but only if the percentage of book alignment is less than this threshold.  This should improve alignment vocabulary for books not completely aligned
}
