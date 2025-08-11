import React, {useEffect, useRef, useState} from 'react'
import '../App.css'
import {bibleHelpers, SuggestingWordAligner} from 'word-aligner-rcl'
import GroupCollection from "@/shared/GroupCollection";
import IndexedDBStorage from "@/shared/IndexedDBStorage";
import {AbstractWordMapWrapper} from 'wordmapbooster';
import usfm from 'usfm-js';
import {
    isProvidedResourcePartiallySelected,
    isProvidedResourceSelected,
    limitRangeOfComplexity,
} from "@/utils/misc";
import {parseUsfmHeaders} from "@/utils/usfm_misc";
import delay from "@/utils/delay";
import Group from "@/shared/Group";
import Book from "@/shared/Book";
import AlignmentWorker from '../workers/AlignmentTrainer.worker';
import {
    AppState,
    ContextId,
    SourceWord,
    TAlignerStatus,
    TargetWordBank,
    THandleSetTrainingState,
    TrainingState,
    translationMemoryType
} from "@/common/classes";
import {Alignment, Suggestion} from "wordmap";
import {Token} from 'wordmap-lexer'
import {
    DEFAULT_MAX_COMPLEXITY,
    MIN_THRESHOLD_TRAINING_MINUTES,
    THRESHOLD_TRAINING_MINUTES,
    WORKER_TIMEOUT
} from "@/common/constants";

interface SuggestingWordAlignerProps {
    styles?: React.CSSProperties;
    contextId: ContextId;
    lexiconCache?: Record<string, any>;
    loadLexiconEntry: (lexiconId: string, entryId: string) => void;
    onChange?: (details: {
        type: 'MERGE_ALIGNMENT_CARDS' | 'CREATE_NEW_ALIGNMENT_CARD' | 'UNALIGN_TARGET_WORD' | 'ALIGN_TARGET_WORD' | 'ALIGN_SOURCE_WORD';
        source: 'TARGET_WORD_BANK' | 'GRID';
        destination: 'TARGET_WORD_BANK' | 'GRID';
        verseAlignments: Alignment[];
        targetWords: TargetWordBank[];
        contextId: ContextId;
    }) => void;
    showPopover: (
        PopoverTitle: React.ReactNode,
        wordDetails: React.ReactNode,
        positionCoord: any,
        rawData: {
            token: SourceWord;
            lexiconData: any;
        }
    ) => void;
    sourceLanguage: string;
    sourceLanguageFont?: string;
    sourceFontSizePercent?: number;
    targetLanguage: string;
    targetLanguageFont?: string;
    targetFontSizePercent?: number;
    translate: (key: string) => void;
    verseAlignments: Alignment[];
    targetWords: TargetWordBank[];
    hasRenderedSuggestions?: boolean;
    suggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Suggestion[];
    asyncSuggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Promise<Suggestion[]>;
    addTranslationMemory?: translationMemoryType;
    doTraining: boolean;
    handleSetTrainingState?: THandleSetTrainingState;
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

function defaultTrainingState(): TrainingState{
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

export const EnhancedWordAligner: React.FC<SuggestingWordAlignerProps> = (
{
   styles,
   contextId,
   lexiconCache,
   loadLexiconEntry,
   onChange,
   showPopover,
   sourceLanguage,
   sourceLanguageFont,
   sourceFontSizePercent,
   targetLanguage,
   targetLanguageFont,
   targetFontSizePercent,
   translate,
   verseAlignments,
   targetWords,
   hasRenderedSuggestions,
   asyncSuggester,
   addTranslationMemory,
   doTraining, 
   handleSetTrainingState,
}) => {
    
    const dbStorageRef = useRef<IndexedDBStorage | null>(null);

    const [state, _setState] = useState<AppState>(defaultAppState(contextId));
    //also hold the state in a ref so that callbacks can get the up-to-date information.
    //https://stackoverflow.com/a/60643670
    const stateRef = useRef<AppState>(state);
    function setState( newState: AppState ) {
        stateRef.current = newState;
        _setState( newState );
    }
    
    const [maxComplexity, setMaxComplexity]  = useState<number>(DEFAULT_MAX_COMPLEXITY);
    const [currentBookName, setCurrentBookName]  = useState<string>(contextId?.reference?.bookId || '');
    const [trainingState, _setTrainingState] = useState<TrainingState>(defaultTrainingState())
    const trainingStateRef = useRef<TrainingState>(trainingState);
    function setTrainingState( newState: TrainingState ) {
        trainingStateRef.current = newState;
        _setTrainingState( newState );
    }
    
    const alignmentTrainingWorkerRef = useRef<Worker | null>(null);
    const alignmentTestingWorkerRef  = useRef<Worker | null>(null);
    const workerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const {groupCollection, scope, currentSelection, doubleClickedVerse, alignerStatus } = state;

    const alignmentPredictor = useRef< AbstractWordMapWrapper | null >( null );

    const setGroupCollection = (newGroupCollection: GroupCollection ) => {
        setState( { ...stateRef.current, groupCollection: newGroupCollection } );
    }

    const onScopeChange = (newScope: string) =>{
        setState( { ...stateRef.current, scope: newScope } );
    }

    const setCurrentSelection = (newCurrentSelection: string[][] ) => {
        setState( { ...stateRef.current, currentSelection: newCurrentSelection } );
    }

    const setDoubleClickedVerse = (newDoubleClickedVerse: string[] | null ) => {
        setState( {...stateRef.current, doubleClickedVerse: newDoubleClickedVerse } );
    }

    const setAlignerStatus = (newAlignerStatus: TAlignerStatus | null ) => {
        setState( {...stateRef.current, alignerStatus: newAlignerStatus } );
    }
    const setIsTrainingEnabled = (newIsTrainingEnabled: boolean) => {
        setTrainingState( {...trainingStateRef.current, isTrainingEnabled: newIsTrainingEnabled } );
    }

    /**
     * Checks to see if a specific string array references a given resource.
     * The locations in the string are [group][book name][chapter num][verse num]
     * The array only needs to be as long as the granularity.
     * @param resourceKey A string array identifying resource at some granularity
     * @returns true if the referenced resource is selected.
     */
    const isResourceSelected = ( resourceKey: string[] ):boolean => {
        return isProvidedResourceSelected( currentSelection, resourceKey );
    }

    /**
     * Checks to see if a specific string array intercepts a given resource.
     * The locations in the string are [group][book name][chapter num][verse num]
     * The array only needs to be as long as the granularity.
     * @param resourceKey A string array identifying resource at some granularity
     * @returns true if the referenced resource is selected.
     */
    const isResourcePartiallySelected = ( resourceKey: string[] ):boolean => {
        return isProvidedResourcePartiallySelected( currentSelection, resourceKey );
    }
    
    /**
     * Loads translation memory data into the component state
     * @param translationMemory Object containing source and target USFM translation data
     * @throws Error if no resources are selected or if USFM content is missing
     */
    const loadTranslationMemory = async ( translationMemory: translationMemoryType ) => {
        //ask the user to make a selection if no resources are selected.
        if( currentSelection.length == 0 ) {
            throw new Error("No resources selected to add to.");
        }

        if( ! translationMemory?.targetUsfms ) {
            throw new Error("No USFM source content to add");
        }

        let newGroupCollection_ = groupCollection;
        const group_name = contextId?.bibleId || ''
        let currentBookName_ = contextId?.reference?.bookId || '';

        // if group doesn't exist, then add
        if ( ! newGroupCollection_.groups?.[group_name]) {
            const newBooks: {[key:string]:Book} = {};
            // need to get the books
            Object.entries(translationMemory?.targetUsfms).forEach(([bookId,usfm_book])=>{
                const usfm_json = usfm.toJSON(usfm_book, { convertToInt: ['occurrence','occurrences']});
                
                const usfmHeaders = parseUsfmHeaders(usfm_json.headers);
                const toc3Name = usfmHeaders.toc3; //label to use
                const currentBookId = contextId?.reference?.bookId;
                if (bookId === currentBookId) {
                    currentBookName_ = usfmHeaders.h;
                }
                const newBook = new Book( {chapters:{}, filename: bookId,toc3Name,targetUsfmBook:null,sourceUsfmBook:null} );
                newBooks[bookId] = newBook.addTargetUsfm({filename: bookId,usfm_book: usfm_json,toc3Name});
            });
            
            const newGroup: Group = newGroupCollection_.groups[group_name] || new Group(newBooks);
            const newGroups = {...newGroupCollection_.groups, [group_name]: newGroup};
            const newGroupCollection = new GroupCollection(newGroups, newGroupCollection_.instanceCount + 1);
            newGroupCollection_ = newGroupCollection;
            setCurrentBookName(currentBookName_);
        }

        // #######################################################
        // load the source usfms.
        try{
            if( ! translationMemory?.sourceUsfms ) {
                throw new Error("No USFM source content to add");
            }

            const usfm_json = Object.fromEntries( Object.entries(translationMemory?.sourceUsfms).map(([key,value]) => [key, usfm.toJSON(value, { convertToInt: ['occurrence','occurrences'] })]));

            // always selected
            const isResourceSelected_ = ( resourceKey: string[] ):boolean => {
                return true;
            }

            //it would be good to come back to this and add confirmation
            //if the pairing is changing an existing pairing.

            const {newGroupCollection, addedVerseCount, droppedVerseCount } = newGroupCollection_.addSourceUsfm( {usfm_json, isResourceSelected: isResourceSelected_} );
            newGroupCollection_ = newGroupCollection;
            setGroupCollection( newGroupCollection_ );

            //await showMessage( `Attached ${addedVerseCount} verses\nDropped ${droppedVerseCount} verses.`);
            // await showMessage( `${addedVerseCount} connections added.`);
            console.log( `${addedVerseCount} connections added.`);

        } catch( error ){
            //user declined
            console.error( `error importing ${error}` );
            // await showMessage( `Error ${error}`)
        }
    };

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
    };

    function adjustMaxComplexity(reductionFactor: number) {
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
    function startTraining(){
        //Use the Refs such as trainingStateRef instead of trainingState
        //because in the callback the objects are stale because they were
        //captured from a previous invocation of the function and don't
        //have later versions of the function in which things have been updated.
        //startTraining itself gets called from within the callback so itself is
        //a callback needs to use the Refs.
        //https://stackoverflow.com/a/60643670

        //make sure that lastUsedInstanceCount isn't still the same as groupCollection.instanceCount
        if( trainingStateRef.current.lastTrainedInstanceCount !== stateRef.current.groupCollection.instanceCount ){
            if( alignmentTrainingWorkerRef.current === null ){

                //before creating the worker, check to see if there is any data to train on.
                //get the information for the alignment to training.
                const alignmentTrainingData = stateRef.current.groupCollection.getAlignmentDataAndCorpusForTrainingOrTesting( {forTesting: false, getCorpus:true} );
                
                alignmentTrainingData.contextId = contextId;
                alignmentTrainingData.contextId.bookName = currentBookName || alignmentTrainingData.contextId?.reference?.bookId;
                alignmentTrainingData.maxComplexity = maxComplexity;
                
                //check if there are enough entries in the alignment training data dictionary
                if( Object.values(alignmentTrainingData.alignments).length > 4 ){
                    handleSetTrainingState?.(true, trained);

                    const trainingStartTime = Date.now();
                    
                    try { // background processing
                        console.log(`start training for ${stateRef.current.groupCollection.instanceCount}`);

                        setTrainingState( {...trainingStateRef.current, currentTrainingInstanceCount: stateRef.current.groupCollection.instanceCount } );
                        // Capture start time

                        //create a new worker.
                        // alignmentTrainingWorkerRef.current = new Worker( new URL("../workers/AlignmentTrainer.ts", import.meta.url ) );
                        alignmentTrainingWorkerRef.current = new AlignmentWorker();

                        // Set up a worker timeout
                        workerTimeoutRef.current = setTimeout(() => {
                            const elapsedMinutes1 = getElapsedMinutes(trainingStartTime);
                            console.log(`Training Worker timeout after ${elapsedMinutes1} minutes`);

                            adjustMaxComplexity(0.75);

                            cleanupWorker();
                            
                            setTrainingState( {...trainingStateRef.current, lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount } );
                            handleSetTrainingState?.(false, trained);
                            
                            // Restart training if needed
                            startTraining();
                        }, WORKER_TIMEOUT);

                        //Define the callback which will be called after the alignment trainer has finished
                        alignmentTrainingWorkerRef.current.addEventListener('message', (event) => {
                            // Calculate elapsed time in minutes
                            console.log(`alignment training worker message: ${event.data}`);

                            // Clear timeout since worker completed successfully
                            cleanupWorker();

                            //Load the trained model and put it somewhere it can be used.
                            const elapsedMinutes = getElapsedMinutes(trainingStartTime);
                            console.log(`Training completed in ${elapsedMinutes} minutes`);
                            if (elapsedMinutes > THRESHOLD_TRAINING_MINUTES) {
                                console.log(`Worker took over ${THRESHOLD_TRAINING_MINUTES} minutes`);
                                adjustMaxComplexity(THRESHOLD_TRAINING_MINUTES/elapsedMinutes);
                            } else if (event.data?.trimmedVerses && elapsedMinutes < MIN_THRESHOLD_TRAINING_MINUTES) { // if we have trimmed verses, but time is below threshold, bump up complexity limit so we can train with more data
                                const targetTime = (THRESHOLD_TRAINING_MINUTES + MIN_THRESHOLD_TRAINING_MINUTES) / 2;
                                const adjustComplexity = (targetTime / elapsedMinutes);
                                console.log(`Worker took under ${MIN_THRESHOLD_TRAINING_MINUTES} minutes, adjusting complexity by ${adjustComplexity}`);
                                adjustMaxComplexity(adjustComplexity);
                            }
                            
                            if( "trainedModel" in event.data ){
                                alignmentPredictor.current = AbstractWordMapWrapper.load( event.data.trainedModel );
                                // @ts-ignore
                                console.log(`Number of alignments: ${alignmentPredictor.current.alignmentStash?.length}`)
                            }
                            if( "error" in event.data ){
                                console.log( "Error running alignment worker: " + event.data.error );
                            }
                    
                            setTrainingState( {...trainingStateRef.current, lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount } );
                            handleSetTrainingState?.(false, trained); 
                            //start the training again.  It won't run again if the instanceCount hasn't changed
                            startTraining();
                        });
                    
                        alignmentTrainingWorkerRef.current.postMessage( {
                            type: "startTraining",
                            data: alignmentTrainingData
                        } );
                    } catch (error) {
                        console.error("Error during alignment training setup:", error);
                        console.log(`Training failed after ${getElapsedMinutes(trainingStartTime)} minutes`);
                        cleanupWorker();
                        handleSetTrainingState?.(false, trained);
                    }

                } else {
                    console.log( "Not enough training data" );
                    handleSetTrainingState?.(false, trained);
                }

            } else {
                console.log("Alignment training already running" );
                handleSetTrainingState?.(false, trained);
            }
        } else {
            console.log( "information not changed" );
            handleSetTrainingState?.(false, trained);
        }
    }

    /**
     * Stops any active alignment training by terminating the worker
     */
    function stopTraining() {
        console.log( "stopTraining() clicked" );
        if( alignmentTrainingWorkerRef.current !== null ){
            handleSetTrainingState?.(false, trained);
            cleanupWorker();
            console.log( "Alignment training stopped" );
        }
    }

    // Effect to load translation memory when it changes
    useEffect(() => {
        if (addTranslationMemory && Object.keys(addTranslationMemory).length > 0) {
            loadTranslationMemory(addTranslationMemory);
        }
    }, [addTranslationMemory]);
    
    useEffect(() => {
        setCurrentSelection( getSelectionFromContext(contextId) );
    }, [contextId]);

    useEffect(() => {
        console.log( `doTraining changed to ${doTraining}, trainingRunning currently ${trainingRunning}`);
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

    function getLangPair() {
        return `settings_${targetLanguage}_${sourceLanguage}`;
    }

    function getModelKey():string {
        let modelKey_ = '';
        const bookId = contextId?.reference?.bookId;
        const bibleId = contextId?.bibleId;
        if (bibleId && bookId) {
            const testament = bibleHelpers.isNewTestament(bookId) ? 'NT' : 'OT';
            modelKey_ = `${bibleId}_${testament}_${bookId}}`;
        }
        return modelKey_
    }

    const modelKey = getModelKey()

    async function loadSettingsFromStorage(dbStorage: IndexedDBStorage, modelKey:string) {
        if (modelKey) {
            //load the model.
            let predictorModel: AbstractWordMapWrapper = null; // default to null
            const modelStr: string | null = await dbStorage.getItem(modelKey);
            if (modelStr && modelStr !== "undefined") {
                const model = JSON.parse(modelStr);
                if (model !== null) {
                    try {
                        predictorModel = AbstractWordMapWrapper.load(model);
                        console.log('loaded alignmentPredictor from local storage');
                    } catch (e: any) {
                        console.log(`error loading alignmentPredictor: ${e.message}`);
                    }
                }
            }
            alignmentPredictor.current = predictorModel;
            const trainingComplete = !!predictorModel;
            if (!trainingComplete) {
                console.log('no alignmentPredictor found in local storage');
            }
            handleSetTrainingState?.(false, trainingComplete);
            
            // load language based settings
            const langSettingsPair = getLangPair();
            let settings_: string | null = await dbStorage.getItem(langSettingsPair);
            let maxComplexity_ = DEFAULT_MAX_COMPLEXITY; // default to max complexity
            if (settings_  && settings_ !== "undefined") {
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
    }

    //here we load from "local storage".
    useEffect(() => {
        return () => {
            cleanupWorker();
        };
    },[]);
    
    useEffect(() => { // Also save the model to local storage.
        (async () => {
            if (modelKey && (trainingStateRef?.current?.lastTrainedInstanceCount > 0)) {
                if (dbStorageRef.current == null) return;
                if (!dbStorageRef.current.isReady()) return;

                await dbStorageRef.current.setItem(modelKey, JSON.stringify(alignmentPredictor.current?.save()));
                
                const langSettingsPair = getLangPair();
                const settings = {
                    maxComplexity,
                }
                await dbStorageRef.current.setItem(langSettingsPair, JSON.stringify(settings));
            }
        })();
    }, [trainingStateRef?.current?.lastTrainedInstanceCount]);

    useEffect(() => {
        (async () => {
            if (modelKey) {
                if (!dbStorageRef.current) { // if not initialized
                    const dbStorage = new IndexedDBStorage( 'app-state', 'dataStore' );
                    await dbStorage.initialize();
                    console.log( `IndexedDBStorage initialized ${dbStorage.isReady()}` );

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
    }, [contextId]);

    const suggester= alignmentPredictor.current?.predict.bind(alignmentPredictor.current) || null
    
    return (
        <SuggestingWordAligner
            styles={styles}
            verseAlignments={verseAlignments}
            targetWords={targetWords}
            translate={translate}
            contextId={contextId}
            targetLanguageFont={targetLanguageFont}
            sourceLanguage={sourceLanguage}
            showPopover={showPopover}
            lexiconCache={lexiconCache}
            loadLexiconEntry={loadLexiconEntry}
            onChange={onChange}
            sourceLanguageFont={sourceLanguageFont}
            sourceFontSizePercent={sourceFontSizePercent}
            targetFontSizePercent={targetFontSizePercent}
            hasRenderedSuggestions={hasRenderedSuggestions}
            suggester={suggester}
        />
    )
}