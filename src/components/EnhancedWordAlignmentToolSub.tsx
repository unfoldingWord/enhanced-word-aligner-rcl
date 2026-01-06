import React, { useEffect, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles';
// @ts-ignore
import {
  AlignmentHelpers,
  complexScriptFonts,
  groupDataHelpers,
  GroupMenuComponent,
  ScripturePane,
  ToolControls,
  usfmHelpers,
// @ts-ignore
} from 'word-aligner-rcl'
import { EnhancedWordAligner } from './EnhancedWordAligner';

import isEqual from 'deep-equal'
import {
    ContextId,
    SourceWord,
    TAlignment,
    TargetWordBank,
    TSaveAlignmentData,
    TTranslationMemoryType,
} from "@/common/classes";
import { TUseAlignmentSuggestionsReturn } from "@/hooks/useAlignmentSuggestions";
import { TAlignmentSuggestionsConfig } from "@/workers/WorkerComTypes";
// @ts-ignore
import { cloneDeep } from "lodash";
import { useTrainingStateContext } from "@/hooks/TrainingStateProvider";

const lexiconCache_ = {};
const theme = createTheme(); // Create MUI theme

const localStyles = {
  container: {
    display: 'flex',
    flexDirection: 'row',
    width: '100vw',
    height: '100%',
  },
  groupMenuContainer: {
    width: '250px',
    height: '100%',
  },
  wordListContainer: {
    minWidth: '100px',
    maxWidth: '400px',
    height: '100%',
    display: 'flex',
  },
  alignmentAreaContainer: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    width: 'calc(100% - 450px)',
    height: '100%',
  },
  scripturePaneWrapper: {
    minHeight: '250px',
    marginBottom: '20px',
    maxHeight: '310px',
  },
  containerDiv:{
    display: 'flex',
    flexDirection: 'row',
    width: '97vw',
    height: '65vw',
  },
 centerDiv: {
    display: 'flex',
    flexDirection: 'column',
    width: '85%',
    overflowX: 'auto',
    marginLeft: '10px',
  },
  scripturePaneDiv: {
    display: 'flex',
    flexShrink: '0',
    height: '250px',
    paddingBottom: '20px',
  },
    alignmentGridWrapper: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    overflow: 'auto',
    boxSizing: 'border-box',
    margin: '0 10px 6px 10px',
    boxShadow: '0 3px 10px var(--background-color)',
  },
};

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

interface AlignmentData {
    targetWords?: TargetWordBank[];
    verseAlignments?: TAlignment[];
}

interface LanguageType {
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
 * Props for the EnhancedWordAlignmentToolSub component
 *
 * @interface EnhancedWordAlignmentToolSubProps
 */
interface EnhancedWordAlignmentToolSubProps {
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
   * Function to handle the user's click action when initiating the training process.
   * Typically used as a callback for a button click event.
   * This function does not take any arguments or return a value.
   */
  handleDoTrainingClick: () => void;
  
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
  saveNewAlignments?: (alignmentData: TSaveAlignmentData) => void;

  /**
   * A function that stores the settings for a specific tool or component.
   * This function can be invoked to save configuration data, helping preserve user preferences or state.
   *
   * @param {string} NAMESPACE - A unique identifier representing the context or module to which these settings apply.
   * @param {string} settingsName - The specific name or key associated with the settings being saved.
   * @param {any} paneSettings - An object or value representing the details of the settings to be stored.
   */
  saveToolSettings?: (NAMESPACE:string, settingsName: string, paneSettings: any) => void;

  /** true when alignments are to be shown */
  showAlignments?: boolean;

  /**
   * Function to display lexicon word details in a popover.
   * Shows lexical information when users interact with words.
   */
  showLexiconDataPopup: (
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
   * Function to translate UI strings.
   * Provides internationalization support for the component.
   */
  translate: (key: string, params?: Record<string, string | number>) => string;
}

export const EnhancedWordAlignmentToolSub: React.FC<EnhancedWordAlignmentToolSubProps>  = ({
    addObjectPropertyToManifest,
    addTranslationMemory,
    alignmentSuggestionsConfig,
    alignmentSuggestionsManage,
    bibles,
    bookName,
    contextId,
    doTraining,
    editedTargetVerse,
    getLexiconData,
    groupsData,
    groupsIndex,
    initialSettings,
    handleDoTrainingClick,
    lexiconCache = lexiconCache_,
    loadLexiconEntry,
    saveNewAlignments,
    saveToolSettings,
    showLexiconDataPopup = null,
    sourceBook,
    sourceFontSizePercent = 100,
    sourceLanguage,
    sourceLanguageFont = '',
    styles: styles_ = {},
    targetBook,
    targetLanguage= {},
    targetLanguageFont = '',
    targetFontSizePercent = 100,
    translate,
  }) => {

  const [currentContextId, setCurrentContextId] = useState<ContextId>(contextId);
  const [alignmentData, _setAlignmentData] = useState<AlignmentData>({});
  const [initialAlignmentData, setInitialAlignmentData] = useState<AlignmentData>({}); // keeps track of initial alignments before changes are made
  const [groupsMenuData, setGroupsMenuData] = useState<{ groupsIndex?: any[]; groupsData?: any }>({});

  /**
   * Updates the alignment data if the provided data differs from the existing one.
   *
   * @param {AlignmentData} alignmentData_ - The new alignment data to be set.
   * @return {void} This function does not return a value.
   */
  function setAlignmentData(alignmentData_: AlignmentData) {
    if (!isEqual(alignmentData, alignmentData_)) {
        _setAlignmentData(cloneDeep(alignmentData_))
    }
  }

  const {
    toolsSettings,
    manifest
  } = initialSettings || {}
  const {
    targetWords,
    verseAlignments
  } = alignmentData

  const currentPaneSettings = toolsSettings?.ScripturePane?.currentPaneSettings || [];
  
  // Extract training state management functions and state values
  const {
      state: {
          trainingStatusStr,
          trainingButtonStr,
      }
  } = useTrainingStateContext()  

  // @ts-ignore
  const targetDirection = targetLanguage?.direction || 'ltr';
  const readyToDisplayChecker = notEmptyObject(bibles) && notEmptyObject(groupsMenuData.groupsData) && notEmptyObject(sourceBook) && notEmptyObject(targetBook);

  const expandedScripturePaneTitle = bookName;
  const currentSelections = [] // TODO not sure if selections are even used in word Aligner


  /**
   * Retrieves alignment data based on a given context ID, extracting USFM data for both target and source verses,
   * and analyzing the alignment between their words.
   *
   * @param {ContextId} contextId_ - The context ID containing reference details (e.g., book, chapter, and verse).
   * @return {AlignmentData|null} An object containing target words and verse alignments if the data exists and is parsed successfully, otherwise null.
   */
  function getAlignmentData(contextId_: ContextId) {
    const ref = contextId_?.reference
    const targetVerseUSFM = groupDataHelpers.getVerseUSFM(targetBook, ref.chapter, ref.verse)
    const sourceVerseUSFM = groupDataHelpers.getVerseUSFM(sourceBook, ref.chapter, ref.verse)
    if (targetVerseUSFM && sourceVerseUSFM) {
      const {
        targetWords,
        verseAlignments
      } = AlignmentHelpers.parseUsfmToWordAlignerData(targetVerseUSFM, sourceVerseUSFM)

      const alignmentComplete = AlignmentHelpers.areAlgnmentsComplete(targetWords, verseAlignments)
      console.log(`Alignments are ${alignmentComplete ? 'COMPLETE!' : 'incomplete'}`)
      const newAlignmentData:AlignmentData = {
        targetWords,
        verseAlignments
      };
      return newAlignmentData;
    }
    return null;
  }

  /**
   * Updates the alignment data for the specified context ID by processing the target and source verses.
   *
   * @param {Object} contextId_ - The current context ID containing a reference to the chapter and verse.
   * @return {boolean} Returns true if the alignment data was successfully updated; otherwise, returns false.
   */
  function updateAlignmentData(contextId_: ContextId) {
      const newAlignmentData = getAlignmentData(contextId_);
      if (newAlignmentData) {
          setAlignmentData(newAlignmentData)
          return true
      }
      return false
  }

  useEffect(() => { // detect change of source alignments
    if (!isEqual(currentContextId, contextId)) {
      setCurrentContextId(contextId)
    }

    let foundData = false
    if (readyToDisplayChecker) {
        const newAlignmentData = getAlignmentData(contextId);
        if (newAlignmentData) {
            foundData = true
            setAlignmentData(newAlignmentData)
            setInitialAlignmentData(cloneDeep(newAlignmentData))
        }
    }

    if (!foundData) {
      setAlignmentData({})
    }
  }, [readyToDisplayChecker, contextId])

  useEffect(() => { // detect change of source alignments
    if (notEmptyObject(groupsData)) {
      setGroupsMenuData({groupsIndex, groupsData})
    }
  }, [groupsIndex, groupsData])

  /**
   * Updates and saves the specified tool settings.
   *
   * @param {string} NAMESPACE - The namespace that identifies the tool or module whose settings are being updated.
   * @param {string} settingsName - The name of the settings group to be updated.
   * @param {any} paneSettings - The specific settings to be saved for the tool or module.
   * @return {void} No return value.
   */
  function _setToolSettings(NAMESPACE:string, settingsName: string, paneSettings: any) {
    if (saveToolSettings) {
      console.log(`Saving settings for ${NAMESPACE} - ${settingsName}`)
      saveToolSettings(NAMESPACE, settingsName, paneSettings)
    }
  }

  /**
   * Navigates to the next check in the sequence
   */
  function handleGoToNext() {
    console.log(`handleGoToNext`)
    const nextCheck = GroupMenuComponent.findNextCheck(groupsData, currentContextId, false)
    changeCurrentCheck_(nextCheck, true)
  }

  /**
   * Navigates to the previous check in the sequence
   */
  function handleGoToPrevious() {
    console.log(`handleGoToPrevious`)
    const previousCheck = GroupMenuComponent.findPreviousCheck(groupsData, currentContextId, false)
    changeCurrentCheck_(previousCheck, true)
  }

  /**
   * Handles changes in alignment data by processing the updated alignments
   * and updating the target verse USFM content. It also determines if the
   * alignments are complete.
   *
   * @param {Object} newAlignmentData - The alignment data containing target words and verse alignments.
   * @param {Array} newAlignmentData.targetWords - The list of target words in the verse.
   * @param {Array} newAlignmentData.verseAlignments - The alignment mappings for the target words.
   * @return {void} This function does not return a value.
   */
  function handleAlignmentChange(newAlignmentData:AlignmentData) {
    console.log(`handleAlignmentChange() - alignment changed, results`, newAlignmentData);
    
    // merge alignments into target verse and convert to USFM
    const {targetWords, verseAlignments} = newAlignmentData;
    // get initial bible text
    const ref = currentContextId?.reference
    const targetVerseUSFM_ = groupDataHelpers.getVerseUSFM(targetBook, ref.chapter, ref.verse)
    const verseUsfm = AlignmentHelpers.addAlignmentsToVerseUSFM(targetWords, verseAlignments, targetVerseUSFM_);
    console.log(verseUsfm);
    const alignmentComplete = AlignmentHelpers.areAlgnmentsComplete(targetWords, verseAlignments);
    console.log(`Alignments are ${alignmentComplete ? 'COMPLETE!' : 'incomplete'}`);
    setAlignmentData({
      targetWords,
      verseAlignments
    })
  }

  /**
   * Reverts alignments to their initial state by setting alignment data
   * to predefined initialAlignmentData.
   *
   * @return {void} Does not return any value.
   */
  function handleRevertAlignments() {
    console.log(`handleRevertAlignments() - revering alignments to initial`);
    setAlignmentData(initialAlignmentData)
  }

  /**
   * Determines if there are any suggestions in the provided verse alignments.
   *
   * @param {Array<Object>} verseAlignments - An array of alignment objects where each object may include an `isSuggestion` property.
   * @return {boolean} Returns true if any alignment object has the `isSuggestion` property set to true; otherwise, returns false.
   */
  function checkForSuggestions(verseAlignments:any[]) {
      const _verseAlignments = verseAlignments || [];
      for (let i = 0; i < _verseAlignments.length; i++) {
          if (_verseAlignments[i]?.isSuggestion) {
              return true;
          }
      }
      return false
  }

  /**
   * Handles the saving of Bible text alignments with updated data.
   *
   * This function prepares the updated aligned verse data in USFM and JSON formats
   * and triggers a save operation using the provided `saveNewAlignments` handler.
   * It uses the current context reference, retrieves the initial Bible text,
   * updates alignments, and formats the aligned verse text appropriately.
   *
   * Dependencies:
   * - Retrieves the initial Bible verse in USFM format using `getVerseUSFM`.
   * - Updates the alignments of the target text using `addAlignmentsToVerseUSFM`.
   * - Converts the updated USFM text into JSON format using `usfmVerseToJson`.
   *
   * Preconditions:
   * - Requires `currentContextId` with a valid `reference` object containing
   *   `chapter` and `verse`.
   * - Expects `saveNewAlignments` to be defined for saving the processed alignments.
   *
   * @function
   * @name handleSaveAlignments
   */
  const handleSaveAlignments = () => {
    console.log( "handleSaveAlignments" );
    const ref = currentContextId?.reference
    const haveSuggestions = checkForSuggestions(verseAlignments)

    // get initial bible text
    const targetVerseUSFM_ = groupDataHelpers.getVerseUSFM(targetBook, ref.chapter, ref.verse)
    // apply new alignments to original verse text
    const targetVerseUSFM = AlignmentHelpers.addAlignmentsToVerseUSFM(targetWords, verseAlignments, targetVerseUSFM_);
    const targetVerseJSON = usfmHelpers.usfmVerseToJson(targetVerseUSFM);
    saveNewAlignments && saveNewAlignments(
    {
        contextId: currentContextId,
        targetWords: alignmentData.targetWords,
        verseAlignments: alignmentData.verseAlignments,
        targetVerseUSFM,
        targetVerseJSON,
        haveSuggestions,
    })
  }

  /**
   * Removes all alignments and updates the relevant alignment state and data.
   *
   * This function clears all existing verse alignments and ensures all target words
   * in the word bank are re-enabled if they were disabled due to prior alignments.
   * Updating the state involves the following steps:
   *
   * 1. Iterating through all alignments in the verse and identifying target tokens
   *    that need to be re-enabled in the word bank.
   * 2. Re-enabling the identified target tokens in the target word list.
   * 3. Clearing all alignments by setting `targetNgram` to an empty array and
   *    marking them as no longer suggestions.
   * 4. Updating the alignment data with the new cleared alignments and modified
   *    target word states.
   * 5. Invoking the change callback to notify listeners about the unalignment action.
   *
   * This function is intended to manage the reconciliation of alignment data and
   * ensure that the UI and underlying data align correctly when all alignments
   * are cleared.
   */
  const handleClearAlignments = () => {
    console.log( "handleClearAlignments" );
    const newAlignmentData = alignmentData ? cloneDeep(alignmentData) : {};
    //Make sure all words which were dropped are not disabled in the word list.
    const targetTokensNeedingDisabled = verseAlignments
      //Now reduce to target words.
      .reduce( (acc, alignment) => {
        // @ts-ignore
          alignment.targetNgram.forEach( targetToken => {
          acc.push( targetToken );
        });
        return acc;
      },[])
      //now reduce these to target words which are still disabled in the wordbox.
      .filter( targetToken => {
        const found = AlignmentHelpers.findInWordList(targetWords, targetToken);
        if( found < 0 ) return false;
        if( !targetWords[found].disabled ) return false;
        return true;
      });

    //if there are any of the target words needing to be disabled
    if( targetTokensNeedingDisabled.length > 0 ) {
      //Then map through creating new word objects which are disabled if they are in the targetTokensNeedingDisabled list.
      const newTargetWords = targetWords.map( targetWord => {
        if( AlignmentHelpers.findInWordList( targetTokensNeedingDisabled, targetWord ) >= 0 ) return { ...targetWord, disabled: false };
        return targetWord;
      });
      newAlignmentData.targetWords = newTargetWords;
    }

    //Drop all target tokens from verseAlignments
    const clearedAlignments = verseAlignments.map( alignment => {
      return {...alignment, isSuggestion: false, targetNgram: []};
    });
    
    const updatedVerseAlignments = AlignmentHelpers.alignmentCleanup(clearedAlignments);
    newAlignmentData.verseAlignments = updatedVerseAlignments;

    setAlignmentData(newAlignmentData)

    // doChangeCallback({
    //   type: UNALIGN_TARGET_WORD,
    //   source: GRID,
    //   destination: TARGET_WORD_BANK
    // }, updatedVerseAlignments);
  }

  /**
   * Changes the current check being worked on
   * Validates for unsaved changes before switching
   * @param {object} newContext - New check context
   * @param {boolean} noCheck - Skip validation if true
   */
  const changeCurrentCheck_ = (newContext, noCheck = false) => {
    const newContextId = newContext?.contextId

    if (newContextId) {
      const {
        reference: {
          bookId,
          chapter,
          verse,
        },
        tool,
        groupId,
      } = newContextId;
      const refStr = `${tool} ${groupId} ${bookId} ${chapter}:${verse}`;
      console.info(`changeCurrentCheck_() - setting new contextId to: ${refStr}`);

      setCurrentContextId(newContextId)
      updateAlignmentData(newContextId)
    }
  }

  /**
   * Resets the alignments by invoking the resetAlignments method and updates the alignment data with the reset values.
   *
   * This method logs the reset event, calls the resetAlignments function, and updates the state with the new alignment data.
   *
   * @return {void} No return value.
   */
  function onReset() {
    console.log("onReset() - reset Alignments")
    const alignmentData = AlignmentHelpers.resetAlignments(verseAlignments, targetWords)
    setAlignmentData({
      verseAlignments: alignmentData.verseAlignments,
      targetWords: alignmentData.targetWords,
    })
  }

  const haveVerseData = verseAlignments?.length && targetWords?.length

  return (
    <ThemeProvider theme={theme}>
      {readyToDisplayChecker ?
      // @ts-ignore
      <div id='checker' style={localStyles.container}>
        <GroupMenuComponent
          bookName={bookName}
          changeCurrentContextId={changeCurrentCheck_}
          contextId={currentContextId}
          direction={targetDirection}
          groupsData={groupsMenuData.groupsData}
          groupsIndex={groupsMenuData.groupsIndex}
          targetLanguageFont={targetLanguageFont}
          translate={translate}
        />
          {/* @ts-ignore */}
          <div style={localStyles.alignmentAreaContainer}>
          { notEmptyObject(bibles) &&
            <div style={localStyles.scripturePaneDiv}>
              <ScripturePane
                addObjectPropertyToManifest={addObjectPropertyToManifest}
                bibles={bibles}
                complexScriptFonts={complexScriptFonts}
                contextId={currentContextId}
                currentPaneSettings={currentPaneSettings}
                editVerseRef={null}
                editTargetVerse={editedTargetVerse}
                expandedScripturePaneTitle={expandedScripturePaneTitle}
                getAvailableScripturePaneSelections={null}
                getLexiconData={getLexiconData}
                makeSureBiblesLoadedForTool={null}
                projectDetailsReducer={{ manifest }}
                selections={currentSelections}
                setToolSettings={_setToolSettings}
                showPopover={showLexiconDataPopup}
                onExpandedScripturePaneShow={null}
                translate={translate}
              />
            </div>
          }
          <div>
            {haveVerseData ?
              <EnhancedWordAligner
                addTranslationMemory={addTranslationMemory}
                alignmentSuggestionsManage={alignmentSuggestionsManage}
                config={alignmentSuggestionsConfig}
                contextId={currentContextId}
                doTraining={doTraining}
                hasRenderedSuggestions={true}
                lexiconCache={lexiconCache}
                loadLexiconEntry={loadLexiconEntry}
                onChange={handleAlignmentChange}
                showDialog={true}
                showPopover={showLexiconDataPopup}
                sourceLanguageId={sourceLanguage.languageId}
                sourceLanguageFont={sourceLanguageFont}
                sourceFontSizePercent={sourceFontSizePercent}
                styles={{}}
                suggestionsOnly={true}
                targetLanguage={targetLanguage}
                targetLanguageFont={targetLanguageFont}
                targetFontSizePercent={targetFontSizePercent}
                targetWords={targetWords}
                translate={translate}
                verseAlignments={verseAlignments}
              />
            :
              "no verse data"
            }
            <ToolControls
              onClearClick={handleClearAlignments}
              onRevertClick={handleRevertAlignments}
              onSaveClick={handleSaveAlignments}
              onTrainingClick={handleDoTrainingClick}
              trainingButtonLabel={trainingButtonStr}
              trainingStatusStr={trainingStatusStr}
              translate={translate}
            />
          </div>
        </div>
      </div>
      :
        'Waiting for Data'
      }
    </ThemeProvider>
  );
};


