import React, {useEffect} from 'react'
import {SuggestingWordAligner} from 'word-aligner-rcl'
import {
    ContextId,
    SourceWord,
    TargetWordBank,
    THandleTrainingStateChange,
    translationMemoryType,
    TTrainingStateChange
} from '@/common/classes';
import {Alignment, Suggestion} from 'wordmap';
import {Token} from 'wordmap-lexer'

import {useAlignmentSuggestions} from '@/hooks/useAlignmentSuggestions';
import {createAlignmentTrainingWorker as createAlignmentTrainingWorker_} from '@/workers/utils/startAlignmentTrainer';
import {TAlignmentCompletedInfo, TAlignmentSuggestionsConfig} from '@/workers/WorkerComTypes';

interface EnhancedWordAlignerProps {
    asyncSuggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Promise<Suggestion[]>;
    addTranslationMemory?: translationMemoryType;
    contextId: ContextId;
    createAlignmentTrainingWorker: () => Promise<Worker>;
    doTraining: boolean;
    handleInfoClick: (TAlignmentCompletedInfo) => void;
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
    createAlignmentTrainingWorker = createAlignmentTrainingWorker_, // TRICKY - the steps to create the training Worker are dependent on the platform, so this allows it to be overridden
    doTraining,
    lexiconCache,
    loadLexiconEntry,
    handleInfoClick,
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
        console.log('handleTrainingCompleted', info);
    }

    const handleTrainingStateChange_ = (props: TTrainingStateChange) => {
        handleTrainingStateChange?.(props);
    }
    
    const {
        actions: {
            cleanupWorker,
            getModelMetaData,
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

    function handleInfoClick_() {
        // console.log('handleInfoClick');
        const info = getModelMetaData()
        handleInfoClick?.(info)
    }
    
    // Effect to load translation memory when it changes
    useEffect(() => {
        if (addTranslationMemory && Object.keys(addTranslationMemory).length > 0) {
            loadTranslationMemory(addTranslationMemory);
        }
    }, [addTranslationMemory]);
    
    //here we cleanup on close of the component.  This is needed because the worker is not terminated when the component is unmounted..
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
            handleInfoClick={handleInfoClick_}
            hasRenderedSuggestions={hasRenderedSuggestions}
            lexiconCache={lexiconCache}
            loadLexiconEntry={loadLexiconEntry}
            onChange={onChange}
            showPopover={showPopover}
            sourceLanguage={sourceLanguageId}
            sourceLanguageFont={sourceLanguageFont}
            sourceFontSizePercent={sourceFontSizePercent}
            suggestionsOnly={suggestionsOnly}
            style={styles}
            suggester={suggester}
            targetWords={targetWords}
            translate={translate}
            targetLanguageFont={targetLanguageFont}
            targetFontSizePercent={targetFontSizePercent}
            verseAlignments={verseAlignments}
        />
    )
}