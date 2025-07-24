import {useRef, useState} from 'react'
import '../App.css'
import React from 'react'
import { SuggestingWordAligner, TAlignerData, TReference, TSourceTargetAlignment, TWord } from 'suggesting-word-aligner-rcl'
import GroupCollection from "@/shared/GroupCollection";
import {TWordAlignmentTestResults} from "@/workers/WorkerComTypes";
import IndexedDBStorage from "@/shared/IndexedDBStorage";
import { AbstractWordMapWrapper } from 'wordmapbooster/dist/boostwordmap_tools';

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

type Token = any; // You should import the actual Token type from wordMAP-lexer
type Suggestion = any; // You should import the actual Suggestion type from wordMAP

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
}

function defaultAppState(): AppState{
    return {
        groupCollection: new GroupCollection({}, 0),
        scope: "Book",
        currentSelection: [],
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
   suggester,
   asyncSuggester
}) => {
    
    const dbStorageRef = useRef<IndexedDBStorage | null>(null);

    const [state, _setState] = useState<AppState>(defaultAppState());
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
            asyncSuggester={asyncSuggester}
        />
  )
}