/**
 * EnhancedWordAligner Component
 * =============================
 *
 * A React component that provides automated word alignment capabilities for Bible translation
 * projects, combining machine learning with a user-friendly interface for manual corrections.
 * 
 * by making use of EnhancedWordAlignerPane for the UI and useAlignmentSuggestions for handling
 * model training and suggestions.
 *
 * @description
 * The EnhancedWordAligner component expands the capabilities of the WordAligner
 *  component.  It provides automated background training of alignment suggestions.
 *  It adds UI to support word alignment suggestions and suggestions when doing
 *  manual alignments. It leverages the WordMap algorithm to analyze previously
 *  aligned verses and suggest alignments for unaligned text.
 * 
 * The component orchestrates several key processes:
 * 1. Caching translation memory (source and target text pairs) for alignment suggestions.
 * 2. Training alignment models using web workers for background processing
 * 3. Generating alignment suggestions based on trained alignment models
 * 4. Providing a user interface for suggesting, reviewing, and manually correcting alignments
 * 5. Persisting alignment memory data and trained models
 *
 * The component acts as a container that coordinates between the UI elements (via
 * EnhancedWordAlignerPane) and the alignment logic (via useAlignmentSuggestions hook),
 * handling the training state management and responding to user actions.
 *
 * Key features:
 * - Automated word alignment suggestions using statistical machine learning
 * - Background training via web workers to prevent UI blocking
 * - Persistent caching of trained models in IndexedDB
 * - Configurable alignment model parameters
 * - Dynamic complexity management of alignment training data based on available resources
 * - Support for both New Testament (Greek) and Old Testament (Hebrew) source texts
 * - Progress tracking and diagnostic information for training
 *
 * @see {@link EnhancedWordAligner.md} for example usage
 * @see {@link EnhancedWordAlignerPane} for the presentation layer
 * @see {@link useAlignmentSuggestions} for the alignment engine logic
 * @see {@link TrainingStateProvider} for the training state management
 *
 * @dependencies
 * - React 16.8+ (uses hooks)
 * - word-aligner-rcl (base word alignment functionality)
 * - uw-wordmapbooster (machine learning for alignment suggestions)
 * - IndexedDB (browser support required for model caching)
 * - Web Workers API (for background training processes)
 */

import React, {useEffect, useState} from 'react'
import {SuggestingWordAligner} from 'word-aligner-rcl'
import {
    ContextId,
    SourceWord,
    TargetWordBank,
    TTrainingStateChangeHandler,
    TTranslationMemoryType,
} from '@/common/classes';
import {Alignment, Suggestion} from 'wordmap';
import {Token} from 'wordmap-lexer'

import {TBookShaState, TUseAlignmentSuggestionsReturn} from '@/hooks/useAlignmentSuggestions';
import {createAlignmentTrainingWorker as createAlignmentTrainingWorker_} from '@/workers/utils/startAlignmentTrainer';
import {TAlignmentCompletedInfo, TAlignmentSuggestionsConfig} from '@/workers/WorkerComTypes';
import {useTrainingStateContext} from '@/hooks/TrainingStateProvider';
import ModelInfoDialog from './ModelInfoDialog';
import delay from "@/utils/delay";
import { EnhancedWordAlignerPane } from "./EnhancedWordAlignerPane";

/**
 * Props for the EnhancedWordAligner component
 * 
 * @interface EnhancedWordAlignerProps
 */
interface EnhancedWordAlignerProps {
    /** 
     * Translation memory data to be loaded into the alignment engine.
     * Contains source and target USFM content for training alignment models.
     */
    addTranslationMemory?: TTranslationMemoryType;

    /** 
     * State and actions from the useAlignmentSuggestions hook.
     * Provides access to alignment training, suggestion generation, and model management.
     */
    alignmentSuggestionsManage: TUseAlignmentSuggestionsReturn;

    /** 
     * Function to asynchronously generate alignment suggestions.
     * Used when suggestion computation is resource-intensive and should not block the UI.
     */
    asyncSuggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Promise<Suggestion[]>;

    /** 
     * Flag to cancel any ongoing alignment training process.
     * When set to true, the component will stop the training worker.
     */
    cancelTraining: boolean;

    /** 
     * Configuration settings for the alignment suggestions engine.
     * Controls parameters like n-gram length, training steps, and memory settings.
     */
    config?: TAlignmentSuggestionsConfig;
    
    /** 
     * Current context identifier with bible, book, chapter, and verse reference.
     * Used to determine the scope for alignment operations.
     */
    contextId: ContextId;

    /** 
     * Flag to initiate alignment training.
     * When set to true, the component will start the training process.
     */
    doTraining: boolean;

    /** 
     * Controls whether suggestion buttons are enabled in the UI.
     * Default is true; when false, suggestion functionality is hidden.
     */
    hasRenderedSuggestions?: boolean;
    
    /** 
     * Vertical offset for the model info dialog.
     * Adjusts the position of the dialog when displayed.
     */
    infoVerticalOffset?: string;

    /** 
     * Cache of lexicon entries for quick reference.
     * Improves performance by avoiding repeated lexicon lookups.
     */
    lexiconCache?: Record<string, any>;

    /** 
     * Function to load lexicon entry for a source word.
     * Fetches lexical data when users interact with source text words.
     */
    loadLexiconEntry: (lexiconId: string, entryId: string) => void;

    /** 
     * Callback for alignment changes.
     * Notifies parent components when users modify alignments.
     */
    onChange?: (details: {
        type: 'MERGE_ALIGNMENT_CARDS' | 'CREATE_NEW_ALIGNMENT_CARD' | 'UNALIGN_TARGET_WORD' | 'ALIGN_TARGET_WORD' | 'ALIGN_SOURCE_WORD';
        source: 'TARGET_WORD_BANK' | 'GRID';
        destination: 'TARGET_WORD_BANK' | 'GRID';
        verseAlignments: Alignment[];
        targetWords: TargetWordBank[];
        contextId: ContextId;
    }) => void;

    /** 
     * When true, only suggestion buttons are shown (the clear-all button is removed).
     * Used to simplify the UI in certain contexts.
     */
    suggestionsOnly?: boolean;

    /** 
     * Function to display word details in a popover.
     * Shows lexical information when users interact with words.
     */
    showPopover: (
        PopoverTitle: React.ReactNode,
        wordDetails: React.ReactNode,
        positionCoord: any,
        rawData: {
            token: SourceWord;
            lexiconData: any;
        }
    ) => void;

    /** 
     * Identifier for the source language (e.g., 'el-x-koine' for Greek).
     * Used in alignment model training and suggestions.
     */
    sourceLanguageId: string;

    /** 
     * Font family for the source language text.
     * Ensures proper display of source language characters.
     */
    sourceLanguageFont?: string;

    /** 
     * Font size percentage for source text.
     * Controls the display size of source language text.
     */
    sourceFontSizePercent?: number;

    /** 
     * Custom CSS styles for the component.
     * Allows visual customization of the alignment interface.
     */
    styles?: React.CSSProperties;

    /** 
     * Synchronous function to generate alignment suggestions.
     * Used for immediate suggestion generation when performance allows.
     */
    suggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Suggestion[];

    /** 
     * Information about the target language (id code, direction, localized name).
     * Used for proper language rendering and processing.
     */
    targetLanguage: object;

    /** 
     * Font family for the target language text.
     * Ensures proper display of target language characters.
     */
    targetLanguageFont?: string;

    /** 
     * Font size percentage for target text.
     * Controls the display size of target language text.
     */
    targetFontSizePercent?: number;

    /** 
     * Array of target words to be aligned.
     * The words from the target language that need to be aligned with source words.
     */
    targetWords: TargetWordBank[];

    /** 
     * Function to translate UI strings.
     * Provides internationalization support for the component.
     */
    translate: (key: string, params?: Record<string, string | number>) => string;
    
    /** 
     * Existing translation memory for alignment suggestions.
     * Pre-loaded alignment data that can be used for suggestions.
     */
    translationMemory?: TTranslationMemoryType;

    /** 
     * When true, detailed training progress is logged to the console.
     * Useful for debugging and monitoring alignment training.
     */
    verboseTraining?: boolean;

    /** 
     * Current alignments between source and target words.
     * The existing alignment data for the current verse.
     */
    verseAlignments: Alignment[];
}

/**
 * EnhancedWordAligner component implementation
 * 
 * This component serves as the container for the word alignment functionality,
 * managing the state and interactions between the UI and alignment engine.
 * 
 * @param {EnhancedWordAlignerProps} props - Component properties
 * @returns {JSX.Element} Rendered component
 */
export const EnhancedWordAligner: React.FC<EnhancedWordAlignerProps> = (
{
    addTranslationMemory,
    alignmentSuggestionsManage,
    cancelTraining,
    contextId,
    config,
    doTraining,
    lexiconCache,
    loadLexiconEntry,
    hasRenderedSuggestions,
    infoVerticalOffset,
    onChange,
    suggestionsOnly,
    showPopover,
    sourceLanguageId,
    sourceLanguageFont,
    sourceFontSizePercent,
    styles,
    targetLanguage,
    targetLanguageFont,
    targetFontSizePercent,
    targetWords,
    translate,
    translationMemory,
    verboseTraining,
    verseAlignments,
}) => {
    // Extract training state management functions and state values
    const {
        actions: {
            handleTrainingStateChange
        },
        state: {
            checksumGenerated,
            trainingComplete,
            translationMemoryLoaded,
        }
    } = useTrainingStateContext()

    // Extract alignment suggestion management functions
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
    } = alignmentSuggestionsManage;
    
     /**
     * Auto-Training Effect
     * ====================
     * 
     * Monitors the prerequisites for training and automatically initiates the training process
     * when content changes and auto-training is enabled. This effect checks for three conditions:
     * 
     * 1. The checksum for the content has been generated (content is available)
     * 2. Translation memory has been loaded (source and target pairs are available)
     * 3. Previous training has completed (not currently in training state)
     * 
     * When all conditions are met and auto-training is enabled in the configuration,
     * it compares the current content hash with the previously trained hash to determine
     * if retraining is necessary.
     * 
     * @dependency checksumGenerated - Flag indicating content checksum is available
     * @dependency translationMemoryLoaded - Flag indicating translation memory is loaded
     * @dependency trainingComplete - Flag indicating previous training is complete
     */
    useEffect(() => {
        console.log(`EnhancedWordAligner - checksumGenerated = ${checksumGenerated}, translationMemoryLoaded = ${translationMemoryLoaded}`);
        if (checksumGenerated && translationMemoryLoaded && trainingComplete && config?.doAutoTraining) {
            const shaState: TBookShaState = getCurrentBookShaState()
            console.log(`EnhancedWordAligner - Training complete: ${shaState?.bookShaChanged} trained sha ${shaState?.trainedSha} and current book sha ${shaState?.currentBookSha}`);
            if (shaState?.bookShaChanged) {
                console.log(`EnhancedWordAligner - Training complete: book changed, retraining`);
                startTraining();
            }
        }
    },[checksumGenerated, translationMemoryLoaded, trainingComplete]);

    /**
     * Training Control Effect
     * ======================
     * 
     * Handles manual training initiation through the doTraining prop.
     * When doTraining becomes true, this effect triggers the startTraining
     * function to begin the alignment model training process.
     * 
     * This provides an external mechanism for parent components to control
     * when training should occur, independent of the auto-training functionality.
     * 
     * @dependency doTraining - Flag indicating training should be started
     */
    useEffect(() => {
        const training = isTraining()
        console.log(`EnhancedWordAligner - doTraining changed state to ${doTraining} but training is now ${training}`)
        if (doTraining) {
            startTraining()
        }
    },[doTraining]);

    /**
     * Training Cancel Effect
     * =====================
     * 
     * Handles the cancellation of ongoing alignment training processes. This effect
     * monitors the cancelTraining prop and stops any active training session when requested.
     * 
     * The effect first verifies current training status before attempting to stop training
     * to prevent unnecessary calls to the training cancellation function. When cancelTraining
     * becomes true, it calls the stopTraining_ function to terminate the worker and clean up resources.
     * 
     * @dependency cancelTraining - Flag indicating if training should be stopped
     */
    useEffect(() => {
        const training = isTraining()
        console.log(`EnhancedWordAligner - cancelTraining changed state to ${cancelTraining} but training is now ${training}`)
        if (cancelTraining) {
            stopTraining_()
        }
    },[cancelTraining]);

    /**
     * Component Lifecycle Effect
     * =========================
     * 
     * Handles component initialization and cleanup operations. This effect
     * logs when the component is mounted and unmounted, which is useful for
     * tracking component lifecycle during development and debugging.
     * 
     * This effect has no dependencies, so it runs only on mount/unmount.
     */
    useEffect(() => {
        console.log('EnhancedWordAligner initialized/mounted')
        return () => {
            console.log('EnhancedWordAligner unmounted')
        };
    },[]);

    /**
     * Translation Memory Loading Effect
     * ================================
     * 
     * Manages the loading of translation memory data when it becomes available
     * or changes. This effect automatically triggers the memory loading process
     * whenever new translation memory data is provided through the addTranslationMemory prop.
     * 
     * Here the translation memory is in raw form per book - aligned USFM for
     * target language and USFM for source language. `loadTranslationMemory`
     * will extract source and target language text pairs that are used for
     * training the alignment model.
     * 
     * When addTranslationMemory changes, it'sloaded into the alignment system.
     * 
     * @effect Loads translation memory data when it changes
     */
    useEffect(() => {
        if (addTranslationMemory) {
            loadTranslationMemory(addTranslationMemory)
        }
    },[addTranslationMemory]);
    
    // Render the EnhancedWordAlignerPane with necessary props
    return (
        <EnhancedWordAlignerPane
            config={config}
            contextId={contextId}
            deleteBookFromGroup={deleteBookFromGroup}
            getModelMetaData={getModelMetaData}
            hasRenderedSuggestions={hasRenderedSuggestions}
            infoVerticalOffset={infoVerticalOffset}
            lexiconCache={lexiconCache}
            loadLexiconEntry={loadLexiconEntry}
            onChange={onChange}
            saveChangedSettings={saveChangedSettings}
            showPopover={showPopover}
            sourceLanguageId={sourceLanguageId}
            sourceLanguageFont={sourceLanguageFont}
            sourceFontSizePercent={sourceFontSizePercent}
            styles={{...styles, maxHeight: '450px', overflowY: 'auto'}}
            suggester={suggester}
            suggestionsOnly={suggestionsOnly}
            targetLanguageFont={targetLanguageFont}
            targetLanguage={targetLanguage}
            targetFontSizePercent={targetFontSizePercent}
            targetWords={targetWords}
            translate={translate}
            verseAlignments={verseAlignments}
        />
    )
}