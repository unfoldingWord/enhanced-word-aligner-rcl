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

export interface TTrainingStateChange {
    training?: boolean,
    trainingComplete?: boolean,
    trainingFailed?: string,
    percentComplete?: number,
    contextId?: ContextId,
}

export type THandleSetTrainingState = (state: TTrainingStateChange) => void;

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
    maxComplexity: number;
    currentBookName: string;
    trainingState: TrainingState;
    failedToLoadCachedTraining: boolean;
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
