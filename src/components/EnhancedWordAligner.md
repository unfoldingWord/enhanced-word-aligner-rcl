Suggesting Word Aligner Example:

```js
import React, {useState} from 'react';
import {
  AlignmentHelpers,
  bibleHelpers,
  UsfmFileConversionHelpers,
  usfmHelpers
} from "word-aligner-rcl";
import usfm from 'usfm-js';
import {EnhancedWordAligner} from './EnhancedWordAligner'
import {extractVerseText} from "../utils/misc";
import delay from "../utils/delay";

import {NT_ORIG_LANG} from "../common/constants";

console.log('Loading WordAlignerComponent.md');

const removeClear = false;  // set true to remove clear button
const trainOnlyOnCurrentBook = true;
const bookId = 'tit';

// const alignedVerseJson = require('../__tests__/fixtures/alignments/en_ult_tit_1_1.json');
// const alignedVerseJson = require('../__tests__/fixtures/alignments/en_ult_tit_1_1_partial.json');
// const originalVerseJson = require('../__tests__/fixtures/alignments/grk_tit_1_1.json');
const LexiconData = require("../__tests__/fixtures/lexicon/lexicons.json");
const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemory.json");

// limit to single book
// translationMemory.targetUsfms = { "tit": translationMemory.targetUsfms.tit};
// translationMemory.sourceUsfms = { "tit": translationMemory.sourceUsfms.tit};

// const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryMat.json");
// merge together translationMemory and translationMemory2
// translationMemory.targetUsfms = {...translationMemory.targetUsfms, ...translationMemory2.targetUsfms};
// translationMemory.sourceUsfms = {...translationMemory.sourceUsfms, ...translationMemory2.sourceUsfms};
// const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemory2Cor.json");
// const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryMark.json");
// const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryActs.json");
// const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryRuth.json");

const translate = (key) => {
  const lookup = {
    "suggestions.refresh_suggestions": "Refresh suggestions.",
    "suggestions.refresh"            : "Refresh",
    "suggestions.accept_suggestions" : "Accept all suggestions.",
    "suggestions.accept"             : "Accept",
    "suggestions.reject_suggestions" : "Reject all suggestions.",
    "suggestions.reject"             : "Reject",
    "alignments.clear_alignments"    : "Clear all alignments.",
    "alignments.clear"              : "Clear",
  };
  if (!(key in lookup)) {
    console.log(`translate(${key})`)
  } else {
    return lookup[key];
  }
};

const targetLanguageId = 'en';
const chapter = 1;
const verse = 1;
var sourceUsfm = translationMemory.sourceUsfms[bookId] || '';
var targetUsfm = translationMemory.targetUsfms[bookId] || '';
const source_json = usfm.toJSON(sourceUsfm, {convertToInt: ['occurrence', 'occurrences']});
const target_json = usfm.toJSON(targetUsfm, {convertToInt: ['occurrence', 'occurrences']});
const sourceVerseUSFM = extractVerseText(sourceUsfm, chapter, verse)
const targetVerseUSFM = extractVerseText(targetUsfm, chapter, verse)

const alignedVerseJson = usfmHelpers.usfmVerseToJson(targetVerseUSFM);
const originalVerseJson = usfmHelpers.usfmVerseToJson(sourceVerseUSFM);

const {targetWords, verseAlignments} = AlignmentHelpers.parseUsfmToWordAlignerData(targetVerseUSFM, sourceVerseUSFM);

const alignmentComplete = AlignmentHelpers.areAlgnmentsComplete(targetWords, verseAlignments);
console.log(`Alignments are ${alignmentComplete ? 'COMPLETE!' : 'incomplete'}`);

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
    getLexiconData,
    translationMemory,
    styles
}) => {
  const [addTranslationMemory, setAddTranslationMemory] = useState(null);
  const [translationMemoryLoaded, setTranslationMemoryLoaded] = useState(false);
  const [doingTraining, setDoingTraining] = useState(false);
  const [trained, setTrained] = useState(false);
  const [training, setTraining] = useState(false);
  const [message, setMessage] = useState('');
  const [trainingError, setTrainingError] = useState('')
  const [trainingButtonStr, setTrainingButtonStr] = useState('');

  // Handler for the load translation memory button
  const handleLoadTranslationMemory = () => {
    console.log('Calling loadTranslationMemory')
    setAddTranslationMemory(translationMemory);
    setTranslationMemoryLoaded(true)
  };

  const handleToggleTraining = () => {
    const newTrainingState = !training;
    console.log('Toggle training to: ' + newTrainingState);
    setDoingTraining(newTrainingState);
  };

  const handleSetTrainingState = (props) => {
    if (!props) {
      console.log('handleSetTrainingState: no props');
      return;
    }

    let {
      percentComplete,
      training: _training,
      trainingComplete,
      trainingFailed,
    } = props || {};

    if (_training === undefined) {
      _training = training;
    } else {
      // console.log('Updating training state: ' + _training);
    }
    if (trainingComplete === undefined) {
      trainingComplete = trained;
    } else {
      // console.log('Updating trainingComplete state: ' + trainingComplete);
    }

    if (_training !== training) {
      setTraining(_training);
    }
    if (!_training && doingTraining) {
      setDoingTraining(false);
    }
    if (trainingComplete !== trained) {
      setTrained(trainingComplete);
    }

    let trainingErrorStr = ''
    let currentTrainingError = trainingError;
    if (typeof trainingFailed === 'string') {
      currentTrainingError = trainingFailed;
      setTrainingError(currentTrainingError)
    }
    if (currentTrainingError) {
      trainingErrorStr = " - " + currentTrainingError;
    }

    const trainingButtonStr = _training ? "Stop Training" : "Start Training"
    setTrainingButtonStr(trainingButtonStr);

    let trainingStatusStr_ = (_training ? "Currently Training ..." : trainingComplete ? "Trained" : "Not Trained") + trainingErrorStr;

    if (percentComplete !== undefined) {
      trainingStatusStr_ += ` ${percentComplete}% complete`;
    }
    console.log(`handleSetTrainingState new state: training ${_training}, trainingComplete ${trainingComplete}, trainingStatusStr ${trainingStatusStr_}`);
    
    setMessage(trainingStatusStr_);
  };

  const enableLoadTranslationMemory = !doingTraining;
  const enableTrainingToggle = trained || (translationMemoryLoaded && !doingTraining);

  return (
    <>
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

        <span style={{marginLeft: '8px', color: '#000'}}> {message} </span>

      </div>
      <EnhancedWordAligner
        config={{trainOnlyOnCurrentBook}}
        removeClear={removeClear}
        styles={{maxHeight: '450px', overflowY: 'auto', ...styles}}
        verseAlignments={verseAlignments}
        targetWords={targetWords}
        translate={translate}
        contextId={contextId}
        targetLanguageFont={targetLanguageFont}
        sourceLanguageId={sourceLanguageId}
        targetLanguageId={targetLanguageId}
        showPopover={showPopover}
        lexicons={lexicons}
        loadLexiconEntry={loadLexiconEntry}
        onChange={onChange}
        getLexiconData={getLexiconData}
        addTranslationMemory={addTranslationMemory}
        doTraining={doingTraining}
        handleSetTrainingState={handleSetTrainingState}
      />
    </>
  );
};

const App = () => {
  const targetLanguageFont = '';
  const source = bibleHelpers.getOrigLangforBook(bookId);
  const sourceLanguageId = source && source.languageId || NT_ORIG_LANG;
  const lexicons = {};
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
  const showPopover = (PopoverTitle, wordDetails, positionCoord, rawData) => {
    console.log(`showPopover()`, rawData)
    window.prompt(`User clicked on ${JSON.stringify(rawData)}`)
  };
  const loadLexiconEntry = (key) => {
    console.log(`loadLexiconEntry(${key})`)
    return LexiconData
  };
  const getLexiconData_ = (lexiconId, entryId) => {
    console.log(`loadLexiconEntry(${lexiconId}, ${entryId})`)
    const entryData = (LexiconData && LexiconData[lexiconId]) ? LexiconData[lexiconId][entryId] : null;
    return {[lexiconId]: {[entryId]: entryData}};
  };

  function onChange(results) {
    console.log(`WordAligner() - alignment changed, results`, results);// merge alignments into target verse and convert to USFM
    const {targetWords, verseAlignments} = results;
    const verseUsfm = AlignmentHelpers.addAlignmentsToVerseUSFM(targetWords, verseAlignments, targetVerseUSFM);
    console.log(verseUsfm);
    const alignmentComplete = AlignmentHelpers.areAlgnmentsComplete(targetWords, verseAlignments);
    console.log(`Alignments are ${alignmentComplete ? 'COMPLETE!' : 'incomplete'}`);
  }

  return (
    <div style={{height: '650px', width: '800px'}}>
      <WordAlignerPanel
        verseAlignments={verseAlignments}
        targetWords={targetWords}
        translate={translate}
        contextId={contextId}
        targetLanguageFont={targetLanguageFont}
        sourceLanguageId={sourceLanguageId}
        showPopover={showPopover}
        lexicons={lexicons}
        loadLexiconEntry={loadLexiconEntry}
        onChange={onChange}
        getLexiconData={getLexiconData_}
        translationMemory={translationMemory}
      />
    </div>
  );
};

App();
```
