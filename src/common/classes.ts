import React from "react";
import Group from "@/shared/Group";
import GroupCollection from "@/shared/GroupCollection";
import {TAlignerData, TSourceTargetAlignment, TWord} from "word-aligner-rcl";
import {Token} from 'wordmap-lexer'
import {Suggestion} from 'wordmap'
import {TWordAlignmentTestResults} from "@/workers/WorkerComTypes";

export type usfmType = string; // Type definition for USFM content
export type booksUsfmType = { [bibleId: string]: usfmType };
export type translationMemoryType = {
    sourceUsfms: booksUsfmType;
    targetUsfms: booksUsfmType;
};
export type THandleSetTrainingState = (running: boolean, trainingComplete: boolean) => void;


export interface TWordAlignerAlignmentResult{
    targetWords: TWord[];
    verseAlignments: TSourceTargetAlignment[];
}

export interface TState{
    aligned: boolean;
    sourceLanguage: string;
    targetLanguage: string;
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

export interface AppState {
    groupCollection: GroupCollection; //This contains all the verse data loaded in a hierarchical structure of Groups->Books->Chapter->Verses
    scope: string;  //This is Book, Group, Chapter or Verse.  It changes how the list is shown.
    currentSelection: string[][]; //This contains a collection of the references to all the things selected in the list.
    doubleClickedVerse: string[] | null; //This gets set when a verse is double clicked.
    alignerStatus: TAlignerStatus | null; //This gets set to pop up the word aligner dialog.
}

export interface TrainingState{
    isTrainingEnabled: boolean; //This is true when the training checkbox is checked
    isTestingEnabled: boolean; //This is true when the testing is enabled
    trainingStatusOutput: string; //Setting this shows up on the toolbar and lets the training have a place to give live output status.
    lastTrainedInstanceCount: number; //This lets us know if something has changed since last training by comparing it to groupCollection.instanceCount
    currentTrainingInstanceCount: number; //This keeps track of what is currently training so that when it finishes lastTrainedInstanceCount can be set.
    lastTestAlignedCount: number; //This count keeps track of which alignment model count was last used to update test alignments.
    currentTestingInstanceCount: number; //This keeps track of what is currently testing so that when it finishes lastTestAlignedCount can be set.
    testResults: TWordAlignmentTestResults | null; //This holds the last results which were returned from the testing thread.
    contextId: ContextId | null;
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
