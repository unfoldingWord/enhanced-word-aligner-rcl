import GroupCollection from '@/shared/GroupCollection';
import {TAlignerData, TSourceTargetAlignment, TWord} from 'word-aligner-rcl';
import {Token} from 'wordmap-lexer'
import {Suggestion} from 'wordmap'

// USFM and Translation Memory Types
// =================================

/** Type definition for USFM (Unified Standard Format Markers) content */
export type usfmType = string;

/** Collection of USFM books indexed by bible identifier */
export type booksUsfmType = { [bibleId: string]: usfmType };

/** Translation memory containing source and target USFM data for alignment training */
export type TTranslationMemoryType = {
    /** Source language USFM content (e.g., Greek, Hebrew) */
    sourceUsfms: booksUsfmType;
    /** Target language USFM content (e.g., English, Spanish) */
    targetUsfms: booksUsfmType;
};

// Training State Management Types
// ===============================

/** Interface for communicating training state changes between components */
export interface TTrainingStateChange {
    /** Flag indicating if content checksums have been generated */
    checksumGenerated?: boolean;
    /** Context identifier for the current alignment session */
    contextId?: ContextId;
    /** Training progress percentage (0-100) */
    percentComplete?: number;
    /** Flag indicating if training is currently active */
    training?: boolean;
    /** Flag indicating if training has completed */
    trainingComplete?: boolean;
    /** Error message if training failed */
    trainingFailed?: string;
    /** Flag indicating if translation memory has been loaded */
    translationMemoryLoaded?: boolean;
    /** Flag for verbose logging output */
    verbose?: boolean;
}

/** Callback function type for handling training state changes */
export type TTrainingStateChangeHandler = (state: TTrainingStateChange) => void;

// Alignment Result Types
// ======================

/** Result object returned from word alignment operations */
export interface TWordAlignerAlignmentResult {
    /** Array of target language words with alignment information */
    targetWords: TWord[];
    /** Array of alignments between source and target words */
    verseAlignments: TSourceTargetAlignment[];
}

/** Current state of the word aligner component */
export interface TState {
    /** Flag indicating if the verse is currently aligned */
    aligned: boolean;
    /** Data structure containing alignment information */
    alignerData: TAlignerData;
    /** Scripture reference for the current verse */
    reference: TReference;
    /** Source language identifier */
    sourceLanguage: string;
    /** Target language identifier */
    targetLanguage: string;
}

// Action and Status Types
// =======================

/** Available actions for alignment operations */
interface TActions {
    /** Save the current alignment results */
    saveAlignment: (results: TWordAlignerAlignmentResult | null) => void;
    /** Cancel the current alignment operation */
    cancelAlignment: () => void;
    /** Handle changes to alignments with validation */
    onAlignmentsChange: (results: TWordAlignerAlignmentResult) => boolean;
}

/** Combined state and actions for the aligner component */
export interface TAlignerStatus {
    /** Available alignment actions */
    actions: TActions;
    /** Current aligner state */
    state: TState;
}

/** Props interface for the WordAligner dialog component */
interface WordAlignerDialogProps {
    /** Current aligner status (null if not active) */
    alignerStatus: TAlignerStatus | null;
    /** Dialog height in pixels */
    height: number;
    /** Translation function for UI strings */
    translate: (key: string) => string;
    /** Function to generate alignment suggestions */
    suggester: ((sourceSentence: string | Token[], targetSentence: string | Token[], maxSuggestions?: number, manuallyAligned?: Alignment[]) => Suggestion[]) | null;
}

// Application State Types
// =======================

/** Main state object for alignment suggestions functionality */
export interface TAlignmentSuggestionsState {
    /** Flag indicating if automatic training has completed */
    autoTrainingCompleted: boolean;
    /** Display name of the current book being processed */
    currentBookName: string;
    /** Flag indicating if loading cached training data failed */
    failedToLoadCachedTraining: boolean;
    /** Hierarchical collection of verse data (Groups->Books->Chapters->Verses) */
    groupCollection: GroupCollection;
    /** Flag to trigger training initiation */
    kickOffTraining: boolean;
    /** Maximum complexity level for alignment processing */
    maxComplexity: number;
    /** Current training state information */
    trainingState: TrainingState;
}

/** Training state tracking and status information */
export interface TrainingState {
    /** Context identifier for the training session */
    contextId: ContextId | null;
    /** Instance count of data currently being trained */
    currentTrainingInstanceCount: number;
    /** Instance count of last completed training session */
    lastTrainedInstanceCount: number;
    /** Status message for training progress display */
    trainingStatusOutput: string;
}

// Context and Reference Types
// ===========================

/** Context identifier containing reference and metadata information */
export interface ContextId {
    /** Scripture reference information */
    reference: {
        /** Book identifier (e.g., 'gen', 'mat') */
        bookId: string;
        /** Chapter number */
        chapter: number;
        /** Verse number */
        verse: number;
    };
    /** Tool or component identifier */
    tool: string;
    /** Group identifier for organizing resources */
    groupId: string;
    /** Bible identifier (e.g., 'unfoldingWord/en_ult') */
    bibleId: string;
    /** Optional book name from USFM header */
    bookName?: string;
}

// Word and Alignment Types
// ========================

/** Source language word with linguistic metadata */
export interface SourceWord {
    /** Position index in the verse */
    index: number;
    /** Current occurrence number of this word form */
    occurrence: number;
    /** Total occurrences of this word form in the verse */
    occurrences: number;
    /** Surface text of the word */
    text: string;
    /** Lemma (dictionary form) of the word */
    lemma: string;
    /** Morphological parsing information */
    morph: string;
    /** Strong's number (may be multipart, e.g., 'c:H4191') */
    strong: string;
}

/** Target language word with basic metadata */
export interface TargetWord {
    /** Position index in the verse */
    index: number;
    /** Current occurrence number of this word form */
    occurrence: number;
    /** Total occurrences of this word form in the verse */
    occurrences: number;
    /** Surface text of the word */
    text: string;
}

/** Target word in the alignment interface with interaction state */
export interface TargetWordBank extends TargetWord {
    /** Flag indicating if word is already used in an alignment */
    disabled: boolean;
}

/** Alignment between source and target word groups */
interface Alignment {
    /** Group of source language words */
    sourceNgram: SourceWord[];
    /** Group of target language words */
    targetNgram: TargetWord[];
}

// Scripture Reference Types
// =========================

/** Scripture reference with chapter and verse information */
interface TReference {
    /** Chapter number */
    chapter: number;
    /** Verse identifier (may be range like '1-2') */
    verse: string;
}

/** Minimal context identifier containing only reference */
interface TContextId {
    /** Scripture reference */
    reference: TReference;
}

// Utility Types
// =============

/** Collection of SHA checksums indexed by book identifier */
export interface TCurrentShas { [key: string]: string; }