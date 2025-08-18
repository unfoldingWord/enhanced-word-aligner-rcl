import { TSourceTargetAlignment, TWord } from "word-aligner-rcl";
import {ContextId} from "@/common/classes";
import {MorphJLBoostWordMap} from "wordmapbooster";


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
    contextId?: ContextId;
    maxComplexity?: number;
    sourceLanguageId?: string;
    targetLanguageId?: string;
}

export interface TTestingWorkerData{
    data: TTrainingAndTestingData;
    serializedModel: {[key: string]: any};
}

export interface TTrainedWordAlignerModelResults {
    contextId: ContextId;
    maxComplexity: number;
    sourceLanguageId: string;
    targetLanguageId: string;
    trimmedVerses: number;
    wordAlignerModel: MorphJLBoostWordMap;
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
    type: string;
    message: string;
    trainedModel: TWordAlignerModelData;
    contextId: ContextId;
    maxComplexity: number;
    sourceLanguageId: string;
    targetLanguageId: string;
    trimmedVerses: number;
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