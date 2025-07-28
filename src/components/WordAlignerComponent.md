Suggesting Word Aligner Example:

```js
import React, {useState} from 'react';
import {
  AlignmentHelpers,
  UsfmFileConversionHelpers,
  usfmHelpers
} from "suggesting-word-aligner-rcl";
import { WordAlignerComponent } from './WordAlignerComponent'

import {NT_ORIG_LANG} from "../common/constants";

// const alignedVerseJson = require('../__tests__/fixtures/alignments/en_ult_tit_1_1.json');
const alignedVerseJson = require('../__tests__/fixtures/alignments/en_ult_tit_1_1_partial.json');
const originalVerseJson = require('../__tests__/fixtures/alignments/grk_tit_1_1.json');
const LexiconData = require("../__tests__/fixtures/lexicon/lexicons.json");
const translationMemory = require("../__tests__/fixtures/alignments/full_books/translationMemory.json");
const translate = (key) => {
  console.log(`translate(${key})`)
};

const targetVerseUSFM = alignedVerseJson.usfm;
const sourceVerseUSFM = originalVerseJson.usfm;

const {targetWords, verseAlignments} = AlignmentHelpers.parseUsfmToWordAlignerData(targetVerseUSFM, sourceVerseUSFM);

const alignmentComplete = AlignmentHelpers.areAlgnmentsComplete(targetWords, verseAlignments);
console.log(`Alignments are ${alignmentComplete ? 'COMPLETE!' : 'incomplete'}`);

const WordAlignerPanel = ({
    verseAlignments,
    targetWords,
    translate,
    contextId,
    targetLanguageFont,
    sourceLanguage,
    showPopover,
    lexicons,
    loadLexiconEntry,
    onChange,
    getLexiconData,
    translationMemory,
    styles
}) => {
  const [addTranslationMemory, setAddTranslationMemory] = useState(null);
  const [doTraining, setDoTraining] = useState(false);
  const [training, setTraining] = useState(false);

  // Handler for the load translation memory button
  const handleLoadTranslationMemory = () => {
    console.log('Calling loadTranslationMemory')
    setAddTranslationMemory(translationMemory);
  };
  
  const handleToggleTraining = () => {
    const newTrainingState = !_training;
    console.log('Toggle training to: ' + newTrainingState);
    setDoTraining(newTrainingState);
  };
  
  const handleSetTrainingState = (_training) => {
    console.log('Updating training state: ' + _training);
    setTraining(_training);
  };
  
  const trainingButtonStr = training ? "Stop Training" : "Start Training"

  return (
    <>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleLoadTranslationMemory}
          className="load-translation-btn"
          style={{
            padding: '8px 16px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '10px'
          }}
        >
          Load Translation Memory
        </button>
        <button
          onClick={handleToggleTraining}
          className="toggle-training-btn"
          style={{
            padding: '8px 16px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '10px'
          }}
        >
          {trainingButtonStr}
        </button>
        {training && <span style={{ marginLeft: '8px', color: '#666' }}>Training...</span>}
      </div>
      <WordAlignerComponent
        styles={{ maxHeight: '450px', overflowY: 'auto', ...styles }}
        verseAlignments={verseAlignments}
        targetWords={targetWords}
        translate={translate}
        contextId={contextId}
        targetLanguageFont={targetLanguageFont}
        sourceLanguage={sourceLanguage}
        showPopover={showPopover}
        lexicons={lexicons}
        loadLexiconEntry={loadLexiconEntry}
        onChange={onChange}
        getLexiconData={getLexiconData}
        addTranslationMemory={addTranslationMemory}
        doTraining={doTraining}
        handleSetTrainingState={handleSetTrainingState}
      />
    </>
  );
};

const App = () => {
  const targetLanguageFont = '';
  const sourceLanguage = NT_ORIG_LANG;
  const lexicons = {};
  const contextId = {
    "reference": {
      "bookId": "tit",
      "chapter": 1,
      "verse": 1
    },
    "tool": "wordAlignment",
    "groupId": "chapter_1",
    "bibleId": "unfoldingWord/en_ult"
  };
  const showPopover = (PopoverTitle, wordDetails, positionCoord, rawData) => {
    console.log(`showPopover()`, rawData)
    window.prompt(`User clicked on ${JSON.stringify(rawData.token)}`)
  };
  const loadLexiconEntry = (key) => {
    console.log(`loadLexiconEntry(${key})`)
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
        sourceLanguage={sourceLanguage}
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
