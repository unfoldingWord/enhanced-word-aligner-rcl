
/**
 * EnhancedWordAlignerPane Component
 * =================================
 *
 * @synopsis
 * A React component that enhances the basic WordAligner with UI for alignment suggestions
 * by wrapping the SuggestingWordAligner from word-aligner-rcl and ModelInfoDialog.  This
 * is the UI part of EnhancedWordAligner.
 *
 * @description
 * The EnhancedWordAlignerPane component provides the UI part of word alignment suggestions for Bible
 * translation projects. It uses machine learning via the WordMap algorithm to analyze aligned
 * verses and suggest alignments for unaligned text. This component manages training state,
 * configuration settings, and model information while providing a user interface for manual
 * alignment corrections.
 *
 * @properties
 * The component accepts numerous props to configure its behavior and appearance
 *
 * @requirements
 * - Requires word-aligner-rcl as a dependency
 * - Needs a web worker for training alignment models
 * - parent component needs to use custom hook useAlignmentSuggestions to manage the model
 *      training Web worker, suggestions, model caching, training state, 
 * - parent component needs to use custom hook useTrainingState to expose to app training
 *      state information
 * - Requires browser support for IndexedDB for caching training data
 */

import React, { useState} from 'react'
// @ts-ignore
import {SuggestingWordAligner} from 'word-aligner-rcl'
import {
    ContextId,
    SourceWord,
    TargetWordBank,
} from '@/common/classes';
import {Alignment, Suggestion} from 'wordmap';
import {Token} from 'wordmap-lexer'

import {
    TAlignmentSuggestionsConfig,
    TAlignmentMetaData,
} from '@/workers/WorkerComTypes';
import ModelInfoDialog from './ModelInfoDialog';

interface EnhancedWordAlignerPaneProps {
    /** Function to handle async suggestion generation for alignments */
    asyncSuggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Promise<Suggestion[]>;

    /** Configuration settings for alignment suggestions */
    config?: TAlignmentSuggestionsConfig;
    
    /** Current context identifier with bible, book, chapter, verse reference */
    contextId: ContextId;

    /** Removes a book from the alignment memory */
    deleteBookFromGroup: (bookId: string) => Promise<void>;

    /** Retrieves alignment metadata and alignment training settings for the current alignment model */
    getModelMetaData: () => TAlignmentMetaData|null;

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

    /** Saves updated alignment training settings */
    saveChangedSettings: (config: TAlignmentSuggestionsConfig) => Promise<void>;

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
    
    /** info for the target language */
    targetLanguage: object;
    
    /** Font family for the target language text */
    targetLanguageFont?: string;
    
    /** Font size percentage for target text */
    targetFontSizePercent?: number;
    
    /** Array of target words to be aligned */
    targetWords: TargetWordBank[];
    
    /** Function to translate UI strings */
    translate: (key: string, params?: Record<string, string | number>) => string;
    
    /** Current alignments between source and target words */
    verseAlignments: Alignment[];
}

export const EnhancedWordAlignerPane: React.FC<EnhancedWordAlignerPaneProps> = (
{
    contextId,
    deleteBookFromGroup,
    lexiconCache,
    loadLexiconEntry,
    getModelMetaData,
    hasRenderedSuggestions,
    onChange,
    saveChangedSettings,
    suggestionsOnly,
    showPopover,
    sourceLanguageId,
    sourceLanguageFont,
    sourceFontSizePercent,
    styles,
    suggester,
    targetLanguage,
    targetLanguageFont,
    targetFontSizePercent,
    targetWords,
    translate,
    verseAlignments,
}) => {

    const [showModelDialog, setShowModelDialog] = useState(false);
    const [modelInfo, setModelInfo] = useState<TAlignmentMetaData | null>(null);
    
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
                targetLanguage={targetLanguage}
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