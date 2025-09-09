import React, {useEffect} from 'react'
import {SuggestingWordAligner} from 'word-aligner-rcl'
import {
    ContextId,
    SourceWord,
    TargetWordBank,
    THandleTrainingStateChange,
    translationMemoryType,
    TTrainingStateChange
} from "@/common/classes";
import {Alignment, Suggestion} from "wordmap";
import {Token} from 'wordmap-lexer'

import {TAlignmentCompletedInfo, useAlignmentSuggestions} from '@/hooks/useAlignmentSuggestions';
import {createAlignmentTrainingWorker} from "@/workers/utils/startAlignmentTrainer";
import {TAlignmentSuggestionsConfig} from "@/workers/WorkerComTypes";

interface EnhancedWordAlignerProps {
    asyncSuggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Promise<Suggestion[]>;
    addTranslationMemory?: translationMemoryType;
    contextId: ContextId;
    doTraining: boolean;
    handleTrainingStateChange?: THandleTrainingStateChange;
    hasRenderedSuggestions?: boolean;
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
    suggestionsOnly?: boolean;
    showPopover: (
        PopoverTitle: React.ReactNode,
        wordDetails: React.ReactNode,
        positionCoord: any,
        rawData: {
            token: SourceWord;
            lexiconData: any;
        }
    ) => void;
    sourceLanguageId: string;
    sourceLanguageFont?: string;
    sourceFontSizePercent?: number;
    styles?: React.CSSProperties;
    suggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Suggestion[];
    targetLanguageId: string;
    targetLanguageFont?: string;
    targetFontSizePercent?: number;
    targetWords: TargetWordBank[];
    translate: (key: string) => void;
    verseAlignments: Alignment[];
    config?: TAlignmentSuggestionsConfig;
}

export const EnhancedWordAligner: React.FC<EnhancedWordAlignerProps> = (
{
    addTranslationMemory,
    contextId,
    config,
    doTraining,
    lexiconCache,
    loadLexiconEntry,
    handleTrainingStateChange,
    hasRenderedSuggestions,
    onChange,
    suggestionsOnly,
    showPopover,
    sourceLanguageId,
    sourceLanguageFont,
    sourceFontSizePercent,
    styles,
    targetLanguageId,
    targetLanguageFont,
    targetFontSizePercent,
    targetWords,
    translate,
    verseAlignments,
}) => {
    const handleTrainingCompleted = (info: TAlignmentCompletedInfo) => {
        console.log("handleTrainingCompleted", info);
    }

    const handleTrainingStateChange_ = (props: TTrainingStateChange) => {
        handleTrainingStateChange?.(props);
    }
    
    const {
        actions: {
            areTrainingSameBook,
            cleanupWorker,
            isTraining,
            loadTranslationMemory,
            suggester,
            startTraining,
            stopTraining,
        }
    } = useAlignmentSuggestions({
        config,
        contextId,
        createAlignmentTrainingWorker,
        handleSetTrainingState: handleTrainingStateChange_,
        handleTrainingCompleted,
        shown: true,
        sourceLanguageId,
        targetLanguageId,
    });
    
    // Effect to load translation memory when it changes
    useEffect(() => {
        if (addTranslationMemory && Object.keys(addTranslationMemory).length > 0) {
            loadTranslationMemory(addTranslationMemory);
        }
    }, [addTranslationMemory]);
    
    //here we cleanup on close of the component.  This is needed because the worker is not terminated when the component is unmounted.".
    // TODO: this may not be desired
    useEffect(() => {
        return () => {
            cleanupWorker();
        };
    },[]);

    useEffect(() => {
        const training = isTraining()
        console.log(`doTraining changed state to ${doTraining} but training is now ${training}`)
        if(doTraining) {
            startTraining()
        } else {
            stopTraining()
        }
    },[doTraining]);

    return (
        <SuggestingWordAligner
            contextId={contextId}
            suggestionsOnly={suggestionsOnly}
            hasRenderedSuggestions={hasRenderedSuggestions}
            styles={styles}
            targetWords={targetWords}
            translate={translate}
            targetLanguageFont={targetLanguageFont}
            sourceLanguage={sourceLanguageId}
            showPopover={showPopover}
            lexiconCache={lexiconCache}
            loadLexiconEntry={loadLexiconEntry}
            onChange={onChange}
            sourceLanguageFont={sourceLanguageFont}
            sourceFontSizePercent={sourceFontSizePercent}
            targetFontSizePercent={targetFontSizePercent}
            suggester={suggester}
            verseAlignments={verseAlignments}
        />
    )
}