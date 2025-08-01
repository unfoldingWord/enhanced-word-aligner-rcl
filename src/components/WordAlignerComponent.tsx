import React, {useEffect, useRef, useState} from 'react'
import '../App.css'
import {
    SuggestingWordAligner,
    TAlignerData,
    TReference,
    TSourceTargetAlignment,
    TWord
} from 'suggesting-word-aligner-rcl'
import GroupCollection from "@/shared/GroupCollection";
import {TWordAlignmentTestResults} from "@/workers/WorkerComTypes";
import IndexedDBStorage from "@/shared/IndexedDBStorage";
import {AbstractWordMapWrapper} from 'wordmapbooster';
import usfm from 'usfm-js';
import {isProvidedResourcePartiallySelected, isProvidedResourceSelected} from "@/utils/misc";
import {parseUsfmHeaders} from "@/utils/usfm_misc";
import delay from "@/utils/delay";
import Group from "@/shared/Group";
import Book from "@/shared/Book";
import AlignmentWorker from '../workers/AlignmentTrainer.worker';

export interface TWordAlignerAlignmentResult{
    targetWords: TWord[];
    verseAlignments: TSourceTargetAlignment[];
}

export interface TState{
    aligned: boolean
    sourceLanguage: string
    targetLanguage: string
    reference: TReference;
    alignerData: TAlignerData;
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

interface AppState {
    groupCollection: GroupCollection; //This contains all the verse data loaded in a hierarchical structure of Groups->Books->Chapter->Verses
    scope: string;  //This is Book, Group, Chapter or Verse.  It changes how the list is shown.
    currentSelection: string[][]; //This contains a collection of the references to all the things selected in the list.
    doubleClickedVerse: string[] | null; //This gets set when a verse is double clicked.
    alignerStatus: TAlignerStatus | null; //This gets set to pop up the word aligner dialog.
}

interface TrainingState{
    isTrainingEnabled: boolean; //This is true when the training checkbox is checked
    isTestingEnabled: boolean; //This is true when the testing is enabled
    trainingStatusOutput: string; //Setting this shows up on the toolbar and lets the training have a place to give live output status.
    lastTrainedInstanceCount: number; //This lets us know if something has changed since last training by comparing it to groupCollection.instanceCount
    currentTrainingInstanceCount: number; //This keeps track of what is currently training so that when it finishes lastTrainedInstanceCount can be set.
    lastTestAlignedCount: number; //This count keeps track of which alignment model count was last used to update test alignments.
    currentTestingInstanceCount: number; //This keeps track of what is currently testing so that when it finishes lastTestAlignedCount can be set.
    testResults: TWordAlignmentTestResults | null; //This holds the last results which were returned from the testing thread.
}

interface ContextId {
    reference: {
        bookId: string;
        chapter: number;
        verse: number;
    };
    tool: string;
    groupId: string;
    bibleId: string;
}

interface SourceWord {
    index: number;
    occurrence: number;
    occurrences: number;
    text: string;
    lemma: string;
    morph: string;
    strong: string;  // Could be multipart separated by colons such as 'c:H4191'
}

interface TargetWord {
    index: number;
    occurrence: number;
    occurrences: number;
    text: string;
}

interface TargetWordBank extends TargetWord {
    disabled: boolean;  // if true then word is already used in alignment
}

interface Alignment {
    sourceNgram: SourceWord[];
    targetNgram: TargetWord[];
}

interface TReference{
    chapter: number;
    verse: number;
}

interface TContextId{
    reference: TReference;
}

interface TUsfmVerse{
    verseObjects: TWord[];
}

type TUsfmChapter = {[key:string]:TUsfmVerse};

interface TUsfmHeader{
    tag: string;
    content: string;
}

interface TUsfmBook{
    headers: TUsfmHeader[];
    chapters: {[key:string]:TUsfmChapter};
}

type Token = any; // You should import the actual Token type from wordMAP-lexer
type Suggestion = any; // You should import the actual Suggestion type from wordMAP
type usfmType = string; // Type definition for USFM content
type booksUsfmType = { [bibleId: string]: usfmType };
type translationMemoryType = {
    sourceUsfms: booksUsfmType;
    targetUsfms: booksUsfmType;
};
type THandleSetTrainingState = (running: boolean, trainingComplete: boolean) => void;

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

export const WordAlignerComponent: React.FC<SuggestingWordAlignerProps> = (
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

    const [trainingState, _setTrainingState] = useState<TrainingState>(defaultTrainingState())
    const trainingStateRef = useRef<TrainingState>(trainingState);
    function setTrainingState( newState: TrainingState ) {
        trainingStateRef.current = newState;
        _setTrainingState( newState );
    }
    
    const alignmentTrainingWorkerRef = useRef<Worker | null>(null);
    const alignmentTestingWorkerRef  = useRef<Worker | null>(null);

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

        // if group doesn't exist, then add
        if ( ! newGroupCollection_.groups?.[group_name]) {
            const newBooks: {[key:string]:Book} = {};
            // need to get the books
            Object.entries(translationMemory?.targetUsfms).forEach(([filename,usfm_book])=>{
                const usfm_json = usfm.toJSON(usfm_book, { convertToInt: ['occurrence','occurrences']});
                
                const usfmHeaders = parseUsfmHeaders(usfm_json.headers);
                const newBook = new Book( {chapters:{},filename,toc3Name:usfmHeaders.toc3,targetUsfmBook:null,sourceUsfmBook:null} );
                newBooks[usfmHeaders.h] = newBook.addTargetUsfm({filename,usfm_book: usfm_json,toc3Name:usfmHeaders.toc3});
            });
            
            const newGroup: Group = newGroupCollection_.groups[group_name] || new Group(newBooks);
            const newGroups = {...newGroupCollection_.groups, [group_name]: newGroup};
            const newGroupCollection = new GroupCollection(newGroups, newGroupCollection_.instanceCount + 1);
            newGroupCollection_ = newGroupCollection;
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

            //await showMessage( `Attached ${addedVerseCount} verses\nDropped ${droppedVerseCount} verses.`);
            // await showMessage( `${addedVerseCount} connections added.`);
            console.log( `${addedVerseCount} connections added.`);

        } catch( error ){
            //user declined
            console.error( `error importing ${error}` );
            // await showMessage( `Error ${error}`)
        }

        // #######################################################
        // load the target usfms.
        try{
            //load the usfm.
            const usfm_json : { [key: string]: TUsfmBook } = Object.fromEntries( Object.entries(translationMemory?.targetUsfms).map(([key,value]) => [key, usfm.toJSON(value,  { convertToInt: ['occurrence', 'occurrences'] })]));
            const group_name = contextId?.bibleId || '';
    
            let need_confirmation = false;
            let confirmation_message = "";
    
            //now make sure that for each of the chapters being loaded that that chapter hasn't already been loaded.
            Object.values(usfm_json).forEach((usfm_book) => {
                if( groupCollection.hasBookInGroup( {group_name, usfm_book}) ){
                    const parsed_headers = parseUsfmHeaders(usfm_book.headers);
                    need_confirmation = true;
                    confirmation_message += `Do you want to reload ${parsed_headers.h} in ${group_name}?`
                }
            })
    
            //now do the confirmation if needed.
            //this will throw an exception if it doesn't pass confirmation.
            // if( need_confirmation ) await getUserConfirmation(confirmation_message  );
    
            //poke all the newly loaded items in.
            const newGroupCollection = newGroupCollection_.addTargetUsfm({group_name, usfm_json })
            newGroupCollection_ = newGroupCollection;
            setGroupCollection( newGroupCollection_ );
            
        } catch( error ){
            //user declined
            console.error( `error importing ${error}` );
            // await showMessage( `Error ${error}`)
        }
    };

    const trainingRunning = !!alignmentTrainingWorkerRef.current
    const trained = !!alignmentPredictor.current

    /**
     * Starts the alignment training process using a web worker
     * Only runs if there have been changes since last training and enough training data exists
     * Updates training state and alignment predictor with trained model results
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

                //check if there are enough entries in the alignment training data dictionary
                if( Object.values(alignmentTrainingData.alignments).length > 4 ){
                    handleSetTrainingState?.(true, trained);

                    // blocking operation
                    // delay(500).then(async () => { // run after UI updates
                    //     try {
                    //         console.log( `starting alignment training` );
                    //        
                    //         const wordAlignerModel = await createTrainedWordAlignerModel(alignmentTrainingData);
                    //
                    //         console.log( `alignment training worker results:`, wordAlignerModel );
                    //
                    //         //Load the trained model and put it somewhere it can be used.
                    //         // if( "trainedModel" in event.data ){
                    //             const modelData = wordAlignerModel.save();
                    //             alignmentPredictor.current = AbstractWordMapWrapper.load( modelData );
                    //         // }
                    //         // if( "error" in event.data ){
                    //         //     console.log( "Error running alignment worker: " + event.data.error );
                    //         // }
                    //
                    //         setTrainingState( {...trainingStateRef.current, lastTrainedInstanceCount: trainingStateRef.current.currentTrainingInstanceCount } );
                    //         handleSetTrainingState?.(false, true); 
                    //     } catch (error) {
                    //         console.log(`error training`, error);
                    //         //TODO, need to communicate error back to the other side.
                    //         // self.postMessage({
                    //         //     message: 'There was an error while training the word map.',
                    //         //     error: error
                    //         // });
                    //         handleSetTrainingState?.(false, trained);
                    //     }
                    // })

                    const trainingStartTime = Date.now();
                    
                    try { // background processing
                        console.log(`start training for ${stateRef.current.groupCollection.instanceCount}`);

                        setTrainingState( {...trainingStateRef.current, currentTrainingInstanceCount: stateRef.current.groupCollection.instanceCount } );
                        // Capture start time

                        //create a new worker.
                        // alignmentTrainingWorkerRef.current = new Worker( new URL("../workers/AlignmentTrainer.ts", import.meta.url ) );
                        alignmentTrainingWorkerRef.current = new AlignmentWorker();

                        //Define the callback which will be called after the alignment trainer has finished
                        alignmentTrainingWorkerRef.current.addEventListener('message', (event) => {
                            // Calculate elapsed time in minutes
                            console.log(`alignment training worker message: ${event.data}`);
                            console.log(`Training completed in ${getElapsedMinutes(trainingStartTime)} minutes`);
                            
                            alignmentTrainingWorkerRef.current?.terminate();
                            alignmentTrainingWorkerRef.current = null;
                    
                            //Load the trained model and put it somewhere it can be used.
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
                        alignmentTrainingWorkerRef.current?.terminate();
                        alignmentTrainingWorkerRef.current = null;
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
        if( alignmentTrainingWorkerRef.current !== null ){
            handleSetTrainingState?.(false, trained);
            alignmentTrainingWorkerRef.current.terminate();
            alignmentTrainingWorkerRef.current = null;
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