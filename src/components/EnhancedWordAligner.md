### Enhanced Word Aligner Example

The `EnhancedWordAligner` component provides automated word alignment capabilities for Bible translation projects, combining machine learning with a user-friendly interface for manual corrections.

#### Usage Example

The example below demonstrates how to integrate the `EnhancedWordAligner` component into a Bible translation application:

```js
import React, {useRef, useState} from 'react';
import {
  AlignmentHelpers,
  bibleHelpers,
  UsfmFileConversionHelpers,
  usfmHelpers
} from "word-aligner-rcl";
import usfm from 'usfm-js';
import {EnhancedWordAligner} from './EnhancedWordAligner'
import {extractVerseText} from '../utils/misc';
import {useAlignmentSuggestions} from '../hooks/useAlignmentSuggestions'
import {TrainingStateProvider, useTrainingStateContext} from '../hooks/TrainingStateProvider'
import {is_initialized, locale_init, t} from '../utils/localization'
import {createAlignmentTrainingWorker} from '../workers/utils/startAlignmentTrainer'
import {getTranslationMemoryForBook} from '../workers/utils/AlignmentTrainerUtils'
import delay from "../utils/delay";

import {NT_ORIG_LANG} from "../common/constants";

console.log('Loading WordAlignerComponent.md');

// ############################################################
// Configuration options for alignment training and suggestions
// ############################################################

const doAutoLoadCachedTraining = false; // Enable to automatically load previously cached training data
const doAutoTraining = false; // Enable to automatically train models when content changes
const suggestionsOnly = false; // When true, simplifies UI by removing clear button and adding suggestion label
const trainOnlyOnCurrentBook = true; // Optimizes training by focusing on current book's alignment data. This could improve suggestions if book is fully aligned, but will have no vocabulary from other books.
const minTrainingVerseRatio = 1.1; // Protection ratio for incomplete book alignments when using trainOnlyOnCurrentBook.  If a ratio such as 1.1 is set, then training will use a minimum number of verses for training from translation memory.  This minimum is calculated by multiplying the number of verses in the book by this ratio
const keepAllAlignmentMemory = true; // EXPERIMENTAL FEATURE - if true, then alignment data not used for training will be added back into wordMap after training.  This should improve alignment vocabulary, but may negatively impact accuracy in the case of fully aligned books.
const keepAllAlignmentMinThreshold = 90; // EXPERIMENTAL FEATURE - if threshold percentage is set (such as value 90), then alignment data not used for training will be added back into wordMap after training, but only if the percentage of book alignment is less than this threshold.  This should improve alignment vocabulary for books not completely aligned

let translationMemory = {};

// ####################################
// configuring bible used for example
// ####################################

const targetLanguageId = 'en';
const direction = 'ltr' // language direction
const targetLanguage = {
  languageId: targetLanguageId,
  direction,
}
const UST = false; // if true then do a test with UST and verse ranges

let bookId = 'tit'; // change book id to change test data loaded
let chapter = 2;
let verse = '5';

if (UST) {
  bookId = 'eph';
  let chapter = 5;
  let verse = '22-23';
}

// ####################################
// load the test data
// ####################################


const LexiconData = require("../__tests__/fixtures/lexicon/lexicons.json");
const translations = require("../common/locales.json")

// Load translation memory for training the alignment model
// This contains aligned source (original language) and target (translation) USFM data

if (bookId === 'tit') {
    // includes gal, eph, tit, jas
    translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemory.json");
    // limit to single book
    translationMemory.targetUsfms = { "tit": translationMemory.targetUsfms.tit};
    translationMemory.sourceUsfms = { "tit": translationMemory.sourceUsfms.tit};
}
if (bookId === 'mat') {
  translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryMat.json");
}
if (bookId === '2co') {
  translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemory2Cor.json");
}
if (bookId === 'mrk') {
  translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryMark.json");
}
if (bookId === 'act') {
  translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryActs.json");
}
if (bookId === 'rut') {
  translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryRuth.json");
}
if (UST && bookId === 'eph') { // UST example
  const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryEphUST.json");
}
if (!translationMemory || !Object.keys(translationMemory).length) { // if it didn't match anything, fall back to multiverse
  // includes gal, eph, tit, jas
  translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemory.json");
}

// Initialize localization
if (!is_initialized()) {
  locale_init(translations)
  console.log(`initialized now ${is_initialized()}`)
}

const translate = t;
let sourceUsfm;
let targetUsfm;
let source_json;
let target_json;
let sourceVerseUSFM
let targetVerseUSFM

try {
  // Process USFM data to extract the current verse content
  sourceUsfm = translationMemory.sourceUsfms[bookId] || '';
  targetUsfm = translationMemory.targetUsfms[bookId] || '';
  source_json = usfm.toJSON(sourceUsfm, {convertToInt: ['occurrence', 'occurrences']});
  target_json = usfm.toJSON(targetUsfm, {convertToInt: ['occurrence', 'occurrences']});
  sourceVerseUSFM = extractVerseText(sourceUsfm, chapter, verse)
  targetVerseUSFM = extractVerseText(targetUsfm, chapter, verse)
} catch (e) {
  console.error(`could not get bible sources`)
  throw e
}

// Convert USFM to JSON and extract alignment data
const alignedVerseJson = usfmHelpers.usfmVerseToJson(targetVerseUSFM);
const originalVerseJson = usfmHelpers.usfmVerseToJson(sourceVerseUSFM);

// Parse the USFM into a format suitable for the word aligner
const {targetWords, verseAlignments} = AlignmentHelpers.parseUsfmToWordAlignerData(targetVerseUSFM, sourceVerseUSFM);

// Check if alignments are complete
const alignmentComplete = AlignmentHelpers.areAlgnmentsComplete(targetWords, verseAlignments);
console.log(`Alignments are ${alignmentComplete ? 'COMPLETE!' : 'incomplete'}`);

/**
 * WordAlignerPanel Component
 * 
 * This component wraps the EnhancedWordAligner with UI controls for managing
 * translation memory loading and alignment training. It demonstrates how to:
 * 1. Manage translation memory loading state
 * 2. Control training process (start/stop)
 * 3. Connect the alignment suggestions system with the UI
 * 4. Configure the training and suggestion parameters
 * 
 * @param {Object} props - Component properties
 * @returns {JSX.Element} - Rendered component
 */
const WordAlignerPanel = ({
    verseAlignments,
    targetWords,
    translate,
    contextId,
    targetLanguageFont,
    sourceLanguageId,
    showPopover,
    lexicons,
    loadLexiconEntry,
    onChange,
    translationMemory,
    styles
}) => {
  const [translationMemoryLoaded, setTranslationMemoryLoaded] = useState(false);
  const [doTraining, setDoTraining] = useState(false);
  const [cancelTraining, setCancelTraining] = useState(false);

  const bookId = contextId && contextId.reference && contextId.reference.bookId
  const shouldShowDialog = !!(targetWords && verseAlignments && bookId)
  const targetLanguageId = targetLanguage && targetLanguage.languageId;
  const verboseTraining = false;

  // Extract book-specific translation memory for current context
  const {targetUsfm, sourceUsfm} = getTranslationMemoryForBook(bookId, translationMemory);

  /**
   * Toggles the training process on/off
   * 
   * When activated, this sets doTraining=true to start the training process.
   * When deactivated, it sets cancelTraining=true to stop any ongoing training.
   */
  const handleToggleTraining = () => {
    const newTrainingState = !training;
    console.log('Toggle training to: ' + newTrainingState);
    if (newTrainingState) {
      setCancelTraining(false)
      setDoTraining(true);
    } else {
      setDoTraining(false);
      setCancelTraining(true)
    }
  };

  // UI control states
  const enableLoadTranslationMemory = !training;
  const enableTrainingToggle = trainingComplete || translationMemoryLoaded;
  
  // Configuration for the alignment suggestions engine
  const alignmentSuggestionsConfig = {
    doAutoLoadCachedTraining,
    doAutoTraining,
    minTrainingVerseRatio,
    trainOnlyOnCurrentBook,
    keepAllAlignmentMemory,
    keepAllAlignmentMinThreshold,
  };

  // Only provide translation memory when auto-training is enabled
  const addTranslationMemory = doAutoTraining ? translationMemory : null;

  // Access training state and actions from context
  const {
    actions: {
      handleTrainingStateChange
    },
    state: {
      training,
      trainingComplete,
      trainingError,
      trainingStatusStr,
      trainingButtonStr,
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
    shown: shouldShowDialog,
    sourceLanguageId: sourceLanguageId,
    targetLanguageId: targetLanguageId,
    targetUsfm,
    sourceUsfm,
  });

  // Extract state and actions from the alignment suggestions system
  const {
    state: {
      failedToLoadCachedTraining,
      trainingRunning,
    },
    actions: {
      areTrainingSameBook,
      getSuggester,
      getTrainingContextId,
      isTraining,
      loadTranslationMemory,
      startTraining,
      stopTraining,
      suggester,
    }
  } = alignmentSuggestionsManage;

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

  return (
    <>
      <div>{targetLanguageId} - {bookId} {chapter}:{verse}</div>
      <div style={{display: 'flex', gap: '10px'}}>
        <button
          onClick={handleLoadTranslationMemory}
          className="load-translation-btn"
          disabled={!enableLoadTranslationMemory}
          style={{
            padding: '8px 16px',
            backgroundColor: enableLoadTranslationMemory ? '#4285f4' : '#cccccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: enableLoadTranslationMemory ? 'pointer' : 'not-allowed',
            marginBottom: '10px'
          }}
        >
          Load Translation Memory
        </button>

        <button
          onClick={handleToggleTraining}
          className="toggle-training-btn"
          disabled={!enableTrainingToggle}
          style={{
            padding: '8px 16px',
            backgroundColor: enableTrainingToggle ? '#4285f4' : '#cccccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: enableTrainingToggle ? 'pointer' : 'not-allowed',
            marginBottom: '10px'
          }}
        >
          {trainingButtonStr}
        </button>

        <span style={{marginLeft: '8px', color: '#000'}}> {trainingStatusStr} </span>
      </div>

      {/* 
        EnhancedWordAligner Component
        
        This is the core component that provides the alignment functionality:
        - Displays source and target texts for alignment
        - Manages alignment model training via Web Workers
        - Provides suggestions for unaligned words based on training
        - Supports manual alignment corrections
        - Handles persistence of alignment data and models
      */}
      <EnhancedWordAligner
        addTranslationMemory={addTranslationMemory}
        alignmentSuggestionsManage={alignmentSuggestionsManage}
        cancelTraining={cancelTraining}
        config={alignmentSuggestionsConfig}
        contextId={contextId}
        doTraining={doTraining}
        lexicons={lexicons}
        loadLexiconEntry={loadLexiconEntry}
        onChange={onChange}
        showPopover={showPopover}
        sourceLanguageId={sourceLanguageId}
        styles={{...styles, maxHeight: '450px', overflowY: 'auto'}}
        suggestionsOnly={suggestionsOnly}
        targetLanguageFont={targetLanguageFont}
        targetLanguage={targetLanguage}
        targetWords={targetWords}
        translate={translate}
        translationMemory={translationMemory}
        verboseTraining={verboseTraining}
        verseAlignments={verseAlignments}
      />
    </>
  );
};

/**
 * Main App Component
 * 
 * Sets up the necessary context and data for the word alignment system
 * and renders the WordAlignerPanel component.
 * 
 * @returns {JSX.Element} Rendered application
 */
const App = () => {
  const targetLanguageFont = '';
  const source = bibleHelpers.getOrigLangforBook(bookId);
  const sourceLanguageId = source && source.languageId || NT_ORIG_LANG;
  const lexicons = {};
  
  // Define the current context for alignment
  const contextId = {
    "reference": {
      "bookId": bookId,
      "chapter": chapter,
      "verse": verse,
    },
    "tool": "wordAlignment",
    "groupId": "chapter_1",
    "bibleId": "unfoldingWord/en_ult"
  };
  
  console.log(`App() - contextId`, contextId);
  
  /**
   * Displays word details in a popover
   * 
   * This function is called when a user clicks on a word in the aligner,
   * showing relevant lexical information for the selected word.
   */
  const showPopover = (PopoverTitle, wordDetails, positionCoord, rawData) => {
    console.log(`showPopover()`, rawData)
    window.prompt(`User clicked on ${JSON.stringify(rawData)}`)
  };
  
  /**
   * Loads lexical entry data for a word
   * 
   * Retrieves lexical information for source language words,
   * which provides additional context for translators.
   */
  const loadLexiconEntry = (key) => {
    console.log(`loadLexiconEntry(${key})`)
    return LexiconData
  };

  /**
   * Handles alignment changes
   * 
   * Called when alignments are modified by the user or suggestion system.
   * This function updates the alignment data and can synchronize with
   * external systems or persistence mechanisms.
   */
  function onChange(results) {
    console.log(`WordAligner() - alignment changed, results`, results);
    
    // Extract updated alignment data
    const {targetWords, verseAlignments} = results;
    
    // Convert alignments back to USFM format
    const verseUsfm = AlignmentHelpers.addAlignmentsToVerseUSFM(targetWords, verseAlignments, targetVerseUSFM);
    console.log(verseUsfm);
    
    // Check if alignments are complete after changes
    const alignmentComplete = AlignmentHelpers.areAlgnmentsComplete(targetWords, verseAlignments);
    console.log(`Alignments are ${alignmentComplete ? 'COMPLETE!' : 'incomplete'}`);
  }

  return (
    <TrainingStateProvider
      translate={translate}
      verbose={true}>
     <div style={{height: '650px', width: '800px'}}>
      <WordAlignerPanel
        contextId={contextId}
        lexicons={lexicons}
        loadLexiconEntry={loadLexiconEntry}
        onChange={onChange}
        showPopover={showPopover}
        sourceLanguageId={sourceLanguageId}
        styles={{}}
        targetLanguageFont={targetLanguageFont}
        targetWords={targetWords}
        translate={translate}
        translationMemory={translationMemory}
        verseAlignments={verseAlignments}
      />
    </div>
   </TrainingStateProvider> 
  );
};

App();
```
## Key Integration Points

When integrating the `EnhancedWordAligner` component, pay attention to these important aspects:

1. **Training State Management**: Wrap your application with `TrainingStateProvider` to track training progress and status.

2. **Alignment Suggestions Hook**: Use the `useAlignmentSuggestions` hook to manage the alignment model training and suggestions generation.

3. **Translation Memory**: Provide source and target language USFM data through the `translationMemory` prop to train the alignment model.

4. **Training Control**: Implement UI controls for starting and stopping training, and handle the training state appropriately.

5. **Context Identification**: Provide proper `contextId` with book, chapter, and verse information to ensure correct alignment context.

6. **Callbacks**: Implement necessary callback functions for handling alignment changes, lexicon loading, and popover displays.

## Performance Considerations

- Training alignment models can be resource-intensive. Using Web Workers for background processing prevents UI freezing.
- Consider using `trainOnlyOnCurrentBook` for faster training on smaller books.
- The `keepAllAlignmentMemory` option improves vocabulary coverage but may impact suggestion quality if used inappropriately.
- For large projects, enable `doAutoLoadCachedTraining` to reuse previously trained models.
```
