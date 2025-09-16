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
import { EnhancedWordAligner } from './EnhancedWordAligner'
import { extractVerseText } from '../utils/misc';
import { useTrainingState } from '../hooks/useTrainingState'
import delay from "../utils/delay";

import {NT_ORIG_LANG} from "../common/constants";

console.log('Loading WordAlignerComponent.md');

const doAutoTraining = false; // set true to enable auto training of alignment suggestions
const suggestionsOnly = false;  // set true to remove clear button and add suggestion label
const trainOnlyOnCurrentBook = true; // if true, then training is sped up for small books by just training on alignment memory data for current book
const minTrainingVerseRatio = 1.1; // if trainOnlyOnCurrentBook, then this is protection for the case that the book is not completely aligned.  If a ratio such as 1.0 is set, then training will use the minimum number of verses for training.  This minimum is calculated by multiplying the number of verses in the book by this ratio
const keepAllAlignmentMemory = false; // EXPERIMENTAL FEATURE - if true, then alignment data not used for training will be added back into wordMap after training.  This should improve alignment vocabulary, but may negatively impact accuracy in the case of fully aligned books.
const keepAllAlignmentMinThreshold = 90; // EXPERIMENTAL FEATURE - if threshold percentage is set (such as value 60), then alignment data not used for training will be added back into wordMap after training, but only if the percentage of book alignment is less than this threshold.  This should improve alignment vocabulary for books not completely aligned

const targetLanguageId = 'en';
const bookId = 'eph';
const chapter = 5;
const verse = '22-23';

// const alignedVerseJson = require('../__tests__/fixtures/alignments/en_ult_tit_1_1.json');
// const alignedVerseJson = require('../__tests__/fixtures/alignments/en_ult_tit_1_1_partial.json');
// const originalVerseJson = require('../__tests__/fixtures/alignments/grk_tit_1_1.json');
const LexiconData = require("../__tests__/fixtures/lexicon/lexicons.json");
// const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemory.json");

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
const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemoryEphUST.json");

const translate = (key) => {
  const lookup = {
    "suggestions.refresh_suggestions": "Refresh suggestions.",
    "suggestions.refresh"            : "Refresh",
    "suggestions.accept_suggestions" : "Accept all suggestions.",
    "suggestions.accept"             : "Accept",
    "suggestions.reject_suggestions" : "Reject all suggestions.",
    "suggestions.reject"             : "Reject",
    "alignments.clear_alignments"    : "Clear all alignments.",
    "alignments.clear"               : "Clear",
    "suggestions.title"              : "Suggestions:",
    "suggestions.train_button"       : "Train",
    "suggestions.train_button_hint"  : "Click to improve the quality of alignment suggestions based on currently loaded alignments",
    "suggestions.stop_training_button" : "Stop Train",
    "suggestions.status_training"    : "Currently Training ...",
    "suggestions.status_retraining"  : "Currently Retraining ...",
    "suggestions.status_trained"     : "Trained",
    "suggestions.status_not_trained" : "Not Trained",
    "suggestions.percent_complete"   : "% complete",
    "suggestions.retrain_button"     : "Retrain",
    "suggestions.retrain_button_hint": "Click to improve the quality of alignment suggestions based on current book alignments",
  };
  if (!(key in lookup)) {
    const message = `translate(${key})`;
    console.warn(`Not Translated ${key}`, message)
    return message;
  } else {
    return lookup[key];
  }
};

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
    translationMemory,
    styles
}) => {
  const [addTranslationMemory, setAddTranslationMemory] = useState(null);
  const [translationMemoryLoaded, setTranslationMemoryLoaded] = useState(false);
  const [doingTraining, setDoingTraining] = useState(false);

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

  const handleInfoClick = (info) => {
    console.log("handleInfoClick");
    const message = (info && info.message) || JSON.stringify(info, null, 2)
    window.prompt(`Training Model:\n${message}`)
  }

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
  } = useTrainingState({
    translate,
  })

  const enableLoadTranslationMemory = !doingTraining;
  const enableTrainingToggle = trainingComplete || (translationMemoryLoaded && !doingTraining);
  const alignmentSuggestionsConfig = {
    doAutoTraining,
    minTrainingVerseRatio,
    trainOnlyOnCurrentBook,
    keepAllAlignmentMemory,
    keepAllAlignmentMinThreshold,
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

      <EnhancedWordAligner
        addTranslationMemory={addTranslationMemory}
        config={alignmentSuggestionsConfig}
        contextId={contextId}
        doTraining={doingTraining}
        handleInfoClick={handleInfoClick}
        handleTrainingStateChange={handleTrainingStateChange}
        lexicons={lexicons}
        loadLexiconEntry={loadLexiconEntry}
        onChange={onChange}
        showPopover={showPopover}
        sourceLanguageId={sourceLanguageId}
        styles={{...styles, maxHeight: '450px', overflowY: 'auto'}}
        suggestionsOnly={suggestionsOnly}
        targetLanguageFont={targetLanguageFont}
        targetLanguageId={targetLanguageId}
        targetWords={targetWords}
        translate={translate}
        translationMemory={translationMemory}
        verseAlignments={verseAlignments}
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
  );
};

App();
```
