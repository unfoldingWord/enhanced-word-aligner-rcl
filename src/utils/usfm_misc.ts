import {default as word_aligner_default} from "word-aligner";
import _wordmapLexer, { Token } from "wordmap-lexer";
import { TUsfmVerse, TWord, AlignmentHelpers, TUsfmHeader, TSourceTargetAlignment, TTopBottomAlignment } from "word-aligner-rcl";
import { migrateOriginalLanguageHelpers } from 'word-aligner-rcl';
// @ts-ignore
import { referenceHelpers } from 'bible-reference-range'

export function parseUsfmHeaders(headers_section: TUsfmHeader[]) {
    const parsed_headers: { [key: string]: string } = headers_section.reduce((acc: { [key: string]: string }, entry: { tag: string, content: string }) => {
        if (entry.tag && entry.content) {
            return { ...acc, [entry.tag]: entry.content };
        }
        return acc;
    }, {});
    return parsed_headers;
}

export function is_number( value: string ){
    return !isNaN(parseInt(value));
}

export function isValidVerse(verse: string) {
    let isValid: boolean = referenceHelpers.isVerseSet(verse);
    if (!isValid) {
        isValid = is_number(verse);
    }
    return isValid;
}

export function getVerseList(verse: string) {
    const verses:number[] = [];
    const verseChunks: { verse:number, endVerse:number }[] = referenceHelpers.parseReferenceToList('1:' + verse)
    verseChunks.forEach(chunk => {
        const start = chunk.verse
        const end = chunk.endVerse
        for (let verse = start; verse <= end; verse++) {
            verses.push(verse)
        }
    })
    return verses;
}

export function only_numbers(to_filter: string[]): string[] {
    return to_filter.reduce((acc: string[], curr: string) => {
        if (is_number(curr)) acc.push(curr);
        return acc;
    }, []);
}

/**
 * for each item in word list convert occurrence(s) to numbers
 * @param {array} wordList
 * @returns {array}
 */
function convertOccurrences(wordList: TWord[]) {
    var wordList_ = wordList.map(function (item) {
      var occurrence = parseInt("" + item.occurrence);
      var occurrences = parseInt("" + item.occurrences);
      return { ...item, occurrence, occurrences };
    });
    return wordList_;
  }
  
  /**
   * Converts target or source verse objects into the text of the verse including punctuation.
   * @param verseObjects The verse objects from the usfm.
   * @returns String representing the target or source verse
   */
  export function verseObjectsToTargetString( verseObjects: TWord[] ): string{
    let result: string = verseObjects.map( (word: TWord):string => {
      if( word.type == "text" || word.type == "word" ) return word.text || word.word || "";
      if( word.type == "milestone" && word.children != undefined ) return verseObjectsToTargetString( word.children );
      return "";
    }).reduce( (previousValue: string, currentValue: string ): string => previousValue.concat( currentValue ) );
    return result;
  }

  /**
   * Converts target or source verse objects from usfm into TWord[] of just the words.
   * @param verseObjects the source or target usfm
   * @returns The tokens in TWord[] format of just the words.
   */
  export function verseObjectsToTWordTokens( verseObjects: TWord[] ): TWord[]{
    let result: TWord[] = verseObjects.reduce( (acc : TWord[], curr: TWord): TWord[] => {
      if( curr.type == "word" ) acc.push( curr );
      if( curr.type == "milestone" && curr.children != undefined ) acc = acc.concat( verseObjectsToTWordTokens( curr.children ) );
      return acc;
    }, [] );
    return result;
  }

  /**
 * parse target language and original language USFM text into the structures needed by the word-aligner
 * @param {string} targetVerseUSFM
 * @param {string|null} sourceVerseUSFM
 * @returns {{targetWords: *[], verseAlignments: *}}
 */
export function parseUsfmToWordAlignerData_JSON(targetVerseUSFM: TUsfmVerse, sourceVerseUSFM: TUsfmVerse) {
  var targetTokens : Token[] = [];
  if (targetVerseUSFM) {
    if( targetVerseUSFM ){
      const targetVerseString = verseObjectsToTargetString( targetVerseUSFM.verseObjects );
      targetTokens = _wordmapLexer.tokenize( targetVerseString );
    }
  }
  var sourceVerseObjects = sourceVerseUSFM;
  var targetWords: TWord[] = [];
  var targetVerseAlignments = extractAlignmentsFromTargetVerse_JSON(targetVerseUSFM, sourceVerseObjects);
  var verseAlignments = targetVerseAlignments.alignments;
  targetWords = AlignmentHelpers.markTargetWordsAsDisabledIfAlreadyUsedForAlignments(targetTokens, verseAlignments);
  return {
    targetWords: targetWords,
    verseAlignments: verseAlignments
  };
}

/**
 * extract alignments from target verse USFM using sourceVerse for word ordering
 * @param alignedTargetVerse
 * @param sourceVerse - optional source verse in verseObject format to maintain source language word order
 * @return {array} list of alignments in target text
 */
export function extractAlignmentsFromTargetVerse_JSON(targetVerse: TUsfmVerse, sourceVerse: TUsfmVerse) : {alignments: TSourceTargetAlignment[]}{
    
    
    var alignments = word_aligner_default.unmerge(targetVerse,sourceVerse);
    var originalLangWordList : TWord[] | undefined = undefined;

    if( sourceVerse !== undefined ){
      originalLangWordList = migrateOriginalLanguageHelpers.getOriginalLanguageListForVerseData(sourceVerse.verseObjects);
    } 
    var alignmentsWordList = migrateOriginalLanguageHelpers.getAlignedWordListFromAlignments(alignments.alignment);
    var targetTokens = AlignmentHelpers.getWordListFromVerseObjects(targetVerse.verseObjects);
    // clean up metadata in alignments
    if( originalLangWordList !== undefined ){
      migrateOriginalLanguageHelpers.updateAlignedWordsFromOriginalWordList(originalLangWordList, alignmentsWordList);
    }
    if (alignments.alignment) {
      // for compatibility change alignment to alignments
      // convert occurrence(s) from string to number
      var alignments_ = alignments.alignment.map(function (alignment: TTopBottomAlignment) {
        var topWords = convertOccurrences(alignment.topWords);
        var bottomWords = convertOccurrences(alignment.bottomWords);
        return {
          sourceNgram: topWords.map(function (topWord) {
            // word aligner uses sourceNgram instead of topWord
            if (originalLangWordList) {
              var pos = originalLangWordList.findIndex(function (item: TWord) {
                return topWord.word === (item.word || item.text) && topWord.occurrence === item.occurrence;
              });
              var _newSource = {  ...topWord,
                index: pos,
                text: topWord.text || topWord.word
              };
              delete _newSource.word;
              return _newSource;
            }
            var newSource = {...topWord,
              text: topWord.text || topWord.word
            };
            delete newSource.word;
            delete newSource.position;
            return newSource;
          }),
          targetNgram: bottomWords.map(function (bottomWord:TWord) {
            // word aligner uses targetNgram instead of bottomWords
            var word = bottomWord.text || bottomWord.word;
            // noinspection EqualityComparisonWithCoercionJS
            var pos = targetTokens.findIndex(function (item:TWord) {  //TODO: Should this be a token instead of a TWord?  Should TWord go away and just be token?
              return word === item.text &&
              // eslint-disable-next-line eqeqeq
              bottomWord.occurrence == item.occurrence;
            });
            var newTarget = {...bottomWord, 
              index: pos,
              text: word
            };
            delete newTarget.word;
            return newTarget;
          })
        };
      });
      alignments.alignments = alignments_;
    }
    return alignments;
  }
  


  /**
 * merge alignments into target verse
 */
export function mergeInAlignments(wordBankWords: TWord[], verseAlignments: TSourceTargetAlignment[], targetVerseObjects: TUsfmVerse ): TWord[] | null {
  const wordBank = wordBankWords.map(item => ({
    ...item,
    word: item.word || item.text,
    occurrence: item.occurrence || item.occurrence,
    occurrences: item.occurrences || item.occurrences,
  }))
  // remap sourceNgram:topWords, targetNgram:bottomWords,
  const alignments_ = verseAlignments.map(item => ({
    ...item,
    topWords: item.sourceNgram.map(item => ({
      strong: item.strong,
      lemma: item.lemma,
      morph: item.morph,
      occurrence: item.occurrence,
      occurrences: item.occurrences,
      word: item.word || item.text,
    })),
    bottomWords: item.targetNgram.map(item => ({
      ...item,
      word: item.word || item.text
    })),
  }));



  var verseString = verseObjectsToTargetString( targetVerseObjects.verseObjects );
  var verseObjects: TWord[] | null = null;
  try {
    var verseObjects_test = word_aligner_default.merge( alignments_, wordBank, verseString, false);
    if( Array.isArray(verseObjects_test) ){
      verseObjects = verseObjects_test;
    }
  } catch (e) {
    console.log("addAlignmentsToTargetVerseUsingMerge_JSON() - invalid alignment", e);
  }
  return verseObjects;
}
