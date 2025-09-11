import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { AbstractWordMapWrapper } from 'uw-wordmapbooster';
import { bibleHelpers } from 'word-aligner-rcl';
import usfm from 'usfm-js';
import cloneDeep from "lodash.clonedeep";
import isEqual from 'deep-equal'
import { parseUsfmHeaders } from "@/utils/usfm_misc";
import delay from "@/utils/delay";
import Group from "@/shared/Group";
import Book from "@/shared/Book";
import GroupCollection from "@/shared/GroupCollection";
import IndexedDBStorage from "@/shared/IndexedDBStorage";
import { limitRangeOfComplexity } from "@/utils/misc";
import {
    ContextId,
    TAlignmentSuggestionsState,
    THandleTrainingStateChange,
    TrainingState,
    translationMemoryType,
} from "@/common/classes";
import {
    DEFAULT_MAX_COMPLEXITY,
    DEFAULT_MAX_COMPLEXITY_OT,
    MIN_THRESHOLD_TRAINING_MINUTES,
    THRESHOLD_TRAINING_MINUTES,
    WORKER_TIMEOUT
} from "@/common/constants";
import {
    TAlignmentSuggestionsConfig,
    TAlignmentTrainingWorkerData,
    TTrainedWordAlignerModelWorkerResults,
    TTrainingAndTestingData,
    TVerseCounts,
} from "@/workers/WorkerComTypes";
import {makeTranslationMemory, START_TRAINING} from "@/workers/utils/AlignmentTrainerUtils";

// console.log("useAlignmentSuggestions.ts AlignmentWorker", AlignmentWorker);

export interface TAlignmentCompletedInfo {
    modelKey: string;
    model: AbstractWordMapWrapper | null;
    sourceLanguageId: string;
    targetLanguageId: string;
    maxComplexity: number;
}

type THandleTrainingCompleted = (info: TAlignmentCompletedInfo) => void;

interface TUseAlignmentSuggestionsProps {
    config?: TAlignmentSuggestionsConfig;
    contextId: ContextId;
    createAlignmentTrainingWorker?:() => Promise<Worker>; // needed to support alignment training in a web worker
    handleSetTrainingState?: THandleTrainingStateChange;
    handleTrainingCompleted?: THandleTrainingCompleted ;
    shown: boolean;
    sourceLanguageId: string;
    targetLanguageId: string;
    targetUsfm?: string;
    sourceUsfm?: string;
}

type TSuggester =
    ((sourceSentence: any, targetSentence: any, maxSuggestions?: number, manuallyAligned?: any[]) => any[])
    | null;

interface TUseAlignmentSuggestionsReturn {
    state: {
        failedToLoadCachedTraining: boolean;
        maxComplexity: number;
        trainingState: TrainingState;
        trainingRunning: boolean;
    },
    actions: {
        areTrainingSameBook: (contextId: ContextId) => boolean;
        cleanupWorker: () => void;
        getSuggester: () => TSuggester;
        getTrainingContextId: () => ContextId;
        isTraining: () => boolean;
        loadTranslationMemory: (translationMemory: translationMemoryType) => Promise<void>;
        loadTranslationMemoryWithBook: (bookId: string, originalBibleBookUsfm: string, targetBibleBookUsfm: string) => void;
        suggester: TSuggester;
        startTraining: () => void;
        stopTraining: () => void;
    };
}

function getSelectionFromContext(contextId: ContextId) {
    const currentSelection = [
        [contextId?.bibleId || '', contextId?.reference?.bookId || '']
    ]
    return currentSelection;
}

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

function defaultTrainingState(contextId: ContextId): TrainingState {
    return {
        contextId,
        currentTrainingInstanceCount: -1,
        lastTrainedInstanceCount: -1,
        trainingStatusOutput: "",
    }
}

function getElapsedMinutes(trainingStartTime: number) {
    return (Date.now() - trainingStartTime) / (1000 * 60);
}

/**
 * Generates a language pair string used for settings based on the target and source languages.
 *
 * @returns {string} A string representing the language pair in the format "settings_{targetLanguageId}_{sourceLanguageId}".
 */
export const getLangPair = (sourceLanguageId: string, targetLanguageId: string): string => {
    return `settings_${targetLanguageId}_${sourceLanguageId}`;
}

/**
 * Determines the testament string ('NT' for New Testament or 'OT' for Old Testament)
 * based on the given book identifier.
 *
 * @param {string} bookId - The identifier of the book to evaluate.
 * @return {string} Returns 'NT' if the book is in the New Testament, otherwise 'OT'.
 */
function getTestamentStr(bookId: string) {
    return bibleHelpers.isNewTestament(bookId) ? 'NT' : 'OT';
}

/**
 * Generates a model key based on the context's Bible and book identifiers.
 *
 * The function constructs a string key by combining the Bible ID, testament type (New Testament or Old Testament),
 * and book ID. It first checks the existence of `bibleId` and `bookId` from the context. If both are present,
 * the testament type is determined using a helper function, and the key is composed in the format `bibleId_testament_bookId`.
 *
 * @returns {string} The constructed model key. Returns an empty string if either `bibleId` or `bookId` is missing.
 */
export const getModelKey = (contextId: ContextId): string => {
    let modelKey_ = '';
    const bookId = contextId?.reference?.bookId;
    const bibleId = contextId?.bibleId; // expected to be unique such as "unfoldingWord/en/ult"
    if (bibleId && bookId) {
        const testament = getTestamentStr(bookId);
        modelKey_ = `Model_${bibleId}_${testament}_${bookId}`;
    }
    return modelKey_
}

/**
 * Stores language preferences in the provided indexed database storage reference.
 *
 * @param {string} sourceLanguageId - The identifier for the source language.
 * @param {string} targetLanguageId - The identifier for the target language.
 * @param {number} maxComplexity - The maximum complexity level for the language preferences.
 * @param {React.RefObject<IndexedDBStorage | null>} dbStorageRef - A React reference object pointing to the IndexedDB storage instance.
 * @return {Promise<void>} A promise that resolves when the language preferences have been successfully stored, or returns early if the storage is not ready.
 */
async function storeLanguagePreferences(sourceLanguageId: string, targetLanguageId: string, maxComplexity: number, dbStorageRef: React.RefObject<IndexedDBStorage | null>) {
    if (!dbStorageRef?.current?.isReady()) {
        console.log("storeLanguagePreferences() - storage not ready");
        return
    }

    // save language-based settings to local storage
    const langSettingsPair = getLangPair(sourceLanguageId, targetLanguageId);
    const settings = {
        maxComplexity,
    }
    await dbStorageRef.current.setItem(langSettingsPair, JSON.stringify(settings));
}

/**
 * Generates a group name based on the given context identifier. The group name
 * is constructed using the Bible ID and the testament string derived from the
 * book ID in the context reference.
 *
 * @param {ContextId} contextId - The context identifier object containing the Bible ID
 *                                and reference details, including the book ID.
 * @return {string} The generated group name formed using the Bible ID and testament string.
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

function getAlignmentMemoryKey(group_name: string) {
    return `memory_${group_name}`;
}

/**
 * Handles alignment suggestions and manages their state, training process, and updates.
 *
 * This function manages the lifecycle of alignment suggestions, including their initialization,
 * updates, and training using alignment models. It provides functionalities such as loading
 * translation memory data, managing stateful information for alignments, and starting or stopping
 * training processes using a web worker. It also adjusts complexity settings to fine-tune suggestions
 * and ensures proper cleanup of resources when necessary.
 *
 * @param {Object} useAlignmentSuggestionsProps - Object containing properties for alignment suggestions.
 * @param {string} useAlignmentSuggestionsProps.contextId - Identifier for the current alignment context.
 * @param {function} useAlignmentSuggestionsProps.createAlignmentTrainingWorker - Function to create a web worker for training.
 * @param {function} useAlignmentSuggestionsProps.handleSetTrainingState - Callback to handle updates to the training state.
 * @param {boolean} useAlignmentSuggestionsProps.shown - Indicator whether the alignment suggestions are visible.
 * @param {string} useAlignmentSuggestionsProps.sourceLanguageId - Identifier for the source language.
 * @param {string} useAlignmentSuggestionsProps.targetLanguageId - Identifier for the target language.
 * @return {Object} useAlignmentSuggestionsReturn - An object containing state, utilities, and actions related to alignment suggestions.
 */
export const useAlignmentSuggestions = ({
    config,
    contextId,
    createAlignmentTrainingWorker,
    handleTrainingCompleted,
    handleSetTrainingState,
    shown,
    sourceLanguageId,
    targetLanguageId,
    targetUsfm,
    sourceUsfm,
}: TUseAlignmentSuggestionsProps): TUseAlignmentSuggestionsReturn => {
    const dbStorageRef = useRef<IndexedDBStorage | null>(null);

    const [state, _setState] = useState<TAlignmentSuggestionsState>(defaultAppState(contextId));
    //also hold the state in a ref so that callbacks can get the up-to-date information.
    //https://stackoverflow.com/a/60643670
    const stateRef = useRef<TAlignmentSuggestionsState>(state);
    function setState( newState: TAlignmentSuggestionsState ) {
        stateRef.current = newState;
        _setState( newState );
    }
    
    // Remove individual state variables - they're now part of consolidated state
    const trainingStateRef = useRef<TrainingState>(state.trainingState);
    const contextIdRef = useRef<ContextId>(null);
    const alignmentTrainingWorkerRef = useRef<TAlignmentTrainingWorkerData | null>(null);
    const workerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const trainingProgress = useRef<number>(0)

    const {groupCollection, maxComplexity, currentBookName, trainingState, kickOffTraining, failedToLoadCachedTraining} = state;

    const alignmentPredictor = useRef<AbstractWordMapWrapper | null>(null);

    /**
     * Saves the current group to the IndexedDB storage.
     *
     * @param {string} group_name - The name of the group to be saved.
     * @param {Group} currentGroup - The group data to be saved.
     * @return {Promise<void>} A promise that resolves when the group is successfully saved.
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
     * Loads the current group data from indexed database storage by the given group name.
     *
     * @param {string} group_name - The name of the group to be loaded from storage.
     * @return {Promise<Group|null>} A promise that resolves to the loaded group if data exists, otherwise null.
     */
    async function loadCurrentGroup(group_name: string) {
        let currentGroup: Group|null = null;

        try {
            console.log(`loadCurrentGroup - loading {$group_name}`, group_name);

            const dbStorage = await getIndexedDbStorage();
            const key = getAlignmentMemoryKey(group_name);
            const groupStr: string | null = await dbStorage.getItem(key);
            if (groupStr && groupStr !== "undefined") {
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
     * Loads translation memory data into the component state
     * @param translationMemory Object containing source and target USFM translation data
     * @throws Error if no resources are selected or if USFM content is missing
     */
    const loadTranslationMemory = useCallback(async (translationMemory: translationMemoryType) => {
        //ask the user to make a selection if no resources are selected.
        if (!translationMemory?.targetUsfms) {
            throw new Error("loadTranslationMemory - No USFM source content to add");
        }

        let newGroupCollection_ = stateRef.current.groupCollection;
        const group_name = getGroupName(contextId)
        let currentBookName_ = contextId?.reference?.bookId || '';
        console.log(`loadTranslationMemory - loading translation memory for ${currentBookName_}`);

        // need to get the books from targetUsfms
        const newBooks: { [key: string]: Book } = {};
        Object.entries(translationMemory?.targetUsfms).forEach(([bookId, usfm_book]) => {
            const usfm_json = usfm.toJSON(usfm_book, { convertToInt: ['occurrence', 'occurrences'] });

            const usfmHeaders = parseUsfmHeaders(usfm_json.headers);
            const toc3Name = usfmHeaders.toc3; //label to use
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
                throw new Error("No USFM source content to add");
            }

            const usfm_json = Object.fromEntries(Object.entries(translationMemory?.sourceUsfms).map(([key, value]) => [key, usfm.toJSON(value, { convertToInt: ['occurrence', 'occurrences'] })]));

            // always selected
            const isResourceSelected_ = (resourceKey: string[]): boolean => {
                return true;
            }

            //TODO Josh: it would be good to come back to this and add confirmation
            //if the pairing is changing an existing pairing.

            const { newGroupCollection, addedVerseCount, droppedVerseCount } = newGroupCollection_.addSourceUsfm({ usfm_json, isResourceSelected: isResourceSelected_ });
            newGroupCollection_ = newGroupCollection;
            setState( { ...stateRef.current, groupCollection: newGroupCollection_ });

            console.log(`${addedVerseCount} connections added.`);

            // cache updated group settings
            await saveCurrentGroup(group_name, newGroupCollection_.groups[group_name]);
        } catch (error) {
            console.error(`error importing ${error}`);
            throw new Error("Failed to load source data");
        }
    }, [contextId, stateRef]);

    /**
     * Loads the translation memory associated with a specific book.
     *
     * This function retrieves and initializes the translation memory data
     * required for processing translations of the given book. It ensures that
     * the relevant linguistic data and configurations are prepared for
     * translation tasks.
     *
     * @param {string} bookId - The identifier of the book (e.g., 'mat', 'mrk', 'luk')
     * @param {string} originalBibleBookUsfm - The USFM content of the original language Bible book
     * @param {string} targetBibleBookUsfm - The USFM content of the target language Bible book
     * @returns {translationMemoryType} A structured object containing source and target USFM data
     */
    const loadTranslationMemoryWithBook = (bookId: string, originalBibleBookUsfm: string, targetBibleBookUsfm: string): void => {
        const translationMemory = makeTranslationMemory(bookId, originalBibleBookUsfm, targetBibleBookUsfm)
        loadTranslationMemory(translationMemory)
    }

    const trainingRunning = !!alignmentTrainingWorkerRef.current

    /**
     * Cleans up worker resources by terminating the worker and clearing the timeout
     */
    const cleanupWorker = () => {
        if (workerTimeoutRef.current) {
            clearTimeout(workerTimeoutRef.current);
            workerTimeoutRef.current = null;
        }
        if (alignmentTrainingWorkerRef.current) {
            alignmentTrainingWorkerRef.current.worker.terminate();
            alignmentTrainingWorkerRef.current = null;
        }
    }

    /**
     * Adjusts the maximum complexity value based on a given reduction factor.
     *
     * This function takes the current maximum complexity value and multiplies it by the provided
     * reduction factor. The result is rounded up to ensure a whole number and constrained within
     * predefined limits. The adjusted value is then set as the new maximum complexity.
     *
     * @param {number} reductionFactor - Multiplier between 0 and 1 to reduce the maximum complexity
     * @param {number} maxComplexity_ - new value for maxComplexity
     * @returns {number} The adjusted and constrained maximum complexity value
     */
    const adjustMaxComplexity = (reductionFactor: number, maxComplexity_ = maxComplexity) => {
        let newMaxComplexity = Math.ceil(maxComplexity_ * reductionFactor);
        newMaxComplexity = limitRangeOfComplexity(newMaxComplexity);
        console.log(`Adjusting maxComplexity from ${maxComplexity_} to ${newMaxComplexity}, reduction Factor: ${reductionFactor}`);
        setState( { ...stateRef.current, maxComplexity: newMaxComplexity });
        return newMaxComplexity;
    }

    /**
     * Starts the alignment training process using a web worker
     * Only runs if there have been changes since last training and enough training data exists
     * Updates training state and alignment predictor with trained model results
     * Includes a timeout that is cleared if worker completes sooner
     */
    const executeTraining = async () => {
        //Use the Refs such as trainingStateRef instead of trainingState
        //because in the callback the objects are stale because they were
        //captured from a previous invocation of the function and don't
        //have later versions of the function in which things have been updated.
        //startTraining itself gets called from within the callback so itself is
        //a callback needs to use the Refs.
        //https://stackoverflow.com/a/60643670

        if (!createAlignmentTrainingWorker) {
            console.log("executeTraining() - createAlignmentTrainingWorker not defined");
            return;
        }
        //make sure that lastUsedInstanceCount isn't still the same as groupCollection.instanceCount
        if (trainingStateRef.current.lastTrainedInstanceCount !== stateRef.current.groupCollection.instanceCount) {
            if (alignmentTrainingWorkerRef.current === null) { // check if training already running
                const contextId_ = {
                    ...contextId,
                    bookName: currentBookName || contextId.reference.bookId
                }
                const bookId = contextId?.reference?.bookId;
                const isNT = bibleHelpers.isNewTestament(bookId)
                const groupName = getGroupName(contextId)
                
                //before creating the worker, check to see if there is any data to train on.
                //get the information for the alignment to training.
                const groupCollection_ = stateRef?.current?.groupCollection;
                let alignmentTrainingData_:TTrainingAndTestingData|null = null;
                const group = groupCollection_?.groups?.[groupName];
                if (group) {
                    alignmentTrainingData_ = group.getAlignmentDataAndCorpusForTrainingOrTesting({
                        forTesting: false,
                        getCorpus: true,
                        isNT: isNT
                    });
                }

                //check if there are enough entries in the alignment training data dictionary
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
                        config,
                        contextId: contextId_,
                        currentBookVerseCounts,
                        maxComplexity,
                        sourceLanguageId,
                        targetLanguageId,
                    }

                    handleSetTrainingState?.({training: true, trainingFailed: ''});

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
                        const workerData: TAlignmentTrainingWorkerData = {
                            worker,
                            contextId: cloneDeep(contextId),
                        }
                        alignmentTrainingWorkerRef.current = workerData;

                        // Set up a worker timeout
                        workerTimeoutRef.current = setTimeout(() => {
                            let reductionFactor = 0.5;
                            let elapsedMinutes1 = getElapsedMinutes(trainingStartTime);
                            console.log(`executeTraining() - Training Worker timeout after ${elapsedMinutes1} minutes, percent complete ${trainingProgress.current}`);
                            
                            if (elapsedMinutes1 > WORKER_TIMEOUT) {
                                console.log(`executeTraining() - elapsed time greater than timeout, likely went to sleep, using ${WORKER_TIMEOUT} for run time`);
                                reductionFactor = THRESHOLD_TRAINING_MINUTES / WORKER_TIMEOUT;
                            }
                            
                            if (trainingProgress.current) {
                                reductionFactor = trainingProgress.current / 100
                            }

                            const newMaxComplexity = adjustMaxComplexity(reductionFactor);

                            cleanupWorker();

                            const newTrainingState = { ...trainingStateRef.current,
                                lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount
                            };
                            setState( { ...stateRef.current, trainingState: newTrainingState });
                            handleSetTrainingState?.({training: false, trainingFailed: 'Timeout'});

                            storeLanguagePreferences(sourceLanguageId, targetLanguageId, newMaxComplexity, dbStorageRef).then(() => {
                                // Restart training if needed
                                executeTraining();
                            })
                        }, WORKER_TIMEOUT);

                        //Define the callback which will be called after the alignment trainer has finished
                        alignmentTrainingWorkerRef.current.worker.addEventListener('message', (event) => {
                            const workerResults: TTrainedWordAlignerModelWorkerResults = event.data;

                            if ('trainingStatus' === workerResults?.type) {
                                const percentComplete = event.data?.percent_complete;
                                const contextId_ = event.data?.contextId;
                                // console.log(`executeTraining() - trainingStatus received: ${percentComplete}%`)
                                if (typeof percentComplete === 'number') {
                                    trainingProgress.current = percentComplete; // keep track of progress
                                    handleSetTrainingState?.({ percentComplete, training: true, contextId: contextId_ });
                                }
                                return
                            }

                            if ('trainingResults' !== workerResults?.type) {
                                console.log(`executeTraining() - not training results - ignoring`)
                                return
                            }

                            console.log(`executeTraining() - alignment training worker completed: `, alignmentTrainingWorkerRef.current);
                            handleSetTrainingState?.({ training: false })
                            
                            // Clear timeout since worker completed successfully
                            cleanupWorker();
                            
                            let newMaxComplexity = workerResults.maxComplexity
                            //Load the trained model and put it somewhere it can be used.
                            const elapsedMinutes = getElapsedMinutes(trainingStartTime);
                            console.log(`executeTraining() - Training completed in ${elapsedMinutes} minutes`);
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

                            if ("error" in workerResults) {
                                console.log("executeTraining() - Error running alignment worker: " + workerResults.error);
                                return;
                            }

                            if ("trainedModel" in workerResults) {
                                abstractWordMapWrapper = AbstractWordMapWrapper.load(workerResults.trainedModel);
                                // @ts-ignore
                                console.log(`executeTraining() - Number of alignments: ${abstractWordMapWrapper?.alignmentStash?.length}`)
                            }
                            
                            const modelKey = getModelKey(workerResults.contextId)
                            const currentModelKey = getModelKey(contextIdRef?.current)
                            console.log(`executeTraining() - currentModelKey: ${currentModelKey}`)

                            const forCurrentModel = currentModelKey == modelKey;
                            if (forCurrentModel) { // check if the current model is the same as the one we are training
                                alignmentPredictor.current = abstractWordMapWrapper;
                                const newTrainingState = {
                                    ...trainingStateRef.current,
                                    lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount
                                };
                                setState( { ...stateRef.current, trainingState: newTrainingState });
                                handleSetTrainingState?.({training: false, trainingComplete: true, trainingFailed: ''});
                            } else {
                                console.log(`executeTraining() - currentModelKey: ${currentModelKey} != ${modelKey} - so not replacing current model`)
                            }

                            // save the model to local storage NOW
                            const alignmentCompletedInfo: TAlignmentCompletedInfo = {
                                modelKey,
                                model: abstractWordMapWrapper,
                                sourceLanguageId,
                                targetLanguageId,
                                maxComplexity: newMaxComplexity,
                            }
                            
                            saveModelAndSettings(
                                alignmentCompletedInfo,
                                handleTrainingCompleted,
                            ).then(() => {
                                console.log(`executeTraining() - Saved model and settings`);
                                
                                // *** disabled training auto-repeat - seems data has not been changed enough to justify a full retraining.
                                
                                // if (forCurrentModel) {
                                //     delay(1000).then(() => { // run async
                                //         //start the training again.  It won't run again if the instanceCount hasn't changed
                                //         setKickOffTraining(true);
                                //     })
                                // }
                            })
                        });

                        // start the training worker
                        trainingProgress.current = 0
                        alignmentTrainingWorkerRef.current.worker.postMessage({
                            type: START_TRAINING,
                            data: alignmentTrainingData
                        });
                    } catch (error) {
                        console.error("executeTraining() - Error during alignment training setup:", error);
                        console.log(`executeTraining() - Training failed after ${getElapsedMinutes(trainingStartTime)} minutes`);
                        cleanupWorker();
                        handleSetTrainingState?.({training: false, trainingFailed: 'Training Error'});
                    }

                } else {
                    console.log(`executeTraining() - Not enough training data for ${groupName}, count ${alignmentCount}`);
                    handleSetTrainingState?.({training: false, trainingFailed: 'Insufficient Training Data'});
                }

            } else {
                console.log("executeTraining() - Alignment training already running");
                handleSetTrainingState?.({trainingFailed: 'Insufficient Training Data'});
            }
        } else {
            console.log("executeTraining() - information not changed");
            handleSetTrainingState?.({trainingFailed: 'Information not changed'});
        }
    };

    /**
     * A callback function to stop the alignment training process. This function
     * performs cleanup operations and updates the training state when the alignment
     * training worker is active.
     *
     * Dependencies:
     * - `handleSetTrainingState` - Optional function to update the training state.
     * - `alignmentTrainingWorkerRef` - Reference to the alignment training worker.
     *
     * Operations performed:
     * - Logs the invocation of the stopTraining function.
     * - Checks if the alignment training worker is currently active.
     * - Calls the `handleSetTrainingState` function (if provided) to set the training state to false.
     * - Cleans up resources related to the alignment training worker.
     * - Logs the successful stoppage of alignment training.
     */
    const _stopTraining = useCallback(() => {
        console.log("stopTraining()");
        const trainingContextId = !!alignmentTrainingWorkerRef.current
        if (trainingContextId) {
            handleSetTrainingState?.({training: false, trainingFailed: 'Cancelled'});
            cleanupWorker();
            console.log("useAlignmentSuggestions - stopTraining() - Alignment training stopped");
        } else {
            console.log("useAlignmentSuggestions - stopTraining() - training not running");
        }
    }, [handleSetTrainingState]);

    /**
     * Retrieves the training context ID from the alignment training worker reference.
     *
     * @return {string|undefined} The training context ID if available, or undefined if not present.
     */
    function getTrainingContextId() {
        const trainingContextId = alignmentTrainingWorkerRef.current?.contextId;
        return trainingContextId;
    }

    /**
     * Checks whether the training process is being conducted within the same Bible and book context.
     *
     * This function compares the given context ID with the current alignment training worker's
     * context ID to determine if they correspond to the same Bible and book. It returns true
     * if both the Bible ID and book ID are the same; otherwise, false.
     *
     * @param {ContextId} contextId_ - The context ID to be compared, which includes the Bible ID
     * and book ID details.
     * @returns {boolean} - Returns true if the Bible ID and book ID in the provided context
     * match the corresponding IDs in the training context; otherwise, false.
     */
    const areTrainingSameBook = (contextId_: ContextId)=> {
        if (alignmentTrainingWorkerRef?.current !== null) {
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
     * Initiates the training process if it is not already running.
     * Logs the current state of the training process to the console.
     * When training is ready to start, invokes a private method `executeTraining`
     * and logs a message upon completion of the training.
     *
     * Preconditions:
     * - The `trainingRunning` variable must indicate that no training session is currently active.
     *
     * Side Effects:
     * - Outputs log messages to the console for debugging purposes.
     * - Calls `executeTraining` asynchronously when conditions are met.
     */
    const startTraining = useCallback(() => {
        const trainingRunning = !!alignmentTrainingWorkerRef.current
        console.log(`useAlignmentSuggestions - startTraining() - Starting, already running is: ${trainingRunning}`);
        if (!trainingRunning) {
            delay(500).then(() => { // run async
                executeTraining().then(() => {
                    console.log(`useAlignmentSuggestions - startTraining() - Training started`);
                });
            });
        }
    }, [handleSetTrainingState])
    
    /**
     * Determines whether the alignment training process is currently running.
     *
     * This is a callback function that checks if the `alignmentTrainingWorkerRef` has an active reference,
     * indicating that the training process is ongoing. It also logs the current status to the console.
     *
     * @returns {boolean} Returns `true` if the training process is running, otherwise `false`.
     */
    const isTraining = useCallback(() => {
        const trainingRunning = !!alignmentTrainingWorkerRef.current
        console.log(`useAlignmentSuggestions - isTraining() - Currently Training: ${trainingRunning}`);
        return trainingRunning;
    }, [])

    /**
     * Effect hook that manages the training process based on training state changes.
     *
     * This hook monitors changes to the kickOffTraining flag to start
     * the alignment training process. When flag changes, it introduces a small delay
     * before taking action to prevent rapid state changes.
     *
     * Behavior:
     * - uses kickOffTraining flag to determine if training should run
     * - Adds 500ms delay before executing training state changes
     * - Resets kickOffTraining flag when triggered
     * - Starts training process if flag is true
     *
     * Requirements:
     * - executeTraining() function must be defined
     * - delay() utility must be available
     * - trainingRunning state must track current training status
     *
     * @dependencies {boolean} kickOffTraining - Internal flag to restart training
     */
    useEffect(() => {
        const trainingRunning = !!alignmentTrainingWorkerRef.current
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
     * Asynchronously loads settings and model data from local storage.
     *
     * This function attempts to retrieve and parse data for predictive modeling
     * and language-based settings from persistent storage. If a valid model is found
     * in the storage, it initializes the alignment predictor and updates the training
     * state accordingly. It also retrieves and validates maximum complexity settings
     * specific to the language pair in use and applies those settings.
     *
     * @param {IndexedDBStorage} dbStorage - The persistent storage interface for retrieving stored data.
     * @param {string} modelKey - The key used to identify and load the predictive model from local storage.
     * @returns {Promise<boolean>} - A promise that resolves to true if the model was successfully loaded; otherwise, false.
     */
    const loadSettingsFromStorage = useCallback(async (dbStorage: IndexedDBStorage, modelKey: string) => {
        setState( { ...stateRef.current, failedToLoadCachedTraining: false});
        let success = false;
        
        if (modelKey) {
            //load the model.
            let predictorModel: AbstractWordMapWrapper | null = null; // default to null
            const modelStr: string | null = await dbStorage.getItem(modelKey);
            if (modelStr && modelStr !== "undefined") {
                const model = JSON.parse(modelStr);
                if (model !== null) {
                    try {
                        predictorModel = AbstractWordMapWrapper.load(model);
                        console.log('loaded alignmentPredictor from local storage');
                    } catch (e) {
                        console.log(`error loading alignmentPredictor: ${(e as Error).message}`);
                    }
                }
                if (predictorModel) {
                    alignmentPredictor.current = predictorModel;
                } else if (!trainingRunning) { // if training is running, then don't reset the alignmentPredictor
                    alignmentPredictor.current = null
                }
            }
            const trainingComplete = !!predictorModel;
            if (!trainingComplete) {
                console.log('no alignmentPredictor found in local storage');
                setState( { ...stateRef.current, failedToLoadCachedTraining: true});
            } else {
                success = true;
            }
            handleSetTrainingState?.({training: false, trainingComplete, trainingFailed: ''});

            // load language based settings
            const langSettingsPair = getLangPair(sourceLanguageId, targetLanguageId);
            let settings_: string | null = await dbStorage.getItem(langSettingsPair);
            let maxComplexity_ = DEFAULT_MAX_COMPLEXITY; // default to max complexity
            if (settings_ && settings_ !== "undefined") {
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
            }
            setState( { ...stateRef.current, maxComplexity: maxComplexity_});
            if (maxComplexity_ === DEFAULT_MAX_COMPLEXITY) {
                console.log(`maxComplexity not found in local storage, using default ${maxComplexity_}`);
            }
        }
        return success;
    }, [handleSetTrainingState]);

    /**
     * Retrieves an instance of IndexedDBStorage. If the storage has not been initialized,
     * it initializes the storage with the specified database name and object store name.
     *
     * @return {Promise<IndexedDBStorage>} A promise that resolves to the initialized IndexedDBStorage instance.
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
     * Effect hook that loads model settings and data from IndexedDB storage when aligned is shown.
     *
     * Initializes IndexedDB storage if not already done and loads saved alignment model
     * and settings when the modelKey changes or component becomes visible.
     *
     * Requirements:
     * - IndexedDBStorage class must be available
     * - loadSettingsFromStorage() function must be defined
     * - modelKey must be a valid string
     * - shown flag must be true
     *
     * Parameters tracked:
     * @param modelKey - String identifying the model to load
     * @param shown - Boolean flag indicating if component is visible
     */
    useEffect(() => {
        (async () => {
            let cachedDataLoaded = false;
            if (shown && modelKey && config?.doAutoTraining) {
                console.log(`useAlignmentSuggestions - modelKey changed to ${modelKey}`);
                const dbStorage = await getIndexedDbStorage();
                cachedDataLoaded = await loadSettingsFromStorage(dbStorage, modelKey);
                console.log(`useAlignmentSuggestions - cachedDataLoaded: ${cachedDataLoaded}`);
                
                // add the usfm for current book to training memory
                const bookId = contextId?.reference?.bookId;
                if (cachedDataLoaded && bookId && sourceUsfm && targetUsfm) {
                    loadTranslationMemoryWithBook(bookId, sourceUsfm, targetUsfm);
                }
            }
            prepareForNewContext()
        })();
    }, [modelKey, shown]);

    // Effect to load translation memory and start training when failure to load cached training Model
    useEffect(() => {
        if (failedToLoadCachedTraining && config?.doAutoTraining) {
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
                            startTraining();
                        }
                    }
                }
            }
        }
    }, [failedToLoadCachedTraining]);
    
    /**
     * Prepares the application context and state for initiating a training workflow.
     *
     * This function performs the following:
     * - Checks if a book is referenced in the current context and updates the current book name accordingly.
     * - Updates the current selection based on the context.
     * - Clones the current context (`contextId`) for safe manipulation.
     * - Compares the cloned context with the previous context reference to detect changes.
     * - If the context has changed, it:
     *   - Retrieves a new model key based on the updated context.
     *   - Logs a change in the context ID to the console for debugging.
     *   - Handles cases where no book is selected by resetting the training state to default values and stopping relevant background operations.
     * - Updates the reference to the latest context and current book name accordingly.
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
     * Retrieves the suggester function from the current alignment predictor instance.
     *
     * @return {TSuggester} The suggester function bound to the current alignment predictor instance, or null if unavailable.
     */
    function getSuggester(): TSuggester {
        return alignmentPredictor.current?.predict.bind(alignmentPredictor.current) || null;
    }

    /**
     * Saves the trained model and associated settings into local storage and invokes a callback function upon completion.
     *
     * @param {React.RefObject<IndexedDBStorage | null>} dbStorageRef - A reference to the IndexedDBStorage object used for saving data.
     * @param {TAlignmentCompletedInfo} alignmentCompletedInfo - An object containing information about the completed model alignment, including model key and metadata.
     * @param {THandleTrainingCompleted | null} handleTrainingCompleted - A nullable callback function to handle post-training completion logic.
     * @return {Promise<void>} A promise that resolves once the model and settings have been successfully saved, or if the storage is not ready.
     */
    async function saveModelAndSettings(alignmentCompletedInfo: TAlignmentCompletedInfo, handleTrainingCompleted: THandleTrainingCompleted | null) {
        const dbStorage = await getIndexedDbStorage();
        
        if (!dbStorage?.isReady()) {
            console.log("saveModelAndSettings() - storage not ready");
            return
        }

        const modelKey_ = alignmentCompletedInfo.modelKey;
        if (!modelKey_) {
            console.log("saveModelAndSettings() - modelKey not defined");
            return
        }

        console.log(`saveModelAndSettings() - saving model for ${modelKey_}`);

        // save model to local storage
        const abstractWordMapWrapper: AbstractWordMapWrapper = alignmentCompletedInfo.model;
        await dbStorageRef.current.setItem(modelKey_, JSON.stringify(abstractWordMapWrapper?.save()));

        await storeLanguagePreferences(alignmentCompletedInfo.sourceLanguageId, alignmentCompletedInfo.targetLanguageId, alignmentCompletedInfo.maxComplexity, dbStorageRef);

        console.log(`saveModelAndSettings() - setting maxComplexity to ${alignmentCompletedInfo.maxComplexity}`);

        handleTrainingCompleted?.(alignmentCompletedInfo);
    }

    const suggester: TSuggester = getSuggester()

    return { // see TUseAlignmentSuggestionsReturn interface definition
        state: {
            failedToLoadCachedTraining,
            maxComplexity,
            trainingState,
            trainingRunning,
        },
        actions: {
            areTrainingSameBook,
            cleanupWorker,
            getSuggester,
            getTrainingContextId,
            isTraining,
            loadTranslationMemory,
            loadTranslationMemoryWithBook,
            startTraining,
            stopTraining: _stopTraining,
            suggester,
        }
    };
};