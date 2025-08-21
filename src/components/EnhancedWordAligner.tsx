import React, {useEffect} from 'react'
import {SuggestingWordAligner} from 'word-aligner-rcl'
import {
    ContextId,
    SourceWord,
    TargetWordBank,
    THandleSetTrainingState,
    translationMemoryType,
    TTrainingStateChange
} from "@/common/classes";
import {Alignment, Suggestion} from "wordmap";
import {Token} from 'wordmap-lexer'

import {TAlignmentCompletedInfo, useAlignmentSuggestions} from '@/hooks/useAlignmentSuggestions';
import {createAlignmentTrainingWorker} from "@/workers/utils/startAlignmentTrainer";

interface EnhancedWordAlignerProps {
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
    sourceLanguageId: string;
    sourceLanguageFont?: string;
    sourceFontSizePercent?: number;
    targetLanguageId: string;
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

export const EnhancedWordAligner: React.FC<EnhancedWordAlignerProps> = (
{
   styles,
   contextId,
   lexiconCache,
   loadLexiconEntry,
   onChange,
   showPopover,
   sourceLanguageId,
   sourceLanguageFont,
   sourceFontSizePercent,
   targetLanguageId,
   targetLanguageFont,
   targetFontSizePercent,
   translate,
   verseAlignments,
   targetWords,
   hasRenderedSuggestions,
   addTranslationMemory,
   doTraining, 
   handleSetTrainingState,
}) => {
    const handleTrainingCompleted = (info: TAlignmentCompletedInfo) => {
        console.log("handleTrainingCompleted", info);
    }

    const handleSetTrainingState_ = (props: TTrainingStateChange) => {
        handleSetTrainingState?.(props);
        const trainingCurrent = areTrainingSameBook_();
        console.log(`handleSetTrainingState - training Current Book: ${trainingCurrent}`);
    }
    
    const {
        areTrainingSameBook,
        cleanupWorker,
        loadTranslationMemory,
        suggester,
    } = useAlignmentSuggestions({
        contextId,
        createAlignmentTrainingWorker,
        doTraining,
        handleSetTrainingState: handleSetTrainingState_,
        handleTrainingCompleted,
        shown: true,
        sourceLanguageId,
        targetLanguageId,
    });
    
    const areTrainingSameBook_ = () => {
        const trainingCurrent = areTrainingSameBook(contextId);
        return trainingCurrent;
    }

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

    return (
        <SuggestingWordAligner
            styles={styles}
            verseAlignments={verseAlignments}
            targetWords={targetWords}
            translate={translate}
            contextId={contextId}
            targetLanguageFont={targetLanguageFont}
            sourceLanguage={sourceLanguageId}
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