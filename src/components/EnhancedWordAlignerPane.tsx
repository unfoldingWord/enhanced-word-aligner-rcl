/**
 * EnhancedWordAlignerPane Component
 * =================================
 *
 * @synopsis
 * A React component that provides the UI layer for enhanced word alignment with suggestions,
 * wrapping the SuggestingWordAligner from word-aligner-rcl and ModelInfoDialog. This
 * is the presentation part of the EnhancedWordAligner system.
 *
 * @description
 * The EnhancedWordAlignerPane component delivers the user interface for word alignment suggestions 
 * in Bible translation projects. It integrates with the WordMap algorithm to present alignment 
 * suggestions for unaligned text based on previously aligned verses. This component handles 
 * the visual presentation of alignments, suggestion buttons, model information display, and 
 * configuration options while delegating the actual alignment logic to its parent.
 *
 * Key responsibilities:
 * - Displaying source and target text for alignment
 * - Presenting UI for alignment suggestions
 * - Providing access to model information and settings
 * - Supporting manual alignment corrections
 * - Handling configuration changes and model management actions
 *
 * @properties
 * The component accepts numerous props to configure its behavior and appearance,
 * including language settings, styling options, callback handlers, and configuration parameters.
 *
 * @requirements
 * - Requires word-aligner-rcl as a dependency for the base alignment UI
 * - Parent component must provide alignment suggestion capabilities via the suggester prop
 * - Parent component must implement the model metadata and management functions
 * - Parent component should provide translation capabilities via the translate prop
 */

import React, {useEffect, useState} from 'react'
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

    /** how much to shift vertical for info modal */
    infoVerticalOffset?: string;
    
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
    infoVerticalOffset,
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
     * This method processes updated configuration settings and persists them
     * through the saveChangedSettings callback. After successful saving,
     * it refreshes the model information display to reflect the new configuration.
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
     * Displays the model information dialog with current model metadata.
     * 
     * Retrieves the current model metadata through the getModelMetaData callback,
     * updates the component state, and shows the model information dialog.
     * This function is triggered when the user clicks on the model info button.
     *
     * @return {void} No return value.
     */
    function handleInfoClick_() {
        console.log('EnhancedWordAlignerPane - handleInfoClick');
        const info = getModelMetaData()
        setModelInfo(info);
        setShowModelDialog(true);
    }

    /**
     * Removes a specific book's alignment data from the translation memory.
     *
     * This function deletes alignment data for the specified book and then
     * refreshes the model information display to reflect the updated state
     * of the translation memory.
     *
     * @param {string} bookId - The unique identifier of the book to be removed from alignment memory.
     */
    const handleDeleteBook = (bookId: string) => {
        console.log(`EnhancedWordAlignerPane - Delete alignment data for book: ${bookId}`);
        deleteBookFromGroup(bookId).then(() => {
            handleInfoClick_()
        });
    };

    // useEffect(() => {
    //     console.log('EnhancedWordAlignerPane initialized/mounted')
    //     // Cleanup function that runs on unmount
    //     return () => {
    //         console.log('EnhancedWordAlignerPane unmounted')
    //     };
    // }, []);
    
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
                    infoVerticalOffset={infoVerticalOffset}
                    onClose={() => setShowModelDialog(false)}
                    translate={translate}
                />
            )}
        </>
    )
}