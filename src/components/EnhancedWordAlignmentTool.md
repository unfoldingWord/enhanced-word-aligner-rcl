Enhance Word Alignment Tool Example with Verse Navigation and Scriptures Pane:

```js
import React, { useState } from 'react';
import {
  AlignmentHelpers,
  CommonConstants,
  groupDataHelpers,
  Translations,
  UsfmFileConversionHelpers,
  verseHelpers,
} from 'word-aligner-rcl'
import { EnhancedWordAlignmentTool } from './EnhancedWordAlignmentTool';
import cloneDeep from 'lodash.clonedeep';
import usfmjs from 'usfm-js';
import {EnhancedWordAligner} from './EnhancedWordAligner'
import {extractVerseText} from '../utils/misc';
import {useAlignmentSuggestions} from '../hooks/useAlignmentSuggestions'
import {TrainingStateProvider, useTrainingStateContext} from '../hooks/TrainingStateProvider'
import {is_initialized, locale_init, t} from '../utils/localization'
import {createAlignmentTrainingWorker} from '../workers/utils/startAlignmentTrainer'
import {getTranslationMemoryForBook} from '../workers/utils/AlignmentTrainerUtils'
import delay from "../utils/delay";

const translations = require('../__tests__/fixtures/locales/English-en_US.json')
const ugntBook = require('../__tests__/fixtures/bibles/1jn/ugntBible.json')
const enGlBook = require('../__tests__/fixtures/bibles/1jn/enGlBible.json')
const targetBook = require('../__tests__/fixtures/bibles/1jn/targetBible.json')
const LexiconData = require("../__tests__/fixtures/lexicon/lexicons.json");

console.log("starting EnhancedWordAlignmentTool demo")


// ############################################################
// Configuration options for alignment training and suggestions
// ############################################################

const doAutoLoadCachedTraining = false; // Enable to automatically load previously cached training data
const doAutoTraining = true; // Enable to automatically train models when content changes
const suggestionsOnly = false; // When true, simplifies UI by removing clear button and adding suggestion label
const trainOnlyOnCurrentBook = true; // Optimizes training by focusing on current book's alignment data. This could improve suggestions if book is fully aligned, but will have no vocabulary from other books.
const minTrainingVerseRatio = 1.1; // Protection ratio for incomplete book alignments when using trainOnlyOnCurrentBook.  If a ratio such as 1.1 is set, then training will use a minimum number of verses for training from translation memory.  This minimum is calculated by multiplying the number of verses in the book by this ratio
const keepAllAlignmentMemory = true; // EXPERIMENTAL FEATURE - if true, then alignment data not used for training will be added back into wordMap after training.  This should improve alignment vocabulary, but may negatively impact accuracy in the case of fully aligned books.
const keepAllAlignmentMinThreshold = 90; // EXPERIMENTAL FEATURE - if threshold percentage is set (such as value 90), then alignment data not used for training will be added back into wordMap after training, but only if the percentage of book alignment is less than this threshold.  This should improve alignment vocabulary for books not completely aligned

let translationMemory = {
  "targetUsfms": {
    "1jn": {
      targetBook,
    }
  },
  "sourceUsfms": {
    "1jn": {
      ugntBook,
    }
  }
};

const bookName = '1 John'
const bookId = 'ijn'
const toolName = 'wordAligner'
const gatewayBook = enGlBook;
const sourceBook = ugntBook;

// Bible data configuration for all scripture panes
const bibles = [
  {
    book: targetBook,
    languageId: 'targetLanguage',
    bibleId: 'targetBible',
    owner: 'unfoldingWord'
  },
  {
    book: sourceBook,
    languageId: 'el-x-koine',
    bibleId: 'ugnt',
    owner: 'unfoldingWord'
  },
  {
    book: gatewayBook,
    languageId: 'en',
    bibleId: 'ult',
    owner: 'unfoldingWord'
  },
]

const translate = (key, defaultValue) => {
  // console.log(`translate(${key})`)
  const translation = Translations.lookupTranslationForKey(translations, key)
  return translation
};

const {
  groupsData,
  groupsIndex
} = groupDataHelpers.initializeGroupDataForScripture(bookId, targetBook, toolName, sourceBook, translate)

// for testing, set finished flog for 1:4 and all of chapter 2
const item = groupDataHelpers.findVerseInRefGroupData(groupsData, groupsIndex, 1, 4)
if (item) {
  item[CommonConstants.FINISHED_KEY] = false
}
for (let verse = 1; verse < 25; verse++) {
  const item = groupDataHelpers.findVerseInRefGroupData(groupsData, groupsIndex, 2, verse)
  if (item) {
    item[CommonConstants.FINISHED_KEY] = false
  }
}

const initialTooleSettings = {
  paneSettings: bibles.map(bible => ({
    bibleId: bible.bibleId,
    font: null,
    fontSize: 100,
    languageId: bible.languageId,
    owner: bible.owner,
    actualLanguage: false,
    isPreRelease: false,
  })),
  paneKeySettings: {},
  toolsSettings: {},
  manifest: {}
}

//convert list to bibleObjects used by aligner
const biblesObject = verseHelpers.getBibleObject(bibles)

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
                            addObjectPropertyToManifest,
                            bibles,
                            bookName,
                            contextId,
                            editedTargetVerse,
                            gatewayBook,
                            getLexiconData,
                            groupsData,
                            groupsIndex,
                            initialSettings,
                            lexiconCache,
                            loadLexiconEntry,
                            saveNewAlignments,
                            saveToolSettings,
                            showPopover,
                            sourceBook,
                            sourceLanguage,
                            styles,
                            targetLanguageFont,
                            targetBook,
                            translate,
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
      <div style={{display: 'flex', gap: '10px', marginBottom: '10px'}}>
        {/* Book selector dropdown */}
        <select
          value={bookId}
          onChange={handleBookChange}
          style={{
            padding: '8px 16px',
            borderRadius: '4px',
            border: '1px solid #cccccc',
            backgroundColor: '#ffffff',
            cursor: 'pointer'
          }}
        >
          {availableBooks.map(book => (
            <option key={book} value={book}>{book.toUpperCase()}</option>
          ))}
        </select>

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
            cursor: enableLoadTranslationMemory ? 'pointer' : 'not-allowed'
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
            cursor: enableTrainingToggle ? 'pointer' : 'not-allowed'
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
      <EnhancedWordAlignmentTool
        addTranslationMemory={addTranslationMemory}
        alignmentSuggestionsConfig={alignmentSuggestionsConfig}
        alignmentSuggestionsManage={alignmentSuggestionsManage}
        cancelTraining={cancelTraining}
        contextId={contextId}
        doTraining={doTraining}
        lexicons={lexicons}
        loadLexiconEntry={loadLexiconEntry}
        onChange={onChange}
        showDialog={shouldShowDialog}
        showPopover={showPopover}
        sourceLanguageId={sourceLanguageId}
        styles={styles}
        suggestionsOnly={suggestionsOnly}
        targetLanguageFont={targetLanguageFont}
        targetLanguage={targetLanguage}
        targetWords={targetWords}
        translate={translate}
        translationMemory={translationMemory || []}
        verboseTraining={verboseTraining}
        verseAlignments={verseAlignments || []}
      />
    </>
  );
};

const App = () => {
  const [toolSettings, _setToolSettings] = useState(initialTooleSettings); // TODO: need to persist tools state, and read back state on startup

  const targetLanguageFont = '';
  const sourceLanguage = CommonConstants.NT_ORIG_LANG;
  const lexicons = {};
  const contextId = {
    "reference": {
      "bookId": bookId,
      "chapter": 1,
      "verse": 1
    },
    "tool": "wordAlignment",
    "groupId": "chapter_1"
  };


  /**
   * Displays a popover with word details when a user clicks on a word
   * @param {Component} PopoverTitle - The component to use as the popover title
   * @param {Object} wordDetails - Details about the clicked word
   * @param {Object} positionCoord - Coordinates for positioning the popover
   * @param {Object} rawData - Raw data about the clicked word
   */
  const showPopover = (PopoverTitle, wordDetails, positionCoord, rawData) => {
    console.log(`showPopover()`, rawData)
    window.prompt(`User clicked on ${JSON.stringify(rawData)}`)
  };

  /**
   * Loads lexicon data for a specified lexicon ID
   * @param {string} lexiconId - The ID of the lexicon to load
   * @returns {Object} The loaded lexicon data
   */
  const loadLexiconEntry = (lexiconId) => {
    console.log(`loadLexiconEntry(${lexiconId})`)
    return LexiconData
  };

  /**
   * Retrieves specific lexicon data for a given lexicon ID and entry ID
   * @param {string} lexiconId - The ID of the lexicon
   * @param {string} entryId - The ID of the specific entry within the lexicon
   * @returns {Object} An object containing the requested lexicon entry data
   */
  const getLexiconData_ = (lexiconId, entryId) => {
    console.log(`loadLexiconEntry(${lexiconId}, ${entryId})`)
    const entryData = (LexiconData && LexiconData[lexiconId]) ? LexiconData[lexiconId][entryId] : null;
    return { [lexiconId]: { [entryId]: entryData } };
  };

  /**
   * Saves new alignments to the target book
   * @param {Object} results - The alignment results to save
   * @param {Object} results.contextId - Context information including reference
   * @param {Array} results.targetVerseJSON - The verse data with updated alignments
   */
  function saveNewAlignments(results) {
    const { contextId, targetVerseJSON } = results;
    console.log(`EnhancedWordAlignmentTool.saveNewAlignments() - alignment changed for `, contextId);// merge alignments into target verse and convert to USFM
    const ref = contextId.reference
    if (targetBook) {
      const targetChapter = targetBook[ref.chapter]
      if (targetChapter) {
        const targetVerse = targetChapter[ref.verse]
        if (targetVerse) {
          const newChapter = { ...targetChapter }
          newChapter[ref.verse] = { verseObjects: targetVerseJSON } // replace with new verse
          targetBook[ref.chapter] = newChapter
        } else {
          console.error(`Invalid verse '${ref.chapter}:${ref.verse}'`)
        }
      } else {
        console.error(`Invalid chapter  '${ref.chapter}'`)
      }
    } else {
      console.error(`Missing book`, results)
    }
  }

  /**
   * Adds a new key name to the manifest object
   * @param {String} propertyName - key string name.
   * ex.
   * manifest {
   *  ...,
   *  [propertyName]: 'value',
   *  ...
   * }
   * @param {*} value - value to be saved in the propertyName
   */
  function addObjectPropertyToManifest(propertyName, value) {
    console.log(`addObjectPropertyToManifest - ${propertyName} = ${value}`)
    // TODO need to save setting in project manifest
  }

  /**
   * @description helper function that Updates/changes a tools'/modules' settings.
   * @param {string} moduleNamespace - module name that would be saved
   * @param {string} settingsPropertyName - is the property name to be used
   *  to save multiple settings names for a module.
   * @param {object} toolSettingsData - settings data.
   * @return {object} acton object.
   */
  function saveToolSettings(moduleNamespace, settingsPropertyName, toolSettingsData) {
    const _toolSettings = cloneDeep(toolSettings); // close to make new tools state object

    let moduleData = _toolSettings[moduleNamespace]
    if (!moduleData) {
      moduleData = {}
      _toolSettings[moduleNamespace] = moduleData
    }

    moduleData[settingsPropertyName] = toolSettingsData
    if (!isEqual(toolSettings, _toolSettings)) {
      console.log(`new toolSettings`, _toolSettings)
      _setToolSettings(_toolSettings)
    }
  };

  /**
   * This is called by tool when a verse has been edited. It updates group data reducer for current tool
   * and updates the file system for tools not loaded.
   * This will first do TW selections validation and prompt user if invalidations are found.
   * Then it calls updateVerseEditStatesAndCheckAlignments to save verse edits and then validate alignments.
   * @param {int} chapterWithVerseEdit
   * @param {int|string} verseWithVerseEdit
   * @param {string} before - the verse text before the edit
   * @param {string} after - the verse text after the edit
   * @param {array} tags - an array of tags indicating the reason for the edit
   * @param {string} username - user's name.
   * @param {string} gatewayLanguageCode - gateway Language Code.
   * @param {string} gatewayLanguageQuote - gateway Language quote.
   * @param {string} projectSaveLocation - project path.
   * @param {string} currentToolName - tool name.
   * @param {function} translate - locale function.
   * @param {function} showAlert - showAlert.
   * @param {function} closeAlert - closeAlert.
   * @param {function} showIgnorableAlert - showIgnorableAlert.
   * @param {function} updateTargetVerse - updateTargetVerse.
   * @param {object} toolApi - toolApi.
   */
  const editedTargetVerse = (chapterWithVerseEdit, verseWithVerseEdit, before, after, tags, username, gatewayLanguageCode, gatewayLanguageQuote, projectSaveLocation, currentToolName, translate, showAlert, closeAlert, showIgnorableAlert, updateTargetVerse, toolApi) => (dispatch, getState) => {
    const state = getState();
    const contextId = getContextId(state);
    const currentCheckContextId = contextId;
    const {
      bookId, chapter: currentCheckChapter, verse: currentCheckVerse,
    } = currentCheckContextId.reference;

    const contextIdWithVerseEdit = {
      ...currentCheckContextId,
      reference: {
        ...currentCheckContextId.reference,
        chapter: chapterWithVerseEdit,
        verse: verseWithVerseEdit,
      },
    };
  };

  return (
    <>
      <div style={{ width: '900px', overflow: 'auto' }}>
        <WordAlignerPanel
          addObjectPropertyToManifest={addObjectPropertyToManifest}
          bibles={biblesObject}
          bookName={bookName}
          contextId={contextId}
          editedTargetVerse={editedTargetVerse}
          gatewayBook={enGlBook}
          getLexiconData={getLexiconData_}
          groupsData={groupsData}
          groupsIndex={groupsIndex}
          initialSettings={toolSettings}
          lexiconCache={lexicons}
          loadLexiconEntry={loadLexiconEntry}
          saveNewAlignments={saveNewAlignments}
          saveToolSettings={saveToolSettings}
          showPopover={showPopover}
          sourceBook={sourceBook}
          sourceLanguage={sourceLanguage}
          styles={{ maxHeight: '800px', overflowY: 'auto' }}
          targetLanguageFont={targetLanguageFont}
          targetBook={targetBook}
          translate={translate}
        />
      </div>
    </>
  );
};

App();
```
