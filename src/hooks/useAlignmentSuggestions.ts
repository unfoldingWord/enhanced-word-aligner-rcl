import { useState, useRef, useEffect, useCallback } from 'react';
import { AbstractWordMapWrapper } from 'wordmapbooster';
import { bibleHelpers } from 'word-aligner-rcl';
import usfm from 'usfm-js';
import { parseUsfmHeaders } from "@/utils/usfm_misc";
import delay from "@/utils/delay";
import Group from "@/shared/Group";
import Book from "@/shared/Book";
import GroupCollection from "@/shared/GroupCollection";
import IndexedDBStorage from "@/shared/IndexedDBStorage";
// Remove the static import
// import AlignmentWorker from '../workers/AlignmentTrainer.worker';
import { limitRangeOfComplexity } from "@/utils/misc";
import {
    TrainingState,
    ContextId,
    translationMemoryType,
    THandleSetTrainingState,
    AppState
} from "@/common/classes";
import {
    DEFAULT_MAX_COMPLEXITY,
    WORKER_TIMEOUT,
    THRESHOLD_TRAINING_MINUTES,
    MIN_THRESHOLD_TRAINING_MINUTES
} from "@/common/constants";

// console.log("useAlignmentSuggestions.ts AlignmentWorker", AlignmentWorker);

interface useAlignmentSuggestionsProps {
    contextId: ContextId;
    doTraining: boolean; // triggers start of training when it changes from false to true
    handleSetTrainingState?: THandleSetTrainingState;
    sourceLanguage: string;
    targetLanguage: string;
}

interface useAlignmentSuggestionsReturn {
    cleanupWorker: () => void;
    failedToLoadCachedTraining: boolean;
    loadTranslationMemory: (translationMemory: translationMemoryType) => Promise<void>;
    maxComplexity: number;
    suggester: ((sourceSentence: any, targetSentence: any, maxSuggestions?: number, manuallyAligned?: any[]) => any[]) | null;
    trainingState: TrainingState;
    trainingRunning: boolean;
    trained: boolean;
}

function getSelectionFromContext(contextId: ContextId) {
    const currentSelection = [
        [contextId?.bibleId || '', contextId?.reference?.bookId || '']
    ]
    return currentSelection;
}

function defaultAppState(contextId: ContextId): AppState{
    const currentSelection = getSelectionFromContext(contextId);
    const newGroups : {[key:string]: Group} = {};
    const groupCollection = new GroupCollection(newGroups, 0);
    return {
        groupCollection,
        scope: "Book",
        currentSelection,
        doubleClickedVerse: null,
        alignerStatus: null,
    }
}

function defaultTrainingState(): TrainingState {
    return {
        isTrainingEnabled: false,
        isTestingEnabled: false,
        trainingStatusOutput: "",
        lastTrainedInstanceCount: -1,
        currentTrainingInstanceCount: -1,
        lastTestAlignedCount: -1,
        currentTestingInstanceCount: -1,
        testResults: null,
    }
}

function getElapsedMinutes(trainingStartTime: number) {
    return (Date.now() - trainingStartTime) / (1000 * 60);
}

export const useAlignmentSuggestions = ({
    contextId,
    sourceLanguage,
    targetLanguage,
    doTraining,
    handleSetTrainingState,
}: useAlignmentSuggestionsProps): useAlignmentSuggestionsReturn => {
    const dbStorageRef = useRef<IndexedDBStorage | null>(null);

    const [state, _setState] = useState<AppState>(defaultAppState(contextId));
    //also hold the state in a ref so that callbacks can get the up-to-date information.
    //https://stackoverflow.com/a/60643670
    const stateRef = useRef<AppState>(state);
    function setState( newState: AppState ) {
        stateRef.current = newState;
        _setState( newState );
    }
    
    const [maxComplexity, setMaxComplexity] = useState<number>(DEFAULT_MAX_COMPLEXITY);
    const [currentBookName, setCurrentBookName]  = useState<string>(contextId?.reference?.bookId || '');
    const [trainingState, _setTrainingState] = useState<TrainingState>(defaultTrainingState())
    const trainingStateRef = useRef<TrainingState>(trainingState);
    const [failedToLoadCachedTraining, setFailedToLoadCachedTraining] = useState<boolean>(false)

    function setTrainingState(newState: TrainingState) {
        trainingStateRef.current = newState;
        _setTrainingState(newState);
    }

    const alignmentTrainingWorkerRef = useRef<Worker | null>(null);
    const workerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const {groupCollection, scope, currentSelection, doubleClickedVerse, alignerStatus } = state;

    const alignmentPredictor = useRef<AbstractWordMapWrapper | null>(null);

    const setGroupCollection = (newGroupCollection: GroupCollection ) => {
        setState( { ...stateRef.current, groupCollection: newGroupCollection } );
    }
    const setCurrentSelection = (newCurrentSelection: string[][] ) => {
        setState( { ...stateRef.current, currentSelection: newCurrentSelection } );
    }

    /**
     * Loads translation memory data into the component state
     * @param translationMemory Object containing source and target USFM translation data
     * @throws Error if no resources are selected or if USFM content is missing
     */
    const loadTranslationMemory = useCallback(async (translationMemory: translationMemoryType) => {
        //ask the user to make a selection if no resources are selected.
        if (currentSelection.length == 0) {
            throw new Error("No resources selected to add to.");
        }

        if (!translationMemory?.targetUsfms) {
            throw new Error("No USFM source content to add");
        }

        let newGroupCollection_ = stateRef.current.groupCollection;
        const group_name = contextId?.bibleId || ''
        let currentBookName_ = contextId?.reference?.bookId || '';

        // if group doesn't exist, then add
        if (!newGroupCollection_.groups?.[group_name]) {
            const newBooks: { [key: string]: Book } = {};
            // need to get the books
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

            const newGroup: Group = newGroupCollection_.groups[group_name] || new Group(newBooks);
            const newGroups = { ...newGroupCollection_.groups, [group_name]: newGroup };
            const newGroupCollection = new GroupCollection(newGroups, newGroupCollection_.instanceCount + 1);
            newGroupCollection_ = newGroupCollection;
            setCurrentBookName(currentBookName_);
        }

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
            setGroupCollection(newGroupCollection_);

            console.log(`${addedVerseCount} connections added.`);

        } catch (error) {
            console.error(`error importing ${error}`);
            throw new Error("Failed to load source data");
        }
    }, [contextId, currentSelection, stateRef, setGroupCollection, setCurrentBookName]);

    const trainingRunning = !!alignmentTrainingWorkerRef.current
    const trained = !!alignmentPredictor.current

    /**
     * Cleans up worker resources by terminating the worker and clearing the timeout
     */
    const cleanupWorker = () => {
        if (workerTimeoutRef.current) {
            clearTimeout(workerTimeoutRef.current);
            workerTimeoutRef.current = null;
        }
        if (alignmentTrainingWorkerRef.current) {
            alignmentTrainingWorkerRef.current.terminate();
            alignmentTrainingWorkerRef.current = null;
        }
    }

    /**
     * Adjusts the maximum complexity value based on a given reduction factor.
     *
     * This function calculates a new maximum complexity by multiplying the current
     * maximum complexity with the provided reduction factor and rounding the result
     * up to the nearest integer. The resulting value is then constrained within
     * a predefined acceptable range of complexity values. Finally, the adjusted
     * maximum complexity value is applied and logged for reference.
     *
     * @param {number} reductionFactor - A multiplier that reduces the current maximum complexity.
     *                                    Should typically be within the range of 0 to 1.
     */
    const adjustMaxComplexity = (reductionFactor: number) => {
        let newMaxComplexity = Math.ceil(maxComplexity * reductionFactor);
        newMaxComplexity = limitRangeOfComplexity(newMaxComplexity);
        console.log(`Adjusting maxComplexity from ${maxComplexity} to ${newMaxComplexity}`);
        setMaxComplexity(newMaxComplexity);
    }

    /**
     * Starts the alignment training process using a web worker
     * Only runs if there have been changes since last training and enough training data exists
     * Updates training state and alignment predictor with trained model results
     * Includes a timeout that is cleared if worker completes sooner
     */
    const startTraining = async () => {
        //Use the Refs such as trainingStateRef instead of trainingState
        //because in the callback the objects are stale because they were
        //captured from a previous invocation of the function and don't
        //have later versions of the function in which things have been updated.
        //startTraining itself gets called from within the callback so itself is
        //a callback needs to use the Refs.
        //https://stackoverflow.com/a/60643670

        //make sure that lastUsedInstanceCount isn't still the same as groupCollection.instanceCount
        if (trainingStateRef.current.lastTrainedInstanceCount !== stateRef.current.groupCollection.instanceCount) {
            if (alignmentTrainingWorkerRef.current === null) {

                //before creating the worker, check to see if there is any data to train on.
                //get the information for the alignment to training.
                const alignmentTrainingData = stateRef.current.groupCollection.getAlignmentDataAndCorpusForTrainingOrTesting({ forTesting: false, getCorpus: true });

                alignmentTrainingData.contextId = contextId;
                alignmentTrainingData.contextId.bookName = currentBookName || alignmentTrainingData.contextId?.reference?.bookId;
                alignmentTrainingData.maxComplexity = maxComplexity;

                //check if there are enough entries in the alignment training data dictionary
                if (Object.values(alignmentTrainingData.alignments).length > 4) {
                    handleSetTrainingState?.(true, trained);

                    const trainingStartTime = Date.now(); // Capture start time

                    try { // background processing
                        console.log(`start training for ${stateRef.current.groupCollection.instanceCount}`);

                        setTrainingState({ ...trainingStateRef.current, currentTrainingInstanceCount: stateRef.current.groupCollection.instanceCount });

                        // Create worker using dynamic import
                        alignmentTrainingWorkerRef.current = await createAlignmentTrainingWorker();

                        // Set up a worker timeout
                        workerTimeoutRef.current = setTimeout(() => {
                            const elapsedMinutes1 = getElapsedMinutes(trainingStartTime);
                            console.log(`Training Worker timeout after ${elapsedMinutes1} minutes`);

                            adjustMaxComplexity(0.75);

                            cleanupWorker();

                            setTrainingState({ ...trainingStateRef.current, lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount });
                            handleSetTrainingState?.(false, trained);

                            // Restart training if needed
                            startTraining();
                        }, WORKER_TIMEOUT);

                        //Define the callback which will be called after the alignment trainer has finished
                        alignmentTrainingWorkerRef.current.addEventListener('message', (event) => {
                            console.log(`alignment training worker message: ${event.data}`);

                            // Clear timeout since worker completed successfully
                            cleanupWorker();

                            //Load the trained model and put it somewhere it can be used.
                            const elapsedMinutes = getElapsedMinutes(trainingStartTime);
                            console.log(`Training completed in ${elapsedMinutes} minutes`);
                            if (elapsedMinutes > THRESHOLD_TRAINING_MINUTES) {
                                console.log(`Worker took over ${THRESHOLD_TRAINING_MINUTES} minutes`);
                                adjustMaxComplexity(THRESHOLD_TRAINING_MINUTES / elapsedMinutes);
                            } else if (event.data?.trimmedVerses && elapsedMinutes < MIN_THRESHOLD_TRAINING_MINUTES) { // if we have trimmed verses, but time is below threshold, bump up complexity limit so we can train with more data
                                const targetTime = (THRESHOLD_TRAINING_MINUTES + MIN_THRESHOLD_TRAINING_MINUTES) / 2;
                                const adjustComplexity = (targetTime / elapsedMinutes);
                                console.log(`Worker took under ${MIN_THRESHOLD_TRAINING_MINUTES} minutes, adjusting complexity by ${adjustComplexity}`);
                                adjustMaxComplexity(adjustComplexity);
                            }

                            if ("trainedModel" in event.data) {
                                alignmentPredictor.current = AbstractWordMapWrapper.load(event.data.trainedModel);
                                // @ts-ignore
                                console.log(`Number of alignments: ${alignmentPredictor.current?.alignmentStash?.length}`)
                            }
                            if ("error" in event.data) {
                                console.log("Error running alignment worker: " + event.data.error);
                            }

                            setTrainingState({ ...trainingStateRef.current, lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount });
                            handleSetTrainingState?.(false, trained);
                            //start the training again.  It won't run again if the instanceCount hasn't changed
                            startTraining();
                        });

                        alignmentTrainingWorkerRef.current.postMessage({
                            type: "startTraining",
                            data: alignmentTrainingData
                        });
                    } catch (error) {
                        console.error("Error during alignment training setup:", error);
                        console.log(`Training failed after ${getElapsedMinutes(trainingStartTime)} minutes`);
                        cleanupWorker();
                        handleSetTrainingState?.(false, trained);
                    }

                } else {
                    console.log("Not enough training data");
                    handleSetTrainingState?.(false, trained);
                }

            } else {
                console.log("Alignment training already running");
                handleSetTrainingState?.(false, trained);
            }
        } else {
            console.log("information not changed");
            handleSetTrainingState?.(false, trained);
        }
    };

    /**
     * A callback function to stop the alignment training process. This function
     * performs cleanup operations and updates the training state when the alignment
     * training worker is active.
     *
     * Dependencies:
     * - `trained` - Used to reference the current training state.
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
    const stopTraining = () => {
        console.log("stopTraining() clicked");
        if (alignmentTrainingWorkerRef.current !== null) {
            handleSetTrainingState?.(false, trained);
            cleanupWorker();
            console.log("Alignment training stopped");
        }
    };

    useEffect(() => {
        console.log(`doTraining changed to ${doTraining}, trainingRunning currently ${trainingRunning}`);
        if (doTraining !== trainingRunning) { // check if training change
            delay(500).then(() => { // run async
                if (doTraining) {
                    startTraining();
                } else {
                    stopTraining();
                }
            })
        }
    }, [doTraining]);

    /**
     * Generates a language pair string used for settings based on the target and source languages.
     *
     * @returns {string} A string representing the language pair in the format "settings_{targetLanguage}_{sourceLanguage}".
     */
    const getLangPair = (): string => {
        return `settings_${targetLanguage}_${sourceLanguage}`;
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
    const getModelKey = (): string => {
        let modelKey_ = '';
        const bookId = contextId?.reference?.bookId;
        const bibleId = contextId?.bibleId;
        if (bibleId && bookId) {
            const testament = bibleHelpers.isNewTestament(bookId) ? 'NT' : 'OT';
            modelKey_ = `${bibleId}_${testament}_${bookId}`;
        }
        return modelKey_
    }

    const modelKey = getModelKey()

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
     */
    const loadSettingsFromStorage = useCallback(async (dbStorage: IndexedDBStorage, modelKey: string) => {
        setFailedToLoadCachedTraining(false);
        
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
            }
            alignmentPredictor.current = predictorModel;
            const trainingComplete = !!predictorModel;
            if (!trainingComplete) {
                console.log('no alignmentPredictor found in local storage');
                setFailedToLoadCachedTraining(true);
            }
            handleSetTrainingState?.(false, trainingComplete);

            // load language based settings
            const langSettingsPair = getLangPair();
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
            setMaxComplexity(maxComplexity_);
            if (maxComplexity_ === DEFAULT_MAX_COMPLEXITY) {
                console.log(`maxComplexity not found in local storage, using default ${maxComplexity_}`);
            }
        }
    }, [handleSetTrainingState]);

    useEffect(() => { // Save the updated model to local storage.
        (async () => {
            if (modelKey && (trainingStateRef?.current?.lastTrainedInstanceCount > 0)) {
                if (dbStorageRef.current == null) return;
                if (!dbStorageRef.current.isReady()) return;

                // save model to local storage
                await dbStorageRef.current.setItem(modelKey, JSON.stringify(alignmentPredictor.current?.save()));

                // save language-based settings to local storage
                const langSettingsPair = getLangPair();
                const settings = {
                    maxComplexity,
                }
                await dbStorageRef.current.setItem(langSettingsPair, JSON.stringify(settings));
            }
        })();
    }, [trainingStateRef?.current?.lastTrainedInstanceCount]);


    /**
     * Effect hook that handles loading settings and model data from storage when modelKey changes.
     *
     * Initializes IndexedDBStorage if needed and loads saved settings. Updates dbStorageRef only
     * after loading completes to prevent stale data overwrites.
     */
    useEffect(() => {
        (async () => {
            if (modelKey) {
                console.log(`modelKey changed to ${modelKey}`);
                if (!dbStorageRef.current) { // if not initialized
                    const dbStorage = new IndexedDBStorage('app-state', 'dataStore');
                    await dbStorage.initialize();
                    console.log(`IndexedDBStorage initialized ${dbStorage.isReady()}`);

                    await loadSettingsFromStorage(dbStorage, modelKey);

                    //don't set the reference to the dbStorage for setting until after
                    //we have finished loading so that data which is stale doesn't overwrite
                    //the data we are wanting to load.
                    dbStorageRef.current = dbStorage;
                } else {
                    await loadSettingsFromStorage(dbStorageRef.current, modelKey);
                }
            }
        })();
    }, [modelKey]);
    
    useEffect(() => {
        setCurrentSelection( getSelectionFromContext(contextId) );
    }, [contextId]);
    
    const suggester = alignmentPredictor.current?.predict.bind(alignmentPredictor.current) || null

    return {
        cleanupWorker,
        failedToLoadCachedTraining,
        loadTranslationMemory,
        maxComplexity,
        trainingState,
        trainingRunning,
        trained,
        suggester
    };
};