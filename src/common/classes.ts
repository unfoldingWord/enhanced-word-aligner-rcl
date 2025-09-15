import GroupCollection from '@/shared/GroupCollection';
import {TAlignerData, TSourceTargetAlignment, TWord} from 'word-aligner-rcl';
import {Token} from 'wordmap-lexer'
import {Suggestion} from 'wordmap'

export type usfmType = string; // Type definition for USFM content
export type booksUsfmType = { [bibleId: string]: usfmType };
export type TTranslationMemoryType = {
    sourceUsfms: booksUsfmType;
    targetUsfms: booksUsfmType;
};

export interface TTrainingStateChange {
    contextId?: ContextId,
    percentComplete?: number,
    training?: boolean,
    trainingComplete?: boolean,
    trainingFailed?: string,
    translationMemoryLoaded?: {}
}

export type THandleTrainingStateChange = (state: TTrainingStateChange) => void;

export interface TWordAlignerAlignmentResult{
    targetWords: TWord[];
    verseAlignments: TSourceTargetAlignment[];
}

export interface TState{
    aligned: boolean;
    alignerData: TAlignerData;
    reference: TReference;
    sourceLanguage: string;
    targetLanguage: string;
}

interface TActions{
    saveAlignment: ( results: TWordAlignerAlignmentResult | null ) => void;
    cancelAlignment: () => void;
    onAlignmentsChange: ( results: TWordAlignerAlignmentResult) => boolean;
}

export interface TAlignerStatus{
    actions: TActions;
    state: TState;
}

interface WordAlignerDialogProps{
    alignerStatus: TAlignerStatus | null,
    height: number,
    translate: (key:string)=>string,
    suggester: ((sourceSentence: string | Token[], targetSentence: string | Token[], maxSuggestions?: number, manuallyAligned?: Alignment[] ) => Suggestion[])|null
}

export interface TAlignmentSuggestionsState {
    autoTrainingCompleted: boolean;
    currentBookName: string;
    failedToLoadCachedTraining: boolean;
    groupCollection: GroupCollection; //This contains all the verse data loaded in a hierarchical structure of Groups->Books->Chapter->Verses
    kickOffTraining: boolean;
    maxComplexity: number;
    trainingState: TrainingState;
}

export interface TrainingState{
    contextId: ContextId | null;
    currentTrainingInstanceCount: number; //This keeps track of what is currently training so that when it finishes lastTrainedInstanceCount can be set.
    lastTrainedInstanceCount: number; //This lets us know if something has changed since last training by comparing it to groupCollection.instanceCount
    trainingStatusOutput: string; //Setting this shows up on the toolbar and lets the training have a place to give live output status.
}

export interface ContextId {
    reference: {
        bookId: string;
        chapter: number;
        verse: number;
    };
    tool: string;
    groupId: string;
    bibleId: string; // identifier for bible, e.g. unfoldingWord/en_ult
    bookName?: string; // bible name in USFM header
}

export interface SourceWord {
    index: number;
    occurrence: number;
    occurrences: number;
    text: string;
    lemma: string;
    morph: string;
    strong: string;  // Could be multipart separated by colons such as 'c:H4191'
}

export interface TargetWord {
    index: number;
    occurrence: number;
    occurrences: number;
    text: string;
}

export interface TargetWordBank extends TargetWord {
    disabled: boolean;  // if true then word is already used in alignment
}

interface Alignment {
    sourceNgram: SourceWord[];
    targetNgram: TargetWord[];
}

interface TReference{
    chapter: number;
    verse: string;
}

interface TContextId{
    reference: TReference;
}

export interface TCurrentShas{[key: string]: string };