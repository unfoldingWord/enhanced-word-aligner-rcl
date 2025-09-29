
/**
 * useAlignmentSuggestions Hook
 * ============================
 *
 * @synopsis
 * A custom React hook that powers the machine learning behind automated word alignment suggestions
 * for Bible translation projects. It manages the entire lifecycle of alignment models from
 * training to application.
 *
 * @description
 * This hook serves as the engine powering the enhanced word alignment system, providing 
 * sophisticated machine learning capabilities to automatically suggest word alignments between
 * source languages (like Greek, Hebrew) and target translations. The hook handles all aspects
 * of alignment model training, persistence, and application:
 *
 * - Loads and manages translation memory (pairs of source and target texts)
 * - Trains statistical alignment models using web workers for background processing
 * - Persists trained models in IndexedDB for future use
 * - Generates alignment suggestions based on learned patterns
 * - Adapts to available computing resources by dynamically adjusting complexity
 * - Provides a comprehensive API for controlling the alignment training process
 *
 * The hook integrates with the WordMap algorithm and leverages web workers to perform
 * computationally intensive training without blocking the UI. It maintains caches of trained
 * models specific to language pairs and books, and intelligently retrains when content changes.
 *
 * Key features:
 * - Asynchronous, non-blocking training through Web Workers
 * - Intelligent caching of trained models per book and language pair
 * - Dynamic complexity adjustment based on available computing resources
 * - Detailed training progress reporting and diagnostics
 * - SHA-based change detection to prevent unnecessary retraining
 * - Configurable training parameters
 *
 * @example
 * ```tsx
 * // Basic usage with required props
 * const alignmentSuggestionsManager = useAlignmentSuggestions({
 *   contextId: currentContextId,
 *   shown: isDialogVisible,
 *   sourceLanguageId: 'el-x-koine',
 *   targetLanguageId: 'en',
 *   createAlignmentTrainingWorker,
 *   handleTrainingStateChange: updateTrainingStatus
 * });
 *
 * // Access suggestion function
 * const { suggester } = alignmentSuggestionsManager.actions;
 * ```
 * 
 * @dependencies
 * - React 16.8+ (for hooks)
 * - uw-wordmapbooster (for machine learning algorithms)
 * - word-aligner-rcl (for Bible-specific utilities)
 * - IndexedDB support in browser (for caching)
 * - Web Workers API (for background processing)
 */

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { AbstractWordMapWrapper } from 'uw-wordmapbooster';
import { bibleHelpers } from 'word-aligner-rcl';
import usfm from 'usfm-js';
import cloneDeep from 'lodash.clonedeep';
import isEqual from 'deep-equal'
import { parseUsfmHeaders } from '@/utils/usfm_misc';
import delay from '@/utils/delay';
import Group from '@/shared/Group';
import Book from '@/shared/Book';
import GroupCollection from '@/shared/GroupCollection';
import IndexedDBStorage from '@/shared/IndexedDBStorage';
import { limitRangeOfComplexity } from '@/utils/misc';
import {
    ContextId,
    TAlignmentSuggestionsState,
    TCurrentShas,
    TTrainingStateChangeHandler,
    TrainingState,
    TTranslationMemoryType,
} from '@/common/classes';
import {
    DEFAULT_MAX_COMPLEXITY,
    DEFAULT_MAX_COMPLEXITY_OT,
    MIN_THRESHOLD_TRAINING_MINUTES,
    THRESHOLD_TRAINING_MINUTES,
    WORKER_TIMEOUT
} from '@/common/constants';
import {
    TAlignmentCompletedInfo,
    TAlignmentMetaData,
    TAlignmentSuggestionsConfig,
    TAlignmentTrainingWorkerData,
    TBookVerseCounts,
    TTrainedWordAlignerModelWorkerResults,
    TTrainingAndTestingData,
    TVerseCounts,
} from '@/workers/WorkerComTypes';
import {makeTranslationMemory, START_TRAINING} from '@/workers/utils/AlignmentTrainerUtils';

/**
 * Callback function type for handling training completion events
 * @param {TAlignmentCompletedInfo} info - Information about the completed training process
 */
export type THandleTrainingCompleted = (info: TAlignmentCompletedInfo) => void;

/**
 * Props for the useAlignmentSuggestions hook
 * 
 * This interface defines all configuration options and callbacks needed by
 * the alignment suggestions system.
 */
export interface TUseAlignmentSuggestionsProps {
    /** 
     * Configuration options for alignment suggestions behavior.
     * Controls parameters like n-gram length, auto-training, and complexity.
     */
    config?: TAlignmentSuggestionsConfig;

    /** 
     * Current Bible reference context with bible, book, chapter, verse.
     * Used to determine the scope for alignment operations.
     */
    contextId: ContextId;
    
    /** 
     * Factory function to create a web worker for alignment training.
     * Allows overriding default worker creation to support platforms like Next.js.
     */
    createAlignmentTrainingWorker?:() => Promise<Worker>;
    
    /** 
     * Callback for training state changes.
     * Notifies parent components about training progress and status.
     */
    handleTrainingStateChange?: TTrainingStateChangeHandler;
    
    /** 
     * Callback for training completion.
     * Called when an alignment model finishes training.
     */
    handleTrainingCompleted?: THandleTrainingCompleted;
    
    /** 
     * Flag indicating if the alignment suggestions are visible.
     * Controls when the hook should load/unload resources.
     */
    shown: boolean;
    
    /** 
     * ID of the source language (e.g., 'hbo' for Hebrew, 'el-x-koine' for Greek).
     * Used to identify the original language text.
     */
    sourceLanguageId: string;
    
    /** 
     * ID of the target language (e.g., 'en' for English).
     * Used to identify the translation language.
     */
    targetLanguageId: string;
    
    /** 
     * Pre-loaded translation memory for alignment.
     * Contains USFM content for both source and target languages.
     */
    translationMemory?: TTranslationMemoryType;
}

/**
 * Type definition for the suggestion function that generates alignment suggestions
 * 
 * This function uses statistical models to predict likely alignments between
 * source and target language words.
 */
export type TSuggester =
    ((sourceSentence: any, targetSentence: any, maxSuggestions?: number, manuallyAligned?: any[]) => any[])
    | null;

/**
 * Book SHA state information for tracking content changes
 * 
 * This interface provides information about whether a book's content
 * has changed since it was last trained.
 */
export interface TBookShaState {
    /** SHA hash of the previously trained book content */
    trainedSha: string | undefined;
    
    /** SHA hash of the current book content */
    currentBookSha: string | undefined;
    
    /** Flag indicating if the book content has changed since last training */
    bookShaChanged: boolean;
}

/**
 * Return value interface for the useAlignmentSuggestions hook
 * 
 * This interface defines the state values and action functions that the
 * hook provides to consumers.
 */
export interface TUseAlignmentSuggestionsReturn {
    /** Current state values for alignment suggestions */
    state: {
        /** Flag indicating if loading cached training data failed */
        failedToLoadCachedTraining: boolean;
        
        /** Maximum complexity level for alignment processing */
        maxComplexity: number;
        
        /** Current training state information */
        trainingState: TrainingState;
        
        /** Flag indicating if training is currently running */
        trainingRunning: boolean;
    },
    
    /** Actions available to interact with alignment suggestions */
    actions: {
        /** Checks if current training is for the same book as specified context */
        areTrainingSameBook: (contextId: ContextId) => boolean;
        
        /** Terminates worker and cleans up resources */
        cleanupWorker: () => void;
        
        /** Removes a book from the alignment memory */
        deleteBookFromGroup: (bookId: string) => Promise<void>;
        
        /** Gets the SHA state of the current book */
        getCurrentBookShaState: () => TBookShaState;
        
        /** Retrieves metadata about the current alignment model */
        getModelMetaData: () => TAlignmentMetaData|null;
        
        /** Returns the current suggestion function */
        getSuggester: () => TSuggester;
        
        /** Gets the context ID used for the current training */
        getTrainingContextId: () => ContextId;
        
        /** Checks if alignment training is currently running */
        isTraining: () => boolean;
        
        /** Loads translation memory from provided data */
        loadTranslationMemory: (translationMemory: TTranslationMemoryType) => Promise<void>;
        
        /** Loads translation memory from book content */
        loadTranslationMemoryWithBook: (bookId: string, originalBibleBookUsfm: string, targetBibleBookUsfm: string) => void;
        
        /** Saves updated configuration settings */
        saveChangedSettings: (config: TAlignmentSuggestionsConfig) => Promise<void>;
        
        /** Current suggestion function for generating alignment suggestions */
        suggester: TSuggester;
        
        /** Initiates the alignment training process */
        startTraining: () => void;
        
        /** Stops the currently running alignment training */
        stopTraining: () => void;
    };
}

/**
 * Creates a unique selection identifier from the context ID
 * 
 * @param {ContextId} contextId - The current context identifier
 * @returns {Array} An array containing Bible ID and book ID for selection
 */
function getSelectionFromContext(contextId: ContextId) {
    const currentSelection = [
        [contextId?.bibleId || '', contextId?.reference?.bookId || '']
    ]
    return currentSelection;
}

/**
 * Initializes the default state for alignment suggestions
 * 
 * Creates an initial state object with appropriate default values based on the
 * provided context, including empty groups collection and proper complexity settings
 * based on whether the book is in the Old or New Testament.
 * 
 * @param {ContextId} contextId - The context identifier for the current Bible reference
 * @return {TAlignmentSuggestionsState} Initial state for alignment suggestions
 */
function defaultAppState(contextId: ContextId): TAlignmentSuggestionsState {
    const newGroups : {[key:string]: Group} = {};
    const groupCollection = new GroupCollection(newGroups, 0);
    const bookId = contextId?.reference?.bookId || '';
    const isNT = bibleHelpers.isNewTestament(bookId)
    const maxComplexity = isNT ? DEFAULT_MAX_COMPLEXITY : DEFAULT_MAX_COMPLEXITY_OT;
    return {
        autoTrainingCompleted: false,
        currentBookName: bookId,
        failedToLoadCachedTraining: false,
        groupCollection,
        kickOffTraining: false,
        maxComplexity,
        trainingState: defaultTrainingState(contextId),
    }
}

/**
 * Creates a default training state object for the given context
 * 
 * Initializes training state with the provided context ID and default values
 * for training progress tracking.
 * 
 * @param {ContextId} contextId - The context identifier for the current reference
 * @return {TrainingState} Default training state object
 */
function defaultTrainingState(contextId: ContextId): TrainingState {
    return {
        contextId,
        currentTrainingInstanceCount: -1,
        lastTrainedInstanceCount: -1,
        trainingStatusOutput: '',
    }
}

/**
 * Calculates elapsed minutes since a given timestamp
 * 
 * @param {number} trainingStartTime - The timestamp when training started
 * @returns {number} Elapsed time in minutes
 */
function getElapsedMinutes(trainingStartTime: number) {
    return (Date.now() - trainingStartTime) / (1000 * 60);
}

/**
 * Generates a settings storage key for the given context
 * 
 * Creates a unique key for storing settings specific to the current
 * Bible and testament type.
 * 
 * @param {ContextId} contextId - The context identifier 
 * @returns {string} Settings storage key
 */
export const getSettingsKey = (contextId: ContextId): string => {
    const newKey = getStorageKey(contextId, 'settings', false);
    return newKey
}

/**
 * Determines the testament string for a book
 * 
 * @param {string} bookId - Book identifier (e.g., "gen", "mat")
 * @returns {string} "NT" for New Testament, "OT" for Old Testament
 */
function getTestamentStr(bookId: string) {
    return bibleHelpers.isNewTestament(bookId) ? 'NT' : 'OT';
}

/**
 * Generates a storage key based on context information
 * 
 * Creates a key string for storing data in IndexedDB based on
 * Bible ID, testament, and optionally the book ID.
 * 
 * @param {ContextId} contextId - The context identifier
 * @param {string} type_ - Type of data being stored (e.g., "settings", "Tmodel")
 * @param {boolean} addBook - Whether to include book ID in the key
 * @returns {string} Storage key string
 */
function getStorageKey(contextId: ContextId, type_: string, addBook?: boolean) {
    let newKey = '';
    const bookId = contextId?.reference?.bookId;
    const bibleId = contextId?.bibleId; // expected to be unique such as 'unfoldingWord/en/ult'
    if (bibleId && bookId) {
        const testament = getTestamentStr(bookId);
        newKey = `${type_}_${bibleId}_${testament}`;
        if (addBook) {
            newKey += `_${bookId}`;
        }
    }
    return newKey;
}

/**
 * Generates a model storage key for the given context
 * 
 * Creates a unique key for storing trained alignment models specific
 * to the current Bible, testament, and book.
 * 
 * @param {ContextId} contextId - The context identifier
 * @returns {string} Model storage key
 */
export const getModelKey = (contextId: ContextId): string => {
    const newKey = getStorageKey(contextId, 'Tmodel', true);
    return newKey
}

/**
 * Stores language preferences in IndexedDB
 * 
 * Saves the current complexity settings and configuration for the
 * specific language pair to persistent storage.
 * 
 * @param {ContextId} context - The context identifier
 * @param {number} maxComplexity - Maximum complexity setting
 * @param {React.RefObject<IndexedDBStorage>} dbStorageRef - Reference to IndexedDB storage
 * @param {TAlignmentSuggestionsConfig} config - Configuration settings
 * @returns {Promise<void>}
 */
async function storeLanguagePreferences(
    context: ContextId,
    maxComplexity: number,
    dbStorageRef: React.RefObject<IndexedDBStorage | null>,
    config: TAlignmentSuggestionsConfig,
) {
    if (!dbStorageRef?.current?.isReady()) {
        console.log('storeLanguagePreferences() - storage not ready');
        return
    }

    // save language-based settings to local storage
    const settingsKey = getSettingsKey(context);
    const settings = {
        maxComplexity,
        config,
    }
    await dbStorageRef.current.setItem(settingsKey, JSON.stringify(settings));
}

/**
 * Generates a group name based on the context identifier
 * 
 * Creates a name for grouping alignment data based on Bible ID and
 * testament type (OT/NT).
 * 
 * @param {ContextId} contextId - The context identifier
 * @returns {string} Group name for alignment data
 */
function getGroupName(contextId: ContextId) {
    let groupName_ = ''
    const bookId = contextId?.reference?.bookId;
    const bibleId = contextId?.bibleId;
    if (bibleId && bookId) {
        const testament = getTestamentStr(bookId);
        groupName_ = `${bibleId}_${testament}`;
    }
    return groupName_;
}

/**
 * Generates a storage key for alignment memory data
 * 
 * @param {string} group_name - The group name
 * @returns {string} Storage key for alignment memory
 */
function getAlignmentMemoryKey(group_name: string) {
    return `memory_${group_name}`;
}

/**
 * Merges provided configuration with default values
 * 
 * Ensures all required configuration properties have appropriate
 * values by combining the provided config with defaults.
 * 
 * @param {TAlignmentSuggestionsConfig} config_ - Provided configuration
 * @returns {TAlignmentSuggestionsConfig} Complete configuration with defaults
 */
function getDefaultConfig(config_: TAlignmentSuggestionsConfig) {
    const defaultConfig = {
        ...config_,
        doAutoLoadCachedTraining: config_.doAutoLoadCachedTraining ?? true,
        doAutoTraining: config_.doAutoTraining ?? false,
        keepAllAlignmentMemory: config_.keepAllAlignmentMemory ?? true,
        keepAllAlignmentMinThreshold: config_.keepAllAlignmentMinThreshold ?? 90,
        minTrainingVerseRatio: config_.minTrainingVerseRatio ?? 1.1,
        sourceNgramLength: config_.sourceNgramLength ?? 3,
        sourceNgramMaxLength: config_.sourceNgramMaxLength ?? 10,
        sourceNgramMinLength: config_.sourceNgramMinLength ?? 3,
        targetNgramLength: config_.targetNgramLength ?? 5,
        targetNgramMaxLength: config_.targetNgramMaxLength ?? 20,
        targetNgramMinLength: config_.targetNgramMinLength ?? 3,
        train_steps: config_.train_steps ?? 1000,
        trainOnlyOnCurrentBook: config_.trainOnlyOnCurrentBook ?? false,
    }
    return defaultConfig;
}

/**
 * The main hook for managing alignment suggestions
 * 
 * This hook provides a comprehensive system for training and applying
 * alignment models for Bible translation. It manages background workers,
 * cached models, training state, and suggestion generation.
 * 
 * @param {TUseAlignmentSuggestionsProps} props - Hook configuration properties
 * @returns {TUseAlignmentSuggestionsReturn} State and actions for alignment suggestions
 */
export const useAlignmentSuggestions = ({
    config: config_,
    contextId,
    createAlignmentTrainingWorker,
    handleTrainingCompleted,
    handleTrainingStateChange,
    shown,
    sourceLanguageId,
    targetLanguageId,
    translationMemory,
}: TUseAlignmentSuggestionsProps): TUseAlignmentSuggestionsReturn => {
    // Storage and state references
    const dbStorageRef = useRef<IndexedDBStorage | null>(null);
    const configRef = useRef<TAlignmentSuggestionsConfig>(getDefaultConfig(config_));
    const [state, _setState] = useState<TAlignmentSuggestionsState>(defaultAppState(contextId));
    const stateRef = useRef<TAlignmentSuggestionsState>(state);
    
    // Update state in both the React state and reference
    function setState( newState: TAlignmentSuggestionsState ) {
        stateRef.current = newState;
        _setState( newState );
    }
    
    // References for training state and context
    const trainingStateRef = useRef<TrainingState>(state.trainingState);
    const contextIdRef = useRef<ContextId>(null);
    const alignmentTrainingRef_ = useRef<TAlignmentTrainingWorkerData | null>(null);

    // Extract state properties
    const {groupCollection, maxComplexity, currentBookName, trainingState, kickOffTraining, failedToLoadCachedTraining} = state;

    // References for alignment predictor, metadata, and checksums
    const alignmentPredictorRef = useRef<AbstractWordMapWrapper | null>(null);
    const modelMetaDataRef = useRef<TAlignmentCompletedInfo | null>(null);
    const currentShasRef = useRef<TCurrentShas>({});

    /**
     * Retrieves the current training data
     * 
     * @returns {TAlignmentTrainingWorkerData} Current training data or undefined
     */
    function getTrainingData(): TAlignmentTrainingWorkerData {
        const alignmentTraining = alignmentTrainingRef_?.current;
        return alignmentTraining
    }

    /**
     * Sets new training data
     * 
     * @param {TAlignmentTrainingWorkerData} newData - New training data to set
     */
    function setTrainingData(newData: TAlignmentTrainingWorkerData) {
        alignmentTrainingRef_.current = newData;
    }

    /**
     * Starts a minute counter for tracking training duration
     * 
     * Initializes a counter that increments every minute to track
     * training duration, even if the system clock jumps (e.g., during sleep).
     * 
     * @returns {NodeJS.Timeout} Timer interval ID
     */
    function _startMinuteCounter():NodeJS.Timeout {
        const alignmentTraining = getTrainingData();
        alignmentTraining.minuteCounter = 0;

        console.log('⏱️ Timer started');

        alignmentTraining.minuteTimer = setInterval(() => {
            const alignmentTraining = getTrainingData()
            alignmentTraining.minuteCounter++;
            console.log(`Training ${alignmentTraining.minuteCounter} minute(s) elapsed`);
        }, 60 * 1000); // 60,000 ms = 1 minute

        return alignmentTraining.minuteTimer;
    }

    /**
     * Stops the minute counter
     * 
     * Cleans up the timer that tracks training duration.
     */
    function _stopMinuteCounter() {
        const alignmentTraining = getTrainingData();
        let minuteTimer = alignmentTraining?.minuteTimer;
        if (minuteTimer) {
            clearInterval(minuteTimer);
            minuteTimer = null;
        }
    }

    /**
     * Gets the current minute counter value
     * 
     * @returns {number} Minutes elapsed during training
     */
    function _getMinuteCounter():number {
        const alignmentTraining = getTrainingData()
        return alignmentTraining?.minuteCounter;
    }

    /**
     * Saves a group to IndexedDB storage
     * 
     * Persists alignment memory data for a group to IndexedDB.
     * 
     * @param {string} group_name - Name of the group to save
     * @param {Group} currentGroup - Group data to save
     * @returns {Promise<void>}
     */
    async function saveCurrentGroup(group_name: string, currentGroup: Group) {
        try {
            console.log(`saveCurrentGroup - saving ${group_name}`, group_name, currentGroup);

            const dbStorage = await getIndexedDbStorage();
            const groupJson = JSON.stringify(currentGroup, null, 2);
            const key = getAlignmentMemoryKey(group_name);
            await dbStorage.setItem(key, groupJson);
        } catch (e) {
            console.error(`saveCurrentGroup - ERROR saving ${group_name}`,e);
        }
    }

    /**
     * Loads a group from IndexedDB storage
     * 
     * Retrieves previously saved alignment memory for a group.
     * 
     * @param {string} group_name - Name of the group to load
     * @returns {Promise<Group|null>} Loaded group or null if not found
     */
    async function loadCurrentGroup(group_name: string) {
        let currentGroup: Group|null = null;

        try {
            console.log(`loadCurrentGroup - loading {$group_name}`, group_name);

            const dbStorage = await getIndexedDbStorage();
            const key = getAlignmentMemoryKey(group_name);
            const groupStr: string | null = await dbStorage.getItem(key);
            if (groupStr && groupStr !== 'undefined') {
                const groupJson = JSON.parse(groupStr);
                currentGroup = Group.load(group_name, groupJson);
            } else {
                console.log(`loadCurrentGroup - no saved data for {$group_name}`);
            }
        } catch (e) {
            console.error(`loadCurrentGroup - ERROR loading {$group_name}`,e);
        }
        return currentGroup;
    }

    /**
     * Computes a SHA-256 checksum for data
     * 
     * Creates a cryptographic hash of the provided data for change detection.
     * 
     * @param {string|object} data - Data to hash
     * @returns {Promise<string>} SHA-256 hash as a hexadecimal string
     */
    async function sha256Checksum(data) {
        if (typeof data !== 'string') {
            data = JSON.stringify(data);
        }
        const encoder = new TextEncoder();
        const buffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    
    /**
     * Deletes a book from the alignment memory
     * 
     * Removes a specific book's alignment data from the translation memory
     * and updates the application state.
     * 
     * @param {string} bookId - ID of the book to delete
     * @returns {Promise<void>}
     */
    const deleteBookFromGroup = async (bookId: string) => {
        console.log(`deleteBookFromGroup - ${bookId}`);
        const group_name = getGroupName(contextId)
        let newGroupCollection_ = stateRef.current?.groupCollection;
        const group = newGroupCollection_?.groups?.[group_name];
        if (group) {
            if (group.books?.[bookId]) {
                const newBooks_ = {...group.books}
                delete newBooks_[bookId]; // remove specified book
                const newGroup_ = new Group(newBooks_);
                const newGroups = {...newGroupCollection_.groups, [group_name]: newGroup_};
                newGroupCollection_ = new GroupCollection(newGroups, newGroupCollection_.instanceCount + 1);

                setState( { ...stateRef.current, groupCollection: newGroupCollection_ });

                // cache updated group settings
                await saveCurrentGroup(group_name, newGroupCollection_.groups[group_name]);
                console.log(`deleteBookFromGroup - deleted alignment memory for {bookId}`);
            } else {
                console.error(`deleteBookFromGroup - ERROR book not found ${bookId}`);
            }
        } else {
            console.error(`deleteBookFromGroup - ERROR group not found: ${group_name}`);
        }
    }

    /**
     * Loads translation memory data into the component state
     * 
     * Processes USFM content for source and target languages, organizing
     * it into books and chapters for alignment training.
     * 
     * @param {TTranslationMemoryType} translationMemory - Object with source and target USFM data
     * @returns {Promise<void>}
     */
    const loadTranslationMemory = useCallback(async (translationMemory: TTranslationMemoryType) => {
        const targetUsfms = translationMemory?.targetUsfms;
        if (!targetUsfms) {
            throw new Error('loadTranslationMemory - No USFM source content to add');
        }

        let newGroupCollection_ = stateRef.current.groupCollection;
        const group_name = getGroupName(contextId)
        let currentBookName_ = contextId?.reference?.bookId || '';
        console.log(`loadTranslationMemory - loading translation memory for ${currentBookName_}`);

        // need to get the books from targetUsfms
        const newBooks: { [key: string]: Book } = {};
        Object.entries(targetUsfms).forEach(([bookId, usfm_book]) => {
            const usfm_json = usfm.toJSON(usfm_book, { convertToInt: ['occurrence', 'occurrences'] });

            const usfmHeaders = parseUsfmHeaders(usfm_json.headers);
            const toc3Name = usfmHeaders.toc3 || bookId; //label to use
            const currentBookId = contextId?.reference?.bookId;
            if (bookId === currentBookId) {
                currentBookName_ = usfmHeaders.h;
            }
            const newBook = new Book({ chapters: {}, filename: bookId, toc3Name, targetUsfmBook: null, sourceUsfmBook: null });
            newBooks[bookId] = newBook.addTargetUsfm({ filename: bookId, usfm_book: usfm_json, toc3Name });
        });

        // check if group exists
        const noGroup = !newGroupCollection_.groups?.[group_name];

        // if group doesn't exist, check if saved
        const savedGroup = await loadCurrentGroup(group_name)
        if (savedGroup) {
            console.log(`loadTranslationMemory - group ${group_name} doesn't exist, loading from cache`);
            const newBooks_ = { ...savedGroup.books, ...newBooks };
            const newGroup_ = new Group(newBooks_);
            const newGroups = { ...newGroupCollection_.groups, [group_name]: newGroup_ };
            newGroupCollection_ = new GroupCollection(newGroups, newGroupCollection_.instanceCount + 1);
        } else if (noGroup) { // if group doesn't exist and wasn't saved, then add
            console.log(`loadTranslationMemory - group ${group_name} doesn't exist, creating`);
            const newGroup: Group = newGroupCollection_.groups[group_name] || new Group(newBooks);
            const newGroups = { ...newGroupCollection_.groups, [group_name]: newGroup };
            newGroupCollection_ = new GroupCollection(newGroups, newGroupCollection_.instanceCount + 1);
        } else { // if group exists, then update
            console.log(`loadTranslationMemory - group ${group_name} exists, updating`);
            const newGroup = newGroupCollection_.groups[group_name];
            const newBooks_ = { ...newGroup.books, ...newBooks };
            const newGroup_ = new Group(newBooks_);
            const newGroups = { ...newGroupCollection_.groups, [group_name]: newGroup_ };
            newGroupCollection_ = new GroupCollection(newGroups, newGroupCollection_.instanceCount);
        }

        setState( { ...stateRef.current, currentBookName: currentBookName_});
        
        Object.keys(newGroupCollection_.groups).forEach((groupName) => {
            const group = newGroupCollection_.groups[groupName];
            console.log(`loadTranslationMemory - new group ${groupName}:`, Object.keys(group?.books));
        })

        // #######################################################
        // load the source usfms.
        try {
            if (!translationMemory?.sourceUsfms) {
                throw new Error('No USFM source content to add');
            }

            const usfm_json = Object.fromEntries(Object.entries(translationMemory?.sourceUsfms).map(([key, value]) => [key, usfm.toJSON(value, { convertToInt: ['occurrence', 'occurrences'] })]));

            // always selected
            const isResourceSelected_ = (resourceKey: string[]): boolean => {
                return true;
            }

            const { newGroupCollection, addedVerseCount, droppedVerseCount } = newGroupCollection_.addSourceUsfm({ usfm_json, isResourceSelected: isResourceSelected_ });
            newGroupCollection_ = newGroupCollection;
            setState( { ...stateRef.current, groupCollection: newGroupCollection_ });

            console.log(`${addedVerseCount} connections added.`);

            // cache updated group settings
            await saveCurrentGroup(group_name, newGroupCollection_.groups[group_name]);

            const bookId = contextId?.reference?.bookId;
            const alignedBookUsfm = targetUsfms?.[bookId] || '0';
            const sha = await sha256Checksum(alignedBookUsfm); 
            console.log(`sha for alignments = ${sha}`);
            currentShasRef.current = { ...currentShasRef.current, [bookId]: sha}
            const trainingComplete_ = alignmentPredictorRef.current
            handleTrainingStateChange?.({checksumGenerated: true, translationMemoryLoaded: true})
        } catch (error) {
            console.error(`error importing ${error}`);
            throw new Error('Failed to load source data');
        }
    }, [contextId, stateRef]);

    /**
     * Loads translation memory for a single book
     * 
     * Creates a translation memory object for a single book and loads it
     * into the alignment system.
     * 
     * @param {string} bookId - ID of the book (e.g., "gen", "mat")
     * @param {string} originalBibleBookUsfm - USFM content for the source language
     * @param {string} targetBibleBookUsfm - USFM content for the target language
     */
    const loadTranslationMemoryWithBook = (bookId: string, originalBibleBookUsfm: string, targetBibleBookUsfm: string): void => {
        const translationMemory = makeTranslationMemory(bookId, originalBibleBookUsfm, targetBibleBookUsfm)
        loadTranslationMemory(translationMemory)
    }

    /**
     * Checks if alignment training is currently running
     * 
     * @returns {boolean} True if training is active, false otherwise
     */
    const isTraining = useCallback(() => {
        const trainingRunning = !!getTrainingData()?.worker
        return trainingRunning;
    }, [])

    const trainingRunning = isTraining()

    /**
     * Cleans up worker resources
     * 
     * Terminates the web worker, clears timeouts, and stops the minute counter
     * to free resources when training is complete or cancelled.
     */
    const cleanupWorker = () => {
        console.log('cleanupWorker')
        const alignmentTraining = getTrainingData();
        let workerTimeout = alignmentTraining?.workerTimeout;
        if (workerTimeout) {
            clearTimeout(workerTimeout);
            workerTimeout = null;
        }
        _stopMinuteCounter()
        if (alignmentTraining?.worker) {
            alignmentTraining.worker.terminate();
            alignmentTraining.worker = null;
        }
    }

    /**
     * Adjusts the maximum complexity based on available resources
     * 
     * Modifies the complexity level to optimize training performance
     * based on observed training times and system capabilities.
     * 
     * @param {number} reductionFactor - Factor to reduce complexity (0-1)
     * @param {number} maxComplexity_ - Current maximum complexity
     * @returns {number} Adjusted complexity value
     */
    const adjustMaxComplexity = (reductionFactor: number, maxComplexity_ = maxComplexity) => {
        let newMaxComplexity = Math.ceil(maxComplexity_ * reductionFactor);
        newMaxComplexity = limitRangeOfComplexity(newMaxComplexity);
        console.log(`Adjusting maxComplexity from ${maxComplexity_} to ${newMaxComplexity}, reduction Factor: ${reductionFactor}`);
        setState( { ...stateRef.current, maxComplexity: newMaxComplexity });
        return newMaxComplexity;
    }

    /**
     * Executes the alignment training process
     * 
     * This function is the core of the training system. It:
     * 1. Sets up the training data and parameters
     * 2. Creates and manages the web worker for background training
     * 3. Handles training completion and model persistence
     * 4. Manages timeouts and performance optimization
     * 5. Updates training state throughout the process
     * 
     * @returns {Promise<void>}
     */
    const executeTraining = async () => {
        //Use the Refs such as trainingStateRef instead of trainingState
        //because in the callback the objects are stale because they were
        //captured from a previous invocation of the function and don't
        //have later versions of the function in which things have been updated.
        //executeTraining itself gets called indirectly from within the callback so itself is
        //a callback needs to use the Refs.
        //https://stackoverflow.com/a/60643670

        if (!createAlignmentTrainingWorker) {
            console.log('executeTraining() - createAlignmentTrainingWorker not defined');
            return;
        }
        
        const bookId = contextId?.reference?.bookId;
        if (trainingStateRef.current.lastTrainedInstanceCount !== stateRef.current.groupCollection.instanceCount) {
            if (!isTraining()) { // check if training already running
                const contextId_ = {
                    ...contextId,
                    bookName: currentBookName || contextId?.reference?.bookId
                }
                const isNT = bibleHelpers.isNewTestament(bookId)
                const groupName = getGroupName(contextId)
                
                // Get the alignment data for training
                let alignmentTrainingData_:TTrainingAndTestingData|null = null;
                const group = getAlignmentsForCurrentGroup();
                if (group) {
                    alignmentTrainingData_ = group.getAlignmentDataAndCorpusForTrainingOrTesting({
                        forTesting: false,
                        getCorpus: true,
                        isNT: isNT
                    });
                }

                // Verify we have enough alignment data to train
                const alignmentCount= group ? Object.values(alignmentTrainingData_.alignments).length : 0
                if (alignmentCount > 4) {
                    const book = group?.books?.[bookId];
                    let currentBookVerseCounts:TVerseCounts|null = null;
                    if (book) {
                        currentBookVerseCounts = book.getVerseCounts()
                        console.log(`executeTraining() - alignment data for ${bookId}`, currentBookVerseCounts)
                    }
                    
                    const alignmentTrainingData: TTrainingAndTestingData = {
                        ...alignmentTrainingData_,
                        config: configRef.current,
                        contextId: contextId_,
                        currentBookVerseCounts,
                        currentSha: currentShasRef.current?.[bookId] || '',
                        maxComplexity,
                        sourceLanguageId,
                        targetLanguageId,
                    }

                    handleTrainingStateChange?.({training: true, trainingFailed: ''});

                    const trainingStartTime = Date.now(); // Capture start time

                    try { // background processing
                        console.log(`executeTraining() - start training for ${stateRef.current.groupCollection.instanceCount}`);

                        const newTrainingState = {
                            ...trainingStateRef.current,
                            currentTrainingInstanceCount: stateRef.current.groupCollection.instanceCount
                        };
                        setState( { ...stateRef.current, trainingState: newTrainingState});

                        // Create worker using dynamic import
                        const worker = await createAlignmentTrainingWorker();
                        const trainingWorkerData: TAlignmentTrainingWorkerData = {
                            contextId: cloneDeep(contextId),
                            trainingProgress: 0,
                            worker,
                        }
                        setTrainingData(trainingWorkerData);
                        _startMinuteCounter();

                        // Set up a worker timeout
                        trainingWorkerData.workerTimeout = setTimeout(() => {
                            let reductionFactor = 0.5;
                            let elapsedMinutes = _getMinuteCounter();
                            const trainingData_ = getTrainingData()
                            let trainingProgress = trainingData_?.trainingProgress;

                            console.log(`executeTraining() - Training Worker timeout after ${elapsedMinutes} minutes, percent complete ${trainingProgress}`);
                            reductionFactor = THRESHOLD_TRAINING_MINUTES / WORKER_TIMEOUT;

                            if (trainingProgress) {
                                reductionFactor = trainingProgress / 100
                            }

                            const newMaxComplexity = adjustMaxComplexity(reductionFactor);

                            cleanupWorker();

                            const newTrainingState = { ...trainingStateRef.current,
                                lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount
                            };
                            setState( { ...stateRef.current, trainingState: newTrainingState });
                            handleTrainingStateChange?.({training: false, trainingFailed: 'Timeout'});

                            storeLanguagePreferences(contextId, newMaxComplexity, dbStorageRef, configRef.current).then(() => {
                                // Restart training if needed
                                executeTraining();
                            })
                        }, WORKER_TIMEOUT);

                        // Define the callback for worker messages
                        trainingWorkerData.worker.addEventListener('message', (event) => {
                            const workerResults: TTrainedWordAlignerModelWorkerResults = event.data;
                            const trainingData_ = getTrainingData()

                            // Handle training status updates
                            if ('trainingStatus' === workerResults?.type) {
                                const percentComplete = event.data?.percent_complete;
                                const contextId_ = event.data?.contextId;
                                if (typeof percentComplete === 'number') {
                                    trainingData_.trainingProgress = percentComplete; // keep track of progress
                                    handleTrainingStateChange?.({ percentComplete, training: true, contextId: contextId_ });
                                }
                                return
                            }

                            // Handle non-training results
                            if ('trainingResults' !== workerResults?.type) {
                                console.log(`executeTraining() - not training results - ignoring`)
                                return
                            }

                            // Handle training completion
                            console.log(`executeTraining() - alignment training worker completed: `, workerResults);
                            handleTrainingStateChange?.({ training: false })
                            
                            // Clear timeout since worker completed successfully
                            cleanupWorker();
                            
                            let newMaxComplexity = workerResults.maxComplexity
                            //Load the trained model and put it somewhere it can be used.
                            const elapsedMinutes = _getMinuteCounter();
                            console.log(`executeTraining() - Training completed in ${elapsedMinutes} minutes`);
                            console.log(`executeTraining() - Training completed after ${getElapsedMinutes(trainingStartTime)} actual minutes`);

                            // Adjust complexity based on training time
                            if (elapsedMinutes > THRESHOLD_TRAINING_MINUTES) {
                                if (elapsedMinutes > WORKER_TIMEOUT) {
                                    console.log(`executeTraining() - elapsed time greater than timeout, likely went to sleep`);
                                } else {
                                    console.log(`executeTraining() - Worker took over ${THRESHOLD_TRAINING_MINUTES} minutes, adjusting down`);
                                    newMaxComplexity = adjustMaxComplexity(THRESHOLD_TRAINING_MINUTES / elapsedMinutes, workerResults.maxComplexity);
                                    setState({...stateRef.current, maxComplexity: newMaxComplexity});
                                }
                            } else if (workerResults.trimmedVerses && elapsedMinutes < MIN_THRESHOLD_TRAINING_MINUTES) { // if we have trimmed verses, but time is below threshold, bump up complexity limit so we can train with more data
                                const targetTime = MIN_THRESHOLD_TRAINING_MINUTES;
                                let adjustComplexity = (targetTime / elapsedMinutes);
                                const limit = 2;
                                if (adjustComplexity > limit) { // cap the change amount
                                    console.log(`executeTraining() - dynamic complexity adjustment of ${adjustComplexity}  limited to ${limit}`);
                                    adjustComplexity = limit
                                }
                                console.log(`executeTraining() - Worker took under ${MIN_THRESHOLD_TRAINING_MINUTES} minutes, adjusting complexity by ${adjustComplexity}`);
                                newMaxComplexity = adjustMaxComplexity(adjustComplexity, workerResults.maxComplexity);
                                setState( { ...stateRef.current, maxComplexity: newMaxComplexity});
                            }

                            let abstractWordMapWrapper;

                            // Handle training errors
                            if ('error' in workerResults) {
                                console.log('executeTraining() - Error running alignment worker: ' + workerResults.error);
                                return;
                            }

                            // Load trained model
                            if ('trainedModel' in workerResults) {
                                abstractWordMapWrapper = AbstractWordMapWrapper.load(workerResults.trainedModel);
                                // @ts-ignore
                                console.log(`executeTraining() - Number of alignments: ${abstractWordMapWrapper?.alignmentStash?.length}`)
                            }
                            
                            // Check if model is for current context
                            const modelKey = getModelKey(workerResults.contextId)
                            const currentModelKey = getModelKey(contextIdRef?.current)
                            console.log(`executeTraining() - currentModelKey: ${currentModelKey}`)

                            const forCurrentModel = currentModelKey == modelKey;
                            if (forCurrentModel) { // check if the current model is the same as the one we are training
                                alignmentPredictorRef.current = abstractWordMapWrapper;
                                const newTrainingState = {
                                    ...trainingStateRef.current,
                                    lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount
                                };
                                setState( { ...stateRef.current, trainingState: newTrainingState });
                                handleTrainingStateChange?.({training: false, trainingComplete: true, trainingFailed: ''});
                            } else {
                                console.log(`executeTraining() - currentModelKey: ${currentModelKey} != ${modelKey} - so not replacing current model`)
                            }

                            // save the model to local storage
                            const alignmentCompletedInfo: TAlignmentCompletedInfo = {
                                ...workerResults,
                                modelKey,
                                model: abstractWordMapWrapper,
                            }
                            
                            saveModelAndSettings(
                                alignmentCompletedInfo,
                                handleTrainingCompleted,
                            ).then(() => {
                                console.log(`executeTraining() - Saved model and settings`);
                            })
                        });

                        // start the training worker
                        trainingWorkerData.trainingProgress = 0
                        trainingWorkerData.worker.postMessage({
                            type: START_TRAINING,
                            data: alignmentTrainingData
                        });
                    } catch (error) {
                        console.error('executeTraining() - Error during alignment training setup:', error);
                        console.log(`executeTraining() - Training failed after ${getElapsedMinutes(trainingStartTime)} minutes`);
                        cleanupWorker();
                        handleTrainingStateChange?.({training: false, trainingFailed: 'Training Error'});
                    }

                } else {
                    console.log(`executeTraining() - Not enough training data for ${groupName}, count ${alignmentCount}`);
                    handleTrainingStateChange?.({training: false, trainingFailed: 'Insufficient Training Data'});
                }

            } else {
                console.log('executeTraining() - Alignment training already running');
                handleTrainingStateChange?.({trainingFailed: 'Insufficient Training Data'});
            }
        } else {
            console.log('executeTraining() - information not changed');
            handleTrainingStateChange?.({trainingFailed: 'Information not changed'});
        }
    };

    /**
     * Stops the alignment training process
     * 
     * Terminates the web worker and cleans up resources when
     * training needs to be cancelled.
     */
    const _stopTraining = () => {
        console.log('stopTraining()');
        const workerRunning = isTraining()
        if (workerRunning) {
            handleTrainingStateChange?.({training: false, trainingFailed: 'Cancelled'});
            cleanupWorker();
            console.log('useAlignmentSuggestions - stopTraining() - Alignment training stopped');
        } else {
            console.log('useAlignmentSuggestions - stopTraining() - training not running');
        }
    }

    /**
     * Gets the context ID used for the current training
     * 
     * @returns {ContextId|undefined} Current training context ID
     */
    function getTrainingContextId() {
        const trainingContextId = getTrainingData()?.contextId;
        return trainingContextId;
    }

    /**
     * Checks if training is for the same book as the specified context
     * 
     * @param {ContextId} contextId_ - Context to compare with training context
     * @returns {boolean} True if training is for same book, false otherwise
     */
    const areTrainingSameBook = (contextId_: ContextId)=> {
        if (isTraining()) {
            const trainingContextId = getTrainingContextId();
            const trainingBibleId = trainingContextId?.bibleId;
            const trainingBookId = trainingContextId?.reference?.bookId;
            const sameBibleId = trainingBibleId === contextId_?.bibleId;
            const sameBookId = trainingBookId === contextId_?.reference?.bookId;
            if (sameBibleId && sameBookId) {
                return true;
            }
        }
        return false;
    };

    /**
     * Initiates the alignment training process
     * 
     * Starts the training process in the background if not already running.
     */
    const startTraining = () => {
        const trainingRunning = isTraining();
        console.log(`useAlignmentSuggestions - startTraining() - Starting, already running is: ${trainingRunning}`);
        if (!trainingRunning) {
            delay(500).then(() => { // run async
                executeTraining().then(() => {
                    console.log(`useAlignmentSuggestions - startTraining() - Training started`);
                });
            });
        }
    }
    
    /**
     * Component lifecycle effect
     * 
     * Logs when the hook mounts and unmounts for debugging purposes.
     */
    useEffect(() => {
        console.log('useAlignmentSuggestions - mounted');
        return () => {
            console.log('useAlignmentSuggestions - unmounted');
        };
    },[]);
    
    /**
     * Training kickoff effect
     * 
     * Monitors the kickOffTraining flag and starts training when it changes to true.
     */
    useEffect(() => {
        const trainingRunning = isTraining();
        console.log(`useAlignmentSuggestions - kickOffTraining changed to ${kickOffTraining}, trainingRunning currently ${trainingRunning}`);
        if (kickOffTraining !== trainingRunning) { // check if training change
            delay(500).then(() => { // run async
                if (kickOffTraining) {
                    console.log(`useAlignmentSuggestions - kickOffTraining true, started training`);
                    setState( { ...stateRef.current, kickOffTraining: false});
                    executeTraining();
                }
            })
        }
    }, [kickOffTraining]);

    const modelKey = getModelKey(contextId)

    /**
     * Loads settings and model data from IndexedDB storage
     * 
     * Retrieves saved model and configuration settings for the current
     * context from persistent storage.
     * 
     * @param {IndexedDBStorage} dbStorage - IndexedDB storage instance
     * @param {string} modelKey - Key for the model to load
     * @returns {Promise<boolean>} True if model was loaded successfully
     */
    const loadSettingsFromStorage = useCallback(async (dbStorage: IndexedDBStorage, modelKey: string) => {
        setState( { ...stateRef.current, failedToLoadCachedTraining: false});
        let success = false;
        
        if (modelKey) {
            //load the model.
            let predictorModel: AbstractWordMapWrapper | null = null; // default to null
            const modelMetaDataStr: string | null = await dbStorage.getItem(modelKey);
            if (modelMetaDataStr && modelMetaDataStr !== 'undefined') {
                const modelMetaData_:TAlignmentCompletedInfo = JSON.parse(modelMetaDataStr);
                if (modelMetaData_?.model) {
                    try {
                        predictorModel = AbstractWordMapWrapper.load(modelMetaData_?.model);
                        console.log('loaded alignmentPredictorRef from local storage');
                    } catch (e) {
                        console.log(`error loading alignmentPredictor: ${(e as Error).message}`);
                    }
                }
                if (predictorModel) {
                    alignmentPredictorRef.current = predictorModel;
                    modelMetaData_.model = null
                    modelMetaDataRef.current = modelMetaData_;
                    const bookId = modelMetaData_?.contextId?.reference?.bookId || '';
                    const sha = modelMetaData_?.currentSha || '';
                    console.log(`loaded model sha ${sha}`);
                } else if (!trainingRunning) { // if training is running, then don't reset the alignmentPredictorRef
                    alignmentPredictorRef.current = null
                    modelMetaDataRef.current = null
                }
            }
            const trainingComplete = !!predictorModel;
            if (!trainingComplete) {
                console.log('no alignmentPredictorRef found in local storage');
                setState( { ...stateRef.current, failedToLoadCachedTraining: true});
            } else {
                success = true;
            }
            handleTrainingStateChange?.({
                training: false,
                trainingComplete,
                trainingFailed: '',
            });

            // load language based settings
            const langSettingsPair = getSettingsKey(contextId);
            let settings_: string | null = await dbStorage.getItem(langSettingsPair);
            let maxComplexity_ = DEFAULT_MAX_COMPLEXITY; // default to max complexity
            if (settings_ && settings_ !== 'undefined') {
                const settings = JSON.parse(settings_);
                if (settings?.maxComplexity) {
                    maxComplexity_ = settings.maxComplexity;
                    const limitComplexity = limitRangeOfComplexity(maxComplexity_);
                    console.log(`loaded maxComplexity from local storage: ${maxComplexity_}`);
                    if (limitComplexity !== maxComplexity_) {
                        console.log(`maxComplexity out of range, setting to ${limitComplexity}`);
                        maxComplexity_ = limitComplexity;
                    }
                }
                if (settings.config) {
                    configRef.current = getDefaultConfig(settings.config);
                }
            }
            setState( { ...stateRef.current, maxComplexity: maxComplexity_});
            if (maxComplexity_ === DEFAULT_MAX_COMPLEXITY) {
                console.log(`maxComplexity not found in local storage, using default ${maxComplexity_}`);
            }
        }
        return success;
    }, [handleTrainingStateChange]);

    /**
     * Gets verse counts for all books in the current group
     * 
     * @param {ContextId} contextId - Current context
     * @returns {TBookVerseCounts|null} Verse counts by book or null if no books
     */
    function getGroupVerseCounts(contextId: ContextId):TBookVerseCounts|null {
        const bookVerseCounts:TBookVerseCounts = {}
        const group = getAlignmentsForCurrentGroup();;
        const books = group?.books || {};
        if (Object.keys(books).length > 0) {
            Object.entries(books).forEach(([bookId, book]) => {
                const verseCounts = book.getVerseCounts()
                bookVerseCounts[bookId] = verseCounts
            })
            return bookVerseCounts
        }
        return null;
    }
    
    /**
     * Gets metadata about the current alignment model
     * 
     * Retrieves information about the model including training status,
     * book statistics, and alignment percentages.
     * 
     * @returns {TAlignmentMetaData} Model metadata
     */
    function getModelMetaData():TAlignmentMetaData {
        let bookAlignmentInfo:TAlignmentCompletedInfo = modelMetaDataRef?.current
        const bookId = contextId?.reference?.bookId;
        let message = `Current Book ${bookId}:\n\n`;
        const bookVerseCounts = getGroupVerseCounts(contextId);
 
        if (bookAlignmentInfo) {
            const alignmentMemoryVerseCounts = bookAlignmentInfo.trainingInfo?.alignmentMemoryVerseCounts;
            const trained = alignmentMemoryVerseCounts?.trained;
            if (trained) {
                message += `Trained with aligned verses from Books:`
                Object.entries(trained?.booksCount).forEach(([bookId, verseCount]) => {
                    message += `\n  ${verseCount} verses for ${bookId},`;
                })
            }
            const untrained = alignmentMemoryVerseCounts?.untrained;
            if (untrained) {
                message += `\nUntrained Alignment Memory verses from Books: `
                Object.entries(untrained.booksCount).forEach(([bookId, verseCount]) => {
                    message += `\n  ${verseCount} for ${bookId},`;
                })
            }
        } else {
            message += 'Alignment Data Not Loaded.';
        }

        if (bookVerseCounts) {
            message += `\n\nGlobal Alignment Memory for Books:`
            Object.entries(bookVerseCounts).forEach(([bookId, verseCount]) => {
                const totalVerseCounts = Math.max(verseCount.sourceVerseCount, verseCount.targetVerseCount);
                const percentAligned = verseCount.percentAligned;
                message += `\n  ${bookId} has ${totalVerseCounts} verses and is ${percentAligned.toFixed(0)}% aligned`;
            })
        } else {
            message += `\n\nGlobal Alignment Memory not loaded!`
        }
        
        return {
            config: configRef.current,
            currentBookAlignmentInfo: bookAlignmentInfo,
            globalAlignmentBookVerseCounts: bookVerseCounts,
            message,
        }
    }

    /**
     * Gets or initializes IndexedDB storage
     * 
     * @returns {Promise<IndexedDBStorage>} IndexedDB storage instance
     */
    async function getIndexedDbStorage() {
        if (!dbStorageRef.current) {
            const dbStorage = new IndexedDBStorage('app-state', 'dataStore');
            await dbStorage.initialize();
            dbStorageRef.current = dbStorage;
        }
        return dbStorageRef.current
    }

    /**
     * Gets alignments for the current group
     * 
     * @returns {Group|undefined} Group containing alignments
     */
    function getAlignmentsForCurrentGroup() {
        const groupName = getGroupName(contextId)
        const groupCollection_ = stateRef?.current?.groupCollection;
        const group = groupCollection_?.groups?.[groupName];
        return group;
    }

    /**
     * Gets the current SHA state for the book
     * 
     * Determines if the book content has changed since last training.
     * 
     * @returns {TBookShaState} Book SHA state information
     */
    function getCurrentBookShaState():TBookShaState {
        const bookId = contextId?.reference?.bookId;
        const trainedSha = modelMetaDataRef.current?.currentSha;
        const currentBookSha = currentShasRef.current?.[bookId];
        const bookShaChanged = !trainedSha || (currentBookSha !== trainedSha);

        return {trainedSha, currentBookSha, bookShaChanged} as TBookShaState;
    }

    /**
     * Effect to load model settings when component becomes visible
     * 
     * Loads cached model and settings from IndexedDB when the modelKey
     * changes or the component becomes visible.
     */
    useEffect(() => {
        (async () => {
            let cachedDataLoaded = false;
            const config = configRef.current;
            const doAutoLoad = config?.doAutoTraining || config?.doAutoLoadCachedTraining
            if (shown && modelKey && doAutoLoad) {
                console.log(`useAlignmentSuggestions - modelKey changed to ${modelKey}`);
                const dbStorage = await getIndexedDbStorage();
                cachedDataLoaded = await loadSettingsFromStorage(dbStorage, modelKey);
                console.log(`useAlignmentSuggestions - cachedDataLoaded: ${cachedDataLoaded}`);
                
                // add the usfm for current book to training memory
                const bookId = contextId?.reference?.bookId;
                if (cachedDataLoaded && bookId) {
                    const group_name = getGroupName(contextId)
                    const targetUsfm = translationMemory?.targetUsfms?.[bookId];
                    const sourceUsfm = translationMemory?.sourceUsfms?.[bookId];
                    let translationMemoryFound:boolean = !!(targetUsfm && sourceUsfm);
                    if (!translationMemoryFound) {
                        console.log(`useAlignmentSuggestions - translation Memory not found for book`);
                    } else { // make sure current data loaded into alignment memory
                        console.log(`useAlignmentSuggestions - translation Memory found for book, reload to make sure current`);
                        await loadTranslationMemory(translationMemory);
                    }
                    
                    if (translationMemoryFound) {
                        console.log(`useAlignmentSuggestions - Alignment memory Loaded, checking for sha changes`);
                        const {trainedSha, currentBookSha, bookShaChanged} = getCurrentBookShaState();
                        if (bookShaChanged) {
                            console.log(`useAlignmentSuggestions - sha changed: current ${currentBookSha}, last trained sha ${trainedSha}`);
                        }
                    }
                }
            }
            if (!shown) {
                handleTrainingStateChange?.({
                    checksumGenerated: false,
                    percentComplete: 0,
                    training: false,
                    trainingComplete: false,
                    trainingFailed: '',
                    translationMemoryLoaded: false,
                })
            }
            prepareForNewContext()
        })();
    }, [modelKey, shown]);

    /**
     * Effect for auto-training when cached model not found
     * 
     * Starts training automatically when a cached model fails to load
     * and auto-training is enabled.
     */
    useEffect(() => {
        if (failedToLoadCachedTraining && configRef.current?.doAutoTraining) {
            console.log('useAlignmentSuggestions - failedToLoadCachedTraining', {failedToLoadCachedTraining, contextId, shown})
            const haveBook = contextId?.reference?.bookId;
            const autoTrainingCompleted = stateRef.current?.autoTrainingCompleted;

            if (!haveBook) {
                if (autoTrainingCompleted) {
                    setState( { ...stateRef.current, autoTrainingCompleted: false});
                }
            } else { // have a book, so check if we have cached training data
                if (shown) {
                    const trainingSameBook = areTrainingSameBook(contextId)

                    if (trainingRunning) {
                        console.log('useAlignmentSuggestions - training already running trainingSameBook:', trainingSameBook)
                        if (!trainingSameBook) {
                            console.log(`WordAlignerDialog: stopping training on other book:`, getTrainingContextId())
                            _stopTraining()
                        }
                    } else { // training not running
                        if (!autoTrainingCompleted) {
                            setState( { ...stateRef.current, kickOffTraining: true});
                        }
                    }
                }
            }
        }
    }, [failedToLoadCachedTraining]);
    
    /**
     * Prepares the state for a new context
     * 
     * Updates state when the context changes, such as when switching
     * to a different book or Bible.
     */
    const prepareForNewContext = () => {
        console.log(`prepareForNewContext - contextId:`, contextId);
        const haveBook = contextId?.reference?.bookId;
        if (!!haveBook) {
            setState( { ...stateRef.current, currentBookName: contextId?.reference?.bookId || ''});
        }
        const newContextId = cloneDeep(contextId);
        if (!isEqual(contextId, contextIdRef.current)) {
            const newModelKey = getModelKey(newContextId)
            console.log(`prepareForNewContext - contextId changed to ${JSON.stringify(contextId)}`);
            if (!newModelKey) {
                console.log(`prepareForNewContext - no book selected`);
                const newTrainingState = {
                    ...trainingStateRef.current,
                    ...defaultTrainingState(newContextId),
                    failedToLoadCachedTraining: false,
                };
                setState( { ...stateRef.current, trainingState: newTrainingState });
            }
            contextIdRef.current = newContextId;
            setState( { ...stateRef.current, currentBookName: contextId?.reference?.bookId || ''});
        }
    }

    /**
     * Gets the current suggester function
     * 
     * Returns the function used to generate alignment suggestions
     * based on the trained model.
     * 
     * @returns {TSuggester} Suggester function or null if not available
     */
    function getSuggester(): TSuggester {
        return alignmentPredictorRef.current?.predict.bind(alignmentPredictorRef.current) || null;
    }
    
    /**
     * Saves changed configuration settings
     * 
     * Persists updated configuration to IndexedDB storage.
     * 
     * @param {TAlignmentSuggestionsConfig} config - New configuration
     * @returns {Promise<void>}
     */
    async function saveChangedSettings(config: TAlignmentSuggestionsConfig) {
        if (config) {
            configRef.current = config;
            await storeLanguagePreferences(
                contextId,
                maxComplexity,
                dbStorageRef,
                config
            );
        }
    }

    /**
     * Saves the trained model and settings to IndexedDB
     * 
     * Persists the alignment model and related configuration
     * to be reused in future sessions.
     * 
     * @param {TAlignmentCompletedInfo} alignmentCompletedInfo - Completed training info
     * @param {THandleTrainingCompleted|null} handleTrainingCompleted - Callback for training completion
     * @returns {Promise<void>}
     */
    async function saveModelAndSettings(alignmentCompletedInfo: TAlignmentCompletedInfo, handleTrainingCompleted: THandleTrainingCompleted | null) {
        const dbStorage = await getIndexedDbStorage();
        
        if (!dbStorage?.isReady()) {
            console.log('saveModelAndSettings() - storage not ready');
            return
        }

        const modelKey_ = alignmentCompletedInfo.modelKey;
        if (!modelKey_) {
            console.log('saveModelAndSettings() - modelKey not defined');
            return
        }

        console.log(`saveModelAndSettings() - saving model for ${modelKey_}`);

        // save model to local storage
        const abstractWordMapWrapper: AbstractWordMapWrapper = alignmentCompletedInfo.model;
        // @ts-ignore
        delete alignmentCompletedInfo.trainedModel
        const saveData:TAlignmentCompletedInfo = {...alignmentCompletedInfo}
        // @ts-ignore
        saveData.model = abstractWordMapWrapper?.save()
        await dbStorageRef.current.setItem(modelKey_, JSON.stringify(saveData));

        // remove redundant items
        // @ts-ignore
        delete saveData.model
        modelMetaDataRef.current = saveData // keep latest
            
        await storeLanguagePreferences(
            alignmentCompletedInfo.contextId,
            alignmentCompletedInfo.maxComplexity,
            dbStorageRef,
            configRef.current,
        );
        console.log(`saveModelAndSettings() - setting maxComplexity to ${alignmentCompletedInfo.maxComplexity}`);

        handleTrainingCompleted?.(alignmentCompletedInfo);
    }

    // Get the current suggester function
    const suggester: TSuggester = getSuggester()

    // Return the hook's state and actions
    return {
        state: {
            failedToLoadCachedTraining,
            maxComplexity,
            trainingState,
            trainingRunning,
        },
        actions: {
            areTrainingSameBook,
            cleanupWorker,
            deleteBookFromGroup,
            getCurrentBookShaState,
            getModelMetaData,
            getSuggester,
            getTrainingContextId,
            isTraining,
            loadTranslationMemory,
            loadTranslationMemoryWithBook,
            saveChangedSettings,
            startTraining,
            stopTraining: _stopTraining,
            suggester,
        }
    };
};