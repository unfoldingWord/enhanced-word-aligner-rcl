import {MAX_COMPLEXITY, MIN_COMPLEXITY} from '@/common/constants';
// @ts-ignore
import {referenceHelpers} from 'bible-reference-range';
import {getVerseList, isValidVerse} from '@/utils/usfm_misc';

/**
   * Checks to see if a specific string array references a given resource.
   * The locations in the string are [group][book name][chapter num][verse num]
   * The array only needs to be as long as the granularity.
   * @param currentSelection The selections to see if resourceKey is represented.
   * @param resourceKey A string array identifying resource at some granularity
   * @returns true if the referenced resource is selected.
   */
  export function isProvidedResourceSelected( currentSelection: string[][], resourceKey: string[] ):boolean{
    //iterate through the selected resources and return true on the first match.
    //If the selected resource array is shorter but what is there matches then it is still
    //a match.
    selectionLoop: for( const selected of currentSelection ){
      //if the resourceKey is shorter then the selected then it doesn't count
      //a chapter isn't selected if a verse is selected from it even if it is all the verses selected from it.
      if( selected.length > resourceKey.length ) continue selectionLoop;

      for( let i = 0; i < resourceKey.length; ++i ){
        //if we have matched this far and the iteration is longer then the selection
        //key then it is a valid selection.  Return true.
        if( i >= selected.length ) return true;

        //if we found a key that is different, then just continue with the next
        //selection option and see if it matches.
        if( selected[i] != resourceKey[i] ) continue selectionLoop;
      }
      //if we finish the loop, then it is all selected.
      return true;
    }
    return false;
  }


  export function isProvidedResourcePartiallySelected( currentSelection: string[][], resourceKey: string[] ):boolean{
    //iterate through the selected resources and return true on the first match.
    //If the selected resource array is shorter but what is there matches then it is still
    //a match.
    selectionLoop: for( const selected of currentSelection ){

      for( let i = 0; i < resourceKey.length || i < selected.length; ++i ){
        //if we have matched this far and the iteration is longer then the selection
        //key then it is a valid selection.  Return true.
        if( i >= selected.length ) return true;

        //if we have matched this far and the iteration is longer then the
        //resource key then it is at least a partial selection.  Return true.
        if( i >= resourceKey.length ) return true;

        //if we found a key that is different, then just continue with the next
        //selection option and see if it matches.
        if( selected[i] != resourceKey[i] ) continue selectionLoop;
      }
      //if we finish the loop, then it is all selected.
      return true;
    }
    return false;

  }

  /**
   * Extracts USFM content between chapter n and chapter n+1 (or end of file if last chapter)
   * @param usfmContent The complete USFM content as a string
   * @param chapterNum The chapter number to extract (1-based)
   * @returns The USFM content for the specified chapter, or empty string if chapter not found
   */
  export function extractChapterContent(usfmContent: string, chapterNum: number): string {
      if (!usfmContent || chapterNum < 1) {
          return '';
      }

      // Create regex to find the start of the requested chapter
      const startChapterRegex = new RegExp(`\\\\c\\s+${chapterNum}(?:\\s|$)`, 'm');
      const startMatch = usfmContent.match(startChapterRegex);

      if (!startMatch) {
          // Chapter not found
          return '';
      }

      const startIndex = startMatch.index!;

      // Create regex to find the start of the next chapter
      const nextChapterRegex = new RegExp(`\\\\c\\s+${chapterNum + 1}(?:\\s|$)`, 'm');
      const nextMatch = usfmContent.match(nextChapterRegex);

      let endIndex: number;
      if (nextMatch) {
          // Next chapter found, extract up to (but not including) the next chapter marker
          endIndex = nextMatch.index!;
      } else {
          // No next chapter found, extract to end of file
          endIndex = usfmContent.length;
      }

      return usfmContent.substring(startIndex, endIndex).trim();
  }

  /**
   * Extracts multiple chapters from USFM content
   * @param usfmContent The complete USFM content as a string
   * @param startChapter The starting chapter number (1-based, inclusive)
   * @param endChapter The ending chapter number (1-based, inclusive). If not provided, extracts only startChapter
   * @returns The USFM content for the specified chapter range
   */
  export function extractChapterRange(usfmContent: string, startChapter: number, endChapter?: number): string {
      if (!usfmContent || startChapter < 1) {
          return '';
      }

      const finalEndChapter = endChapter || startChapter;

      if (finalEndChapter < startChapter) {
          return '';
      }

      // Find the start of the first chapter
      const startChapterRegex = new RegExp(`\\\\c\\s+${startChapter}(?:\\s|$)`, 'm');
      const startMatch = usfmContent.match(startChapterRegex);

      if (!startMatch) {
          return '';
      }

      const startIndex = startMatch.index!;

      // Find the start of the chapter after the last requested chapter
      const afterEndChapterRegex = new RegExp(`\\\\c\\s+${finalEndChapter + 1}(?:\\s|$)`, 'm');
      const afterEndMatch = usfmContent.match(afterEndChapterRegex);

      let endIndex: number;
      if (afterEndMatch) {
          endIndex = afterEndMatch.index!;
      } else {
          endIndex = usfmContent.length;
      }

      return usfmContent.substring(startIndex, endIndex).trim();
  }
  
  /**
   * Extracts USFM content for a specific chapter and verse
   * @param usfmContent The complete USFM content as a string
   * @param chapterNum The chapter number to extract (1-based)
   * @param verseRef The verse number to extract (1-based)
   * @returns The USFM content for the specified verse, or empty string if not found
   */
  export function extractVerseContent(usfmContent: string, chapterNum: number, verseRef: number|string): string {
      const verseNum = parseInt(verseRef + '');
      if (!usfmContent || chapterNum < 1 || verseNum < 1) {
          return '';
      }

      // First, extract the chapter content
      const chapterContent = extractChapterContent(usfmContent, chapterNum);
      if (!chapterContent) {
          return '';
      }

      // Find the start of the requested verse
      const startVerseRegex = new RegExp(`\\\\v\\s+${verseRef}(?:\\s|$)`, 'm');
      const startMatch = chapterContent.match(startVerseRegex);

      if (!startMatch) {
          // Verse not found
          return '';
      }

      const startIndex = startMatch.index!;

      // Find the start of the next verse
      const nextVerseRegex = new RegExp(`\\\\v\\s+${verseNum + 1}(?:\\s|$)`, 'm');
      const nextMatch = chapterContent.match(nextVerseRegex);

      let endIndex: number;
      if (nextMatch) {
          // Next verse found, extract up to (but not including) the next verse marker
          endIndex = nextMatch.index!;
      } else {
          // No next verse found, check if there's another verse marker after this one
          const anyNextVerseRegex = /\\v\s+\d+(?:\s|$)/gm;
          let nextVerseMatch;
          let foundNextVerse = false;

          // Set regex lastIndex to start searching after our current verse
          anyNextVerseRegex.lastIndex = startIndex + startMatch[0].length;

          while ((nextVerseMatch = anyNextVerseRegex.exec(chapterContent)) !== null) {
              foundNextVerse = true;
              endIndex = nextVerseMatch.index;
              break;
          }

          if (!foundNextVerse) {
              // No other verse found, extract to end of chapter
              endIndex = chapterContent.length;
          }
      }

      return chapterContent.substring(startIndex, endIndex).trim();
  }

 /**
   * Extracts USFM content for a range of verses within a chapter
   * @param usfmContent The complete USFM content as a string
   * @param chapterNum The chapter number to extract (1-based)
   * @param startVerse The starting verse number (1-based, inclusive)
   * @param endVerse The ending verse number (1-based, inclusive). If not provided, extracts only startVerse
   * @returns The USFM content for the specified verse range
   */
  export function extractVerseRange(usfmContent: string, chapterNum: number, startVerse: number, endVerse?: number): string {
      if (!usfmContent || chapterNum < 1 || startVerse < 1) {
          return '';
      }

      const finalEndVerse = endVerse || startVerse;

      if (finalEndVerse < startVerse) {
          return '';
      }

      // First, extract the chapter content
      const chapterContent = extractChapterContent(usfmContent, chapterNum);
      if (!chapterContent) {
          return '';
      }

      // Find the start of the first verse
      const startVerseRegex = new RegExp(`\\\\v\\s+${startVerse}(?:\\s|$)`, 'm');
      const startMatch = chapterContent.match(startVerseRegex);

      if (!startMatch) {
          return '';
      }

      const startIndex = startMatch.index!;

      // Find the start of the verse after the last requested verse
      const afterEndVerseRegex = new RegExp(`\\\\v\\s+${finalEndVerse + 1}(?:\\s|$)`, 'm');
      const afterEndMatch = chapterContent.match(afterEndVerseRegex);

      let endIndex: number;
      if (afterEndMatch) {
          endIndex = afterEndMatch.index!;
      } else {
          // No verse after our range found, check if there's any other verse marker
          const anyNextVerseRegex = /\\v\s+\d+(?:\s|$)/gm;
          let nextVerseMatch;
          let foundNextVerse = false;

          // Set regex lastIndex to start searching after our range
          anyNextVerseRegex.lastIndex = startIndex;

          while ((nextVerseMatch = anyNextVerseRegex.exec(chapterContent)) !== null) {
              const verseNumber = parseInt(nextVerseMatch[0].match(/\\v\s+(\d+)/)?.[1] || '0');
              if (verseNumber > finalEndVerse) {
                  foundNextVerse = true;
                  endIndex = nextVerseMatch.index;
                  break;
              }
          }

          if (!foundNextVerse) {
              // No verse after our range, extract to end of chapter
              endIndex = chapterContent.length;
          }
      }

      return chapterContent.substring(startIndex, endIndex).trim();
  }


    /**
     * Extracts just the text content from a verse, removing verse markers
     * Handles both single verse markers (\v 111) and verse span markers (\v 111-112)
     * 
     * @param verseContent The verse content containing verse marker and text
     * @returns The verse text without the verse marker
     */
    export function getJustVerseText(verseContent: string) {
        // Remove verse marker from the beginning, matching both single verse and verse span formats
        const verseMarkerRegex = /^\\v\s+\d+(?:-\d+)?\s*/;
        return verseContent.replace(verseMarkerRegex, '').trim();
    }

  /**
   * Extracts just the text content of a verse (without the verse marker)
   * @param usfmContent The complete USFM content as a string
   * @param chapterNum The chapter number to extract (1-based)
   * @param verseNum The verse number to extract (1-based)
   * @returns The text content of the verse without the USFM marker
   */
  export function extractVerseText(usfmContent: string, chapterNum: number, verseNum: number|string): string {
      const verseNum_ = verseNum + ''
      if (isValidVerse(verseNum_)) {
          let content = ''
          const isSpan = referenceHelpers.isVerseSpan(verseNum);
          // look first for exact match
          const verseContent = extractVerseContent(usfmContent, chapterNum, verseNum);
          content = getJustVerseText(verseContent);
          if (content) { // if exact match found
              return content;
          } 
          
          if (isSpan) { // try getting each verse in span
              const verses = getVerseList(verseNum_);
              verses.forEach((verse) => {
                  const verseContent = extractVerseContent(usfmContent, chapterNum, verse)
                  content += getJustVerseText(verseContent)
              })
              return content
          }
      } else {
          console.log(`extractVerseContent not valid verse ${verseNum_}`);
          return '';
      }
  }

/**
   * Adjusts the complexity value to ensure it is within the allowable range.
   *
   * @param {number} newMaxComplexity - The proposed maximum complexity value that needs to be limited within predefined bounds.
   * @return {number} The constrained complexity value that falls within the MIN_COMPLEXITY and MAX_COMPLEXITY bounds.
   */
  export function limitRangeOfComplexity(newMaxComplexity: number) {
      // Ensure newMaxComplexity stays within MIN_COMPLEXITY and MAX_COMPLEXITY bounds
      return Math.max(MIN_COMPLEXITY, Math.min(MAX_COMPLEXITY, newMaxComplexity));
  }
  