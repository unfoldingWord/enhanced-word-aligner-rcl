
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

    /** Flag to stop alignment training */
    stopTraining: boolean;

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
    translate: (key: string, params?: Record<string, string | number>) => string;
    
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
    stopTraining,
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
            stopTraining: stopTraining_,
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

    /**
     * Handles changes to the configuration for alignment suggestions.
     *
     * This method is responsible for applying the new configuration settings
     * and executing necessary actions upon successful save. It saves the updated
     * settings and triggers an informational action once the save operation is completed.
     *
     * @param {TAlignmentSuggestionsConfig} newConfig - The updated configuration object for alignment suggestions.
     */
    const handleConfigChange = (newConfig: TAlignmentSuggestionsConfig) => {
        // setShowModelDialog(false);
        saveChangedSettings(newConfig).then(() => {
            handleInfoClick_()
        });
    };

    /**
     * Handles the logic to display model information when the associated event is triggered.
     * Retrieves model metadata, updates the model info state,
     * and toggles the display of the model dialog.
     *
     * @return {void} No return value.
     */
    function handleInfoClick_() {
        // console.log('handleInfoClick');
        const info = getModelMetaData()
        setModelInfo(info);
        setShowModelDialog(true);
    }

    /**
     * Deletes a book by its identifier and performs subsequent actions.
     *
     * This function is used to delete the alignment data associated with a specific book
     * identified by the provided `bookId`. Once the deletion process is successful,
     * it triggers an informational action.
     *
     * @param {string} bookId - The unique identifier of the book to be deleted.
     */
    const handleDeleteBook = (bookId: string) => {
        console.log(`Delete alignment data for book: ${bookId}`);
        deleteBookFromGroup(bookId).then(() => {
            handleInfoClick_()
        });
    };
    
     /**
     * Auto-Training Effect
     * ====================
     * 
     * @synopsis
     * Monitors training prerequisites and automatically initiates training when content changes.
     * 
     * @requirements
     * - Training prerequisites (checksumGenerated, translationMemoryLoaded, trainingComplete) must be true
     * - Auto-training must be enabled in configuration (config.doAutoTraining)
     * - Book content must have changed since last training (via SHA comparison)
     * 
     * @dependencies
     * - checksumGenerated, translationMemoryLoaded, trainingComplete - Training state flags
     * - config.doAutoTraining - Configuration setting
     * - getCurrentBookShaState() - Function to check content changes
     * - startTraining() - Function to initiate training
     */
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
    
    /**
     * Translation Memory Loading Effect
     * =================================
     * 
     * @synopsis
     * Loads translation memory data when it becomes available or changes.
     * 
     * @requirements
     * - Valid translation memory data must be provided
     * - Translation memory object must contain at least one entry
     * 
     * @dependencies
     * - addTranslationMemory - Object containing translation memory data
     * - loadTranslationMemory() - Function to process the memory data
     */
    useEffect(() => {
        if (addTranslationMemory && Object.keys(addTranslationMemory).length > 0) {
            loadTranslationMemory(addTranslationMemory);
        }
    }, [addTranslationMemory]);

    /**
     * Training Control Effect
     * ======================
     * 
     * @synopsis
     * Starts alignment training based on the doTraining prop.
     * 
     * @requirements
     * - doTraining prop must reflect desired training state
     * 
     * @dependencies
     * - doTraining - Boolean flag indicating whether training should be active
     * - isTraining() - Function to check current training status
     * - startTraining() - Functions to control training process
     */
    useEffect(() => {
        const training = isTraining()
        console.log(`doTraining changed state to ${doTraining} but training is now ${training}`)
        if (doTraining) {
            startTraining()
        }
    },[doTraining]);

    /**
     * Training Control Effect
     * ======================
     *
     * @synopsis
     * Stops alignment training based on the doTraining prop.
     *
     * @requirements
     * - doTraining prop must reflect desired training state
     *
     * @dependencies
     * - doTraining - Boolean flag indicating whether training should be active
     * - isTraining() - Function to check current training status
     * - stopTraining() - Functions to control training process
     */
    useEffect(() => {
        const training = isTraining()
        console.log(`stopTraining changed state to ${stopTraining} but training is now ${training}`)
        if (stopTraining) {
            stopTraining_()
        }
    },[stopTraining]);
    
    
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
                    translate={translate}
                />
            )}
        </>
    )
}