Enhance Word Alignment Tool Example with Verse Navigation and Scriptures Pane:

```js
import React, {useState} from 'react';
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
import isEqual from 'deep-equal';
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

const doAutoLoadCachedTraining = true; // Enable to automatically load previously cached training data
const doAutoTraining = true; // Enable to automatically train models when content changes
const suggestionsOnly = false; // When true, simplifies UI by removing clear button and adding suggestion label
const trainOnlyOnCurrentBook = true; // Optimizes training by focusing on current book's alignment data. This could improve suggestions if book is fully aligned, but will have no vocabulary from other books.
const minTrainingVerseRatio = 1.1; // Protection ratio for incomplete book alignments when using trainOnlyOnCurrentBook.  If a ratio such as 1.1 is set, then training will use a minimum number of verses for training from translation memory.  This minimum is calculated by multiplying the number of verses in the book by this ratio
const keepAllAlignmentMemory = true; // EXPERIMENTAL FEATURE - if true, then alignment data not used for training will be added back into wordMap after training.  This should improve alignment vocabulary, but may negatively impact accuracy in the case of fully aligned books.
const keepAllAlignmentMinThreshold = 90; // EXPERIMENTAL FEATURE - if threshold percentage is set (such as value 90), then alignment data not used for training will be added back into wordMap after training, but only if the percentage of book alignment is less than this threshold.  This should improve alignment vocabulary for books not completely aligned

// Configuration for the alignment suggestions engine
const alignmentSuggestionsConfig = {
  doAutoLoadCachedTraining,
  doAutoTraining,
  minTrainingVerseRatio,
  trainOnlyOnCurrentBook,
  keepAllAlignmentMemory,
  keepAllAlignmentMinThreshold,
};

function bookDataToUsfm(bookData) {
  const chapters = {...bookData}
  delete chapters.manifest;
  return usfmjs.toUSFM({chapters}, {chunk: true, forcedNewLines: true});
}

let translationMemory = {
  "targetUsfms": {
    "1jn": bookDataToUsfm(targetBook)
  },
  "sourceUsfms": {
    "1jn": bookDataToUsfm(ugntBook)
  }
};

// Set up languages

const targetLanguageId = 'en';
const targetDirection = 'ltr' // language direction
const targetLanguage = {
  languageId: targetLanguageId,
  direction: targetDirection,
}

const sourceLanguageId = CommonConstants.NT_ORIG_LANG;
const sourceDirection = 'ltr' // language direction
const sourceLanguage = {
  languageId: sourceLanguageId,
  direction: sourceDirection,
}

const bookName = '1 John'
const bookId = '1jn'
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

const translate = (key, data, defaultValue) => {
  // console.log(`translate(${key})`)
  const translation = Translations.lookupTranslationForKey(translations, key, data, defaultValue)
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

// set up the panes for the current bibles
const currentPaneSettings = bibles.map(bible => ({
  bibleId: bible.bibleId,
  font: null,
  fontSize: 100,
  languageId: bible.languageId,
  owner: bible.owner,
  actualLanguage: false,
  isPreRelease: false,
}));

// build the tools settings
const initialAppSettings = {
  paneKeySettings: {},
  toolsSettings: {
    ScripturePane: {
      currentPaneSettings
    }
  },
  manifest: {
    projectFont: "CharisSIL",
  }
}

//convert list to bibleObjects used by aligner
const biblesObject = verseHelpers.getBibleObject(bibles)

function getContextId(selectedBook, chapter, verse, bibleId) {
  // var bibleId = `unfoldingWord/en_${isUST ? 'ust' : 'ult'}`;
  const contextId = {
    "reference": {
      "bookId": selectedBook,
      "chapter": chapter,
      "verse": verse,
    },
    "tool": "wordAlignment",
    "groupId": "chapter_1",
    "bibleId": bibleId
  };
  return contextId;
}

/**
 * Main App Component
 *
 * Sets up the necessary context and data for the word alignment system
 * and renders the WordAlignerPanel component.
 *
 * @returns {JSX.Element} Rendered application
 */
const App = () => {
  const [appSettings, _setAppSettings] = useState(initialAppSettings); // TODO: need to persist tools state, and read back state on startup

  const targetLanguageFont = '';
  const lexicons = {};
  const contextId = getContextId(bookId, 1, 1, 'unfoldingWord/en_target')

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
    return {[lexiconId]: {[entryId]: entryData}};
  };

  /**
   * Saves new alignments to the target book
   * @param {Object} results - The alignment results to save
   * @param {Object} results.contextId - Context information including reference
   * @param {Array} results.targetVerseJSON - The verse data with updated alignments
   */
  function saveNewAlignments(results) {
    const {contextId, targetVerseJSON} = results;
    console.log(`EnhancedWordAlignmentTool.saveNewAlignments() - alignment changed for `, contextId);// merge alignments into target verse and convert to USFM
    const ref = contextId.reference
    if (targetBook) {
      const targetChapter = targetBook[ref.chapter]
      if (targetChapter) {
        const targetVerse = targetChapter[ref.verse]
        if (targetVerse) {
          const newChapter = {...targetChapter}
          newChapter[ref.verse] = {verseObjects: targetVerseJSON} // replace with new verse
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
    const _appSettings = cloneDeep(appSettings); // close to make new tools state object
    const manifest = _appSettings.manifest;
    if (manifest && propertyName) {
      manifest[propertyName] = value;
      _setAppSettings(_appSettings) // update current settings
    }
    // TODO need to save manifest setting in project manifest
  }

  /**
   * @description helper function that Updates/changes a tools'/modules' settings.
   * @param {string} moduleNamespace - module name that would be saved
   * @param {string} settingsPropertyName - is the property name to be used
   *  to save multiple settings names for a module.
   * @param {object} newSettingsData - settings data.
   * @return {object} acton object.
   */
  function saveToolSettings(moduleNamespace, settingsPropertyName, newSettingsData) {
    const newAppSettings = cloneDeep(appSettings); // close to make new tools state object
    const newToolSettings = newAppSettings && newAppSettings.toolsSettings
    let moduleData = newToolSettings && newToolSettings[moduleNamespace]
    if (!moduleData) { // if doesn't exist yet, create it
      moduleData = {}
      newToolSettings[moduleNamespace] = moduleData
    }

    moduleData[settingsPropertyName] = newSettingsData
    if (!isEqual(appSettings, newAppSettings)) {
      console.log(`saveToolSettings() - new toolSettings`, newAppSettings)
      _setAppSettings(newAppSettings)
      //TODO: persist data
    }
  };

  /**
   * This is called by tool when a verse has been edited. These allows other tools to do invalidation checking
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

    // TODO - validation is not implemented
  };

  function createAlignmentTrainingWorker_() {
    try {
      // TRICKY: this createAlignmentTrainingWorker function works in styleguidist,
      // but another example is gateway-edit web app - see the example at:
      //    https://github.com/unfoldingWord/gateway-edit/blob/develop/src/workers/startAlignmentTrainer.js
      // different platforms initialize workers differently
      createAlignmentTrainingWorker()
      console.log('createAlignmentTrainingWorker_() - success creating training worker')
    } catch (e) {
      console.error('createAlignmentTrainingWorker_() - could not create training worker', e)
    }
  }

  return (
    <>
      <div style={{width: '1600px', overflow: 'auto'}}>
        <TrainingStateProvider
          translate={translate}
          verbose={true}>
          <EnhancedWordAlignmentTool
            addObjectPropertyToManifest={addObjectPropertyToManifest}
            alignmentSuggestionsConfig={alignmentSuggestionsConfig}
            bibles={biblesObject}
            bookName={bookName}
            contextId={contextId}
            createAlignmentTrainingWorker={createAlignmentTrainingWorker_}
            editedTargetVerse={editedTargetVerse}
            gatewayBook={enGlBook}
            getLexiconData={getLexiconData_}
            groupsData={groupsData}
            groupsIndex={groupsIndex}
            initialSettings={appSettings}
            lexiconCache={lexicons}
            loadLexiconEntry={loadLexiconEntry}
            saveNewAlignments={saveNewAlignments}
            saveToolSettings={saveToolSettings}
            showPopover={showPopover}
            sourceBook={sourceBook}
            sourceLanguage={sourceLanguage}
            styles={{maxHeight: '800px', overflow: 'auto'}}
            targetLanguage={targetLanguage}
            targetLanguageFont={targetLanguageFont}
            targetBook={targetBook}
            translate={translate}
            translationMemory={translationMemory}
          />
        </TrainingStateProvider>
      </div>
    </>
  );
};

App();
```
