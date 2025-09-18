
/**
 * EnhancedWordAligner Component
 * =============================
 *
 * @synopsis
 * A React component that enhances the basic WordAligner with automated alignment suggestions
 * by wrapping the SuggestingWordAligner from word-aligner-rcl with WordMap training capability.
 *
 * @description
 * The EnhancedWordAligner component provides automated word alignment suggestions for Bible
 * translation projects. It uses machine learning via the WordMap algorithm to analyze aligned
 * verses and suggest alignments for unaligned text. This component manages training state,
 * configuration settings, and model information while providing a user interface for manual
 * alignment corrections.
 *
 * Key features:
 * - Automated word alignment suggestions using trained models
 * - Support for alignment training using web workers
 * - Configuration management for alignment algorithms
 * - Model information dialog with settings controls
 * - Translation memory management
 *
 * @properties
 * The component accepts numerous props to configure its behavior and appearance
 *
 * @requirements
 * - Requires word-aligner-rcl as a dependency
 * - Needs a web worker for training alignment models
 * - uses custom hook useAlignmentSuggestions to manage the model training Web worker, 
 *      suggestions, model caching, training state, 
 * - uses custom hook useTrainingState to expose to app training state information
 * - Requires browser support for IndexedDB for caching training data
 */

import React, {useEffect, useState} from 'react'
import {SuggestingWordAligner} from 'word-aligner-rcl'
import {
    ContextId,
    SourceWord,
    TargetWordBank,
    THandleTrainingStateChange,
    TTranslationMemoryType,
} from '@/common/classes';
import {Alignment, Suggestion} from 'wordmap';
import {Token} from 'wordmap-lexer'

import {TBookShaState, useAlignmentSuggestions} from '@/hooks/useAlignmentSuggestions';
import {createAlignmentTrainingWorker as createAlignmentTrainingWorker_} from '@/workers/utils/startAlignmentTrainer';
import {TAlignmentCompletedInfo, TAlignmentSuggestionsConfig, TAlignmentMetaData} from '@/workers/WorkerComTypes';
import {useTrainingState} from '@/hooks/useTrainingState';
import ModelInfoDialog from './ModelInfoDialog';
import delay from "@/utils/delay";

interface EnhancedWordAlignerProps {
    /** Function to handle async suggestion generation for alignments */
    asyncSuggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Promise<Suggestion[]>;
    
    /** Translation memory data to be added to the alignment engine */
    addTranslationMemory?: TTranslationMemoryType;
    
    /** Current context identifier with bible, book, chapter, verse reference */
    contextId: ContextId;
    
    /** Function to create a web worker for alignment training */
    createAlignmentTrainingWorker: () => Promise<Worker>;
    
    /** Flag to trigger alignment training */
    doTraining: boolean;
    
    /** callback for training state changes to pass to parent components -
     *      connect to useTrainingState hook for convenient exposure of state information */
    handleTrainingStateChange?: THandleTrainingStateChange;
    
    /** Flag control if suggestion buttons are to be enabled, default is true */
    hasRenderedSuggestions?: boolean;
    
    /** Cache of lexicon entries for quick reference */
    lexiconCache?: Record<string, any>;
    
    /** Function to load lexicon entry for source word */
    loadLexiconEntry: (lexiconId: string, entryId: string) => void;
    
    /** Callback for alignment changes */
    onChange?: (details: {
        type: 'MERGE_ALIGNMENT_CARDS' | 'CREATE_NEW_ALIGNMENT_CARD' | 'UNALIGN_TARGET_WORD' | 'ALIGN_TARGET_WORD' | 'ALIGN_SOURCE_WORD';
        source: 'TARGET_WORD_BANK' | 'GRID';
        destination: 'TARGET_WORD_BANK' | 'GRID';
        verseAlignments: Alignment[];
        targetWords: TargetWordBank[];
        contextId: ContextId;
    }) => void;
    
    /** Flag to only show suggestion buttons (if true the clear-all button is removed) */
    suggestionsOnly?: boolean;
    
    /** Function to display word details in a popover */
    showPopover: (
        PopoverTitle: React.ReactNode,
        wordDetails: React.ReactNode,
        positionCoord: any,
        rawData: {
            token: SourceWord;
            lexiconData: any;
        }
    ) => void;
    
    /** Identifier for the source language */
    sourceLanguageId: string;
    
    /** Font family for the source language text */
    sourceLanguageFont?: string;
    
    /** Font size percentage for source text */
    sourceFontSizePercent?: number;
    
    /** Custom CSS styles for the component */
    styles?: React.CSSProperties;
    
    /** Synchronous function to generate alignment suggestions */
    suggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Suggestion[];
    
    /** Identifier for the target language */
    targetLanguageId: string;
    
    /** Font family for the target language text */
    targetLanguageFont?: string;
    
    /** Font size percentage for target text */
    targetFontSizePercent?: number;
    
    /** Array of target words to be aligned */
    targetWords: TargetWordBank[];
    
    /** Function to translate UI strings */
    translate: (key: string) => string;
    
    /** Existing translation memory for alignment suggestions */
    translationMemory?: TTranslationMemoryType;
    
    /** Current alignments between source and target words */
    verseAlignments: Alignment[];
    
    /** Configuration settings for alignment suggestions */
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
    handleTrainingStateChange: handleTrainingStateChange_,
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
    translationMemory,
    verseAlignments,
}) => {
    const [showModelDialog, setShowModelDialog] = useState(false);
    const [modelInfo, setModelInfo] = useState<TAlignmentMetaData | null>(null);

    const handleTrainingCompleted = (info: TAlignmentCompletedInfo) => {
        console.log('handleTrainingCompleted', info);
    }

    const {
        actions: {
            handleTrainingStateChange
        },
        state: {
            checksumGenerated,
            trainingComplete,
            translationMemoryLoaded,
        }
    } = useTrainingState({
        passThroughStateChange: handleTrainingStateChange_,
        translate
    })

    const {
        actions: {
            cleanupWorker,
            deleteBookFromGroup,
            getCurrentBookShaState,
            getModelMetaData,
            isTraining,
            loadTranslationMemory,
            saveChangedSettings,
            suggester,
            startTraining,
            stopTraining,
        }
    } = useAlignmentSuggestions({
        config,
        contextId,
        createAlignmentTrainingWorker,
        handleTrainingStateChange,
        handleTrainingCompleted,
        shown: true,
        sourceLanguageId,
        targetLanguageId,
        translationMemory,
    });

    const handleConfigChange = (newConfig: TAlignmentSuggestionsConfig) => {
        // setShowModelDialog(false);
        saveChangedSettings(newConfig).then(() => {
            handleInfoClick_()
        });
    };

    function handleInfoClick_() {
        // console.log('handleInfoClick');
        const info = getModelMetaData()
        setModelInfo(info);
        setShowModelDialog(true);
    }
    
    const handleDeleteBook = (bookId: string) => {
        console.log(`Delete alignment data for book: ${bookId}`);
        deleteBookFromGroup(bookId).then(() => {
            handleInfoClick_()
        });
    };

    useEffect(() => {
        console.log(`checksumGenerated = ${checksumGenerated}, translationMemoryLoaded = ${translationMemoryLoaded}`);
        if (checksumGenerated && translationMemoryLoaded && trainingComplete && config?.doAutoTraining) {
            const shaState: TBookShaState = getCurrentBookShaState()
            console.log(`Training complete: ${shaState?.bookShaChanged} trained sha ${shaState?.trainedSha} and current book sha ${shaState?.currentBookSha}`);
            if (shaState?.bookShaChanged) {
                console.log(`Training complete: book changed, retraining`);
                startTraining();
            }
        }
    },[checksumGenerated, translationMemoryLoaded, trainingComplete]);
    
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
        <>
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
                translationMemory={translationMemory}
                verseAlignments={verseAlignments}
            />
            {showModelDialog && modelInfo && (
                <ModelInfoDialog
                    onConfigChange={handleConfigChange}
                    handleDeleteBook={handleDeleteBook}
                    info={modelInfo}
                    onClose={() => setShowModelDialog(false)} 
                />
            )}
        </>
    )
}