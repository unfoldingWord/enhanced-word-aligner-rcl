
/**
 * EnhancedWordAligner Component
 * =============================
 *
 * @synopsis
 * A React component that enhances the basic WordAligner with automated alignment suggestions
 * by making use of EnhancedWordAlignerPane for the UI and useAlignmentSuggestions for handling
 * model training and suggestions.
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
 * - Requires uw-wordmapbooster as a dependency to do alignment training
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

import {TBookShaState, TUseAlignmentSuggestionsReturn} from '@/hooks/useAlignmentSuggestions';
import {createAlignmentTrainingWorker as createAlignmentTrainingWorker_} from '@/workers/utils/startAlignmentTrainer';
import {TAlignmentCompletedInfo, TAlignmentSuggestionsConfig} from '@/workers/WorkerComTypes';
import {useTrainingState} from '@/hooks/useTrainingState';
import ModelInfoDialog from './ModelInfoDialog';
import delay from "@/utils/delay";
import { EnhancedWordAlignerPane } from "./EnhancedWordAlignerPane";

interface EnhancedWordAlignerProps {
    /** Translation memory data to be added to the alignment engine */
    addTranslationMemory?: TTranslationMemoryType;

    /** state and actions from useAlignmentSuggestions **/
    alignmentSuggestionsManage: TUseAlignmentSuggestionsReturn;

    /** Function to handle async suggestion generation for alignments */
    asyncSuggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Promise<Suggestion[]>;

    /** Flag to cancel alignment training */
    cancelTraining: boolean;

    /** Current context identifier with bible, book, chapter, verse reference */
    contextId: ContextId;
    
    /** Flag to initiate alignment training */
    doTraining: boolean;

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

    /** sets callback for training state changes -*/
    setHandleSetTrainingState?: (callback: THandleTrainingStateChange) => void;
        
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
    
    /** Info for the target language */
    targetLanguage: object;
    
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
    alignmentSuggestionsManage,
    cancelTraining,
    contextId,
    config,
    doTraining,
    lexiconCache,
    loadLexiconEntry,
    hasRenderedSuggestions,
    onChange,
    suggestionsOnly,
    showPopover,
    sourceLanguageId,
    sourceLanguageFont,
    sourceFontSizePercent,
    setHandleSetTrainingState,
    styles,
    targetLanguage,
    targetLanguageFont,
    targetFontSizePercent,
    targetWords,
    translate,
    translationMemory,
    verseAlignments,
}) => {
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
    } = alignmentSuggestionsManage; // split out values from useAlignmentSuggestions
    
     /**
     * Auto-Training Effect
     * ====================
     * 
     * @synopsis
     * Monitors training prerequisites and automatically initiates training when content changes.
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
     * Training Control Effect
     * ======================
     * 
     * @synopsis
     * Starts alignment training based on the doTraining prop.
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
     */
    useEffect(() => {
        const training = isTraining()
        console.log(`cancelTraining changed state to ${cancelTraining} but training is now ${training}`)
        if (cancelTraining) {
            stopTraining_()
        }
    },[cancelTraining]);

    useEffect(() => {
        setHandleSetTrainingState(handleTrainingStateChange) // set on mount
    },[]);

    useEffect(() => {
        loadTranslationMemory(addTranslationMemory)
    },[addTranslationMemory]);
    
    return (
        <EnhancedWordAlignerPane
            config={config}
            contextId={contextId}
            deleteBookFromGroup={deleteBookFromGroup}
            getModelMetaData={getModelMetaData}
            hasRenderedSuggestions={hasRenderedSuggestions}
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