// Component containing the complete UI for the Alignment Tool including verse navigation
//  and alignment suggestions

import React, { useState } from 'react'
import {
    ContextId,
    SourceWord,
    TargetWordBank,
    TSaveAlignmentData,
    TTranslationMemoryType,
} from "@/common/classes";
import { Alignment } from "wordmap";
import { TUseAlignmentSuggestionsReturn, useAlignmentSuggestions } from "@/hooks/useAlignmentSuggestions";
import { TAlignmentSuggestionsConfig } from "@/workers/WorkerComTypes";
import { useTrainingStateContext } from "@/hooks/TrainingStateProvider";
import { EnhancedWordAlignmentToolSub } from "@/components/EnhancedWordAlignmentToolSub";
import PromptDialog, { TShowPromptDialogProps } from "@/components/PromptDialog";
import PopoverComponent from "@/components/PopoverComponent";

const lexiconCache_ = {};

//////////////////////////
// TODO: connect up accelerator keys

// let platform = 'null';
// if ('platform' in navigator) {
//   platform = navigator.platform;
//   console.log(`Container: platform detected: ${platform}`, navigator);
// } else {
//   console.log(`Container: navigator does not support platform`, navigator);
// }
//
// // Function to detect the operating system
// const getOS = () => {
//   if (platform.startsWith('Mac')) return 'mac';
//   if (platform.startsWith('Win')) return 'windows';
//   return 'other';
// };
//
// const os = getOS();
// console.log(`Container: os detected ${os}`);
// const isMacOS = (os === 'mac');
//
// // Define key combinations based on the operating system
// const keyMap = {
//   REFRESH: os === 'mac' ? 'command+f' : 'ctrl+f',
//   ACCEPT: os === 'mac' ? 'command+e' : 'ctrl+e',
//   REJECT: os === 'mac' ? 'command+j' : 'ctrl+j',
//   CLEAR: os === 'mac' ? 'command+k' : 'ctrl+k',
//   COMPLETE: os === 'mac' ? 'command+t' : 'ctrl+t',
//   NEXT: os === 'mac' ? 'command+n' : 'ctrl+n',
//   EXPAND: os === 'mac' ? 'command+w' : 'ctrl+w',
// };

type AlignmentData = {
    targetWords?: TargetWordBank[];
    verseAlignments?: Alignment[];
}

type LanguageType = {
    languageId: string;
    direction: string;
}

/**
 * Checks if the given object is not empty.
 *
 * @param {Object} dataObject - The object to check.
 * @return {boolean} Returns true if the object is not empty, otherwise false.
 */
function notEmptyObject(dataObject: Object) {
  return dataObject && Object.keys(dataObject).length
}

/**
 * Props for the EnhancedWordAlignmentTool component
 *
 * @interface EnhancedWordAlignmentToolProps
 */
interface EnhancedWordAlignmentToolProps {
    /**
     * Function to add a property to the manifest object.
     * Used for updating project manifest with alignment-related metadata.
     */
    addObjectPropertyToManifest: (key: string, value: any) => void;

    /**
     * Translation memory data to be loaded into the alignment engine.
     * Contains source and target USFM content for training alignment models.
     */
    addTranslationMemory?: TTranslationMemoryType;

    /**
     * Configuration settings for the alignment suggestions engine.
     * Controls parameters like n-gram length, training steps, and memory settings.
     */
    alignmentSuggestionsConfig?: TAlignmentSuggestionsConfig;

    /**
     * State and actions from the useAlignmentSuggestions hook.
     * Provides access to alignment training, suggestion generation, and model management.
     */
    alignmentSuggestionsManage: TUseAlignmentSuggestionsReturn;

    /**
     * Collection of Bible translations and source texts used for alignment.
     * Contains both source language and target language Bible data.
     */
    bibles: Record<string, any>;

    /**
     * Display name of the current book being aligned.
     * Used for UI labels and user feedback.
     */
    bookName: string;

    /**
     * Current context identifier with bible, book, chapter, and verse reference.
     * Used to determine the scope for alignment operations.
     */
    contextId: ContextId;

    /**
     * Represents a promise that resolves to a Web Worker instance specifically designed
     * for handling alignment training tasks. This worker operates independently
     * in the background to manage computationally intensive alignment training operations.
     *
     * This property is passed in because different platforms initialize workers differently
     *
     * @type {Promise<Worker>}
     */
    createAlignmentTrainingWorker: () => Promise<Worker>;

    /**
     * Flag to initiate alignment training.
     * When set to true, the component will start the training process.
     */
    doTraining: boolean;

    /**
     * Function to handle edited target verse content.
     * Processes user modifications to target language verses.
     */
    editedTargetVerse: (verseData: any) => void;

    /**
     * Gateway language book data used as intermediate translation reference.
     * Optional reference material for alignment assistance.
     */
    gatewayBook?: Record<string, any>;

    /**
     * Function to retrieve lexicon data for source language words.
     * Fetches dictionary and grammatical information for alignment context.
     */
    getLexiconData?: (lexiconId: string, entryId: string) => any;

    /**
     * Grouped alignment data organized by categories or chapters.
     * Contains structured alignment information for navigation and processing.
     */
    groupsData?: Record<string, any>;

    /**
     * Index of groups for navigation and organization.
     * Provides ordered access to alignment group structure.
     */
    groupsIndex?: any[];

    /**
     * Controls whether suggestion buttons are enabled in the UI.
     * Default is true; when false, suggestion functionality is hidden.
     */
    hasRenderedSuggestions?: boolean;

    /**
     * Initial settings configuration for the tool.
     * Contains pane settings, key mappings, and tool-specific configurations.
     */
    initialSettings: Record<string, any>;

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
     * Callback function to save new alignment data.
     * Persists alignment changes to storage or external system.
     */
    saveNewAlignments?: (alignmentData: any) => void;

    /**
     * Function to save tool settings and configuration.
     * Persists user preferences and tool state.
     */
    saveToolSettings?: (settings: any) => void;

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
     * Source language book data containing the original text.
     * The authoritative text being aligned from (e.g., Greek, Hebrew).
     */
    sourceBook?: Record<string, any>;

    /**
     * Source language identifier (e.g., 'el-x-koine' for Greek, 'hbo' for Hebrew).
     * Used for language-specific processing and display.
     */
    sourceLanguage: LanguageType;

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
     * When true, only suggestion buttons are shown (the clear-all button is removed).
     * Used to simplify the UI in certain contexts.
     */
    suggestionsOnly?: boolean;

    /**
     * Target language book data containing translation text.
     * The text being aligned to the source language.
     */
    targetBook?: Record<string, any>;

    /**
     * Information about the target language (id code, direction, localized name).
     * Used for proper language rendering and processing.
     */
    targetLanguage: LanguageType;

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
     * Translation memory containing source and target USFM data for alignment training
     */
    translationMemory: TTranslationMemoryType,

    /**
     * Current alignments between source and target words.
     * The existing alignment data for the current verse.
     */
    verseAlignments: Alignment[];
}

export const EnhancedWordAlignmentTool: React.FC<EnhancedWordAlignmentToolProps>  = ({
  addObjectPropertyToManifest,
  alignmentSuggestionsConfig,
  bibles,
  bookName,
  contextId,
  createAlignmentTrainingWorker,
  editedTargetVerse,
  gatewayBook,
  getLexiconData,
  groupsData,
  groupsIndex,
  initialSettings,
  lexiconCache = lexiconCache_,
  loadLexiconEntry,
  saveNewAlignments,
  saveToolSettings,
  showPopover,
  sourceBook,
  sourceLanguage,
  sourceLanguageFont = '',
  sourceFontSizePercent = 100,
  styles,
  targetBook,
  targetLanguage,
  targetLanguageFont = '',
  targetFontSizePercent = 100,
  translate,
  translationMemory,
  }) => {

    const [translationMemoryLoaded, setTranslationMemoryLoaded] = useState<boolean>(false);
    const [doTraining, setDoTraining] = useState<boolean>(false);
    const [showPrompt, setShowPrompt] = useState<TShowPromptDialogProps|null>(null);
    const [lexiconData, setLexiconData] = useState<any>(null);

    const ref = contextId && contextId.reference;
    const bookId = ref?.bookId

    // Only provide translation memory when auto-training is enabled
    const addTranslationMemory = alignmentSuggestionsConfig.doAutoTraining ? translationMemory : null;

    // Access training state and actions from context
    const {
        actions: {
            handleTrainingStateChange
        }
    } = useTrainingStateContext()

    /**
     * Handles the completion of a training session.
     *
     * Called when training process finishes, allowing for post-training actions
     * such as logging results or updating UI elements.
     *
     * @param {TAlignmentCompletedInfo} info - Information about the completed training session
     */
    const handleTrainingCompleted = (info) => {
        console.log('handleTrainingCompleted', info);
    }

    // Initialize the alignment suggestions system using the custom hook
    const alignmentSuggestionsManage = useAlignmentSuggestions({
        config: alignmentSuggestionsConfig,
        contextId,
        createAlignmentTrainingWorker,
        handleTrainingStateChange,
        handleTrainingCompleted,
        shown: true,
        sourceLanguageId: sourceLanguage.languageId,
        targetLanguageId: targetLanguage.languageId,
    });

    // Extract state and actions from the alignment suggestions system
    const {
        actions: {
            isTraining,
            loadTranslationMemory,
            startTraining,
            stopTraining,
        }
    } = alignmentSuggestionsManage;

    /**
     * Initiates the training process using translation memory data if available.
     * The method checks for cached training data within `targetUsfmsBooks` and,
     * if present, loads the translation memory and starts the training process.
     *
     * @return {void} Does not return a value.
     */
    function startTraining_() {
      const targetUsfmsBooks = translationMemory?.targetUsfms;
      const haveCachedTrainingData = targetUsfmsBooks && Object.keys(targetUsfmsBooks).length > 0;

      if (haveCachedTrainingData) {
          console.log('WordAlignerArea: translation memory changed, loading translation memory')
          loadTranslationMemory(translationMemory);
          startTraining();
      } else {
          console.log('WordAlignerArea: translation memory not loaded')
      }
    }

    /**
     * Handles the "Do Training" click event by toggling the training state.
     * Initiates training if it is not currently active, otherwise stops the training.
     * Logs the current training state and actions taken in the console.
     *
     * @return {void} This method does not return any value.
     */
    function handleDoTrainingClick() {
      const training = isTraining()
      console.log(`handleDoTrainingClick, current training ${training}`);
      if (!training) {
          startTraining_();
      } else {
          console.log('handleDoTrainingClick - already training, cancelling')
          stopTraining()
      }
    }

    /**
     * Loads translation memory data into the alignment system
     *
     * This initializes the source-target text pairs needed for training
     * the alignment model and generating suggestions.
     */
    const handleLoadTranslationMemory = () => {
        console.log('Calling loadTranslationMemory')
        loadTranslationMemory(translationMemory);
        setTranslationMemoryLoaded(true)
    };

    /**
     * Handles the closure of a prompt by resetting its state.
     *
     * @return {void} This function does not return a value.
     */
    function onClosePrompt() {
      setShowPrompt(null);
    }

    /**
     * Saves the provided alignment data by invoking the saveNewAlignments function if defined.
     *
     * @param {TSaveAlignmentData} alignmentData - The alignment data to be saved.
     * @return {void} This function does not return a value.
     */
    function _saveAlignment(alignmentData: TSaveAlignmentData) {
      console.log('saveAlignmentd')
      saveNewAlignments?.(alignmentData)
      setShowPrompt(null); // clear prompt after saving
    }

    /**
     * Handles saving alignment data with an optional prompt if un accepted suggestions have been made.
     *
     * @param {TSaveAlignmentData} alignmentData - The alignment data object containing information about the alignment and suggestions.
     * @return {void} This function does not return a value.
     */
    function handleSaveAlignments(alignmentData: TSaveAlignmentData) {
        if (alignmentData.haveSuggestions) {
            const _showSuggestionWarning = {
                content: translate('alignments.use_suggestions'),
                noText: translate('buttons.no_button'),
                onClose: onClosePrompt,
                onNo: onClosePrompt,
                onYes: () => _saveAlignment(alignmentData),
                title: translate('warning'),
                yesText: translate('buttons.yes_button'),
            }
            setShowPrompt(_showSuggestionWarning );
        } else {
            _saveAlignment(alignmentData)
        }
    }
    
    return (
        <>
          <div>{targetLanguage?.languageId} - {bookId} {ref.chapter}:{ref.verse}</div>
            <EnhancedWordAlignmentToolSub
                addObjectPropertyToManifest={addObjectPropertyToManifest}
                addTranslationMemory={addTranslationMemory}
                alignmentSuggestionsConfig={alignmentSuggestionsConfig}
                alignmentSuggestionsManage={alignmentSuggestionsManage}
                bibles={bibles}
                bookName={bookName}
                contextId={contextId}
                doTraining={doTraining}
                editedTargetVerse={editedTargetVerse}
                getLexiconData={getLexiconData}
                groupsData={groupsData}
                groupsIndex={groupsIndex}
                handleDoTrainingClick={handleDoTrainingClick}
                initialSettings={initialSettings}
                lexiconCache={lexiconCache}
                loadLexiconEntry={loadLexiconEntry}
                saveNewAlignments={handleSaveAlignments}
                saveToolSettings={saveToolSettings}
                showPopover={setLexiconData}
                sourceBook={sourceBook}
                sourceLanguage={sourceLanguage}
                styles={styles}
                targetBook={targetBook}
                targetLanguageFont={targetLanguageFont}
                targetLanguage={targetLanguage}
                translate={translate}
            />

            {/** Lexicon Popup dialog */}
            <PopoverComponent
                popoverVisibility={!!lexiconData}
                title={lexiconData?.PopoverTitle || ''}
                bodyText={lexiconData?.wordDetails || ''}
                positionCoord={lexiconData?.positionCoord}
                onClosePopover={() => setLexiconData( null )}
            />

            <PromptDialog
                content={showPrompt?.content}
                onNo={showPrompt?.onNo}
                noText={showPrompt?.noText}
                onYes={showPrompt?.onYes}
                open={!!showPrompt}
                title={showPrompt?.title}
                translate={translate}
                yesText={showPrompt?.yesText}
            />
        </>
    );
};


