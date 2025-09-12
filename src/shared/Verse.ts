import {
    extractAlignmentsFromTargetVerse_JSON,
    mergeInAlignments,
    parseUsfmToWordAlignerData_JSON,
    verseObjectsToTargetString,
    verseObjectsToTWordTokens,
} from "@/utils/usfm_misc";
import { TWordAlignmentTestScore } from "@/workers/WorkerComTypes";
import { AlignmentHelpers, TUsfmVerse, TSourceTargetAlignment, TWord } from "word-aligner-rcl";
import {UNALIGNED_THRESHOLD} from "@/common/constants";
import {TState, TWordAlignerAlignmentResult} from "@/common/classes";

export enum VerseState {
    NoSource = "no-source",
    NoTarget = "no-target",
    Unaligned = 'unaligned',
    AlignedTrain = 'aligned-train',
    AlignedTest = 'aligned-test',
}

export default class Verse {

    state: VerseState = VerseState.NoTarget;
    sourceVerse: TUsfmVerse | null = null;
    targetVerse: TUsfmVerse | null = null;

    reservedForTesting: boolean = false;

    alignmentResults: TWordAlignmentTestScore | null = null;



    clone(): Verse{
        const result: Verse = new Verse();
        result.sourceVerse = this.sourceVerse;
        result.targetVerse = this.targetVerse;
        result.state = this.state;
        result.reservedForTesting = this.reservedForTesting;
        result.alignmentResults = this.alignmentResults;
        return result;
    }

    /**
     * Loads a verse using the given verse number string and verse object.
     *
     * @param {string} verse_number_string - The verse number string.
     * @param {any} verse - The verse object.
     * @return {Verse} The revived verse.
     */
    static load( verse_number_string: string, verse: any ): Verse {
        const newVerse: Verse = new Verse();
        //don't pull in the source verse because it is in the book structure.
        newVerse.sourceVerse = null;
        newVerse.targetVerse = null;
        if( verse.state ) newVerse.state = verse.state;
        if( verse.reservedForTesting !== undefined ) newVerse.reservedForTesting = verse.reservedForTesting;
        if( verse.alignmentResults !== undefined ) newVerse.alignmentResults = verse.alignmentResults;
        return newVerse;
    }

    toJSON(): any{
        return {
            state: this.state,
            reservedForTesting: this.reservedForTesting,
            alignmentResults: this.alignmentResults,
            //Don't export sourceVerse or targetVerse
            //because it is held at the book level in the json export.
        };
    }

    
    /**
     * Computes what the state of this verse should be.
     * @return {VerseState} - The state of this verse.
     */
    computeState(): VerseState{
        if( this.sourceVerse == null ) return VerseState.NoSource;
        if( this.targetVerse == null ) return VerseState.NoTarget;
        const wordAlignerData = parseUsfmToWordAlignerData_JSON( this.targetVerse, this.sourceVerse );
        const alignmentComputed = AlignmentHelpers.areAlgnmentsComplete(wordAlignerData.targetWords, wordAlignerData.verseAlignments);
        if( !alignmentComputed ) {
            const unalignedTargetWords = wordAlignerData.targetWords.filter(word => !word.disabled).length;
            const length = wordAlignerData.targetWords?.length || 0;
            const percentUnalignedTarget = length ? (unalignedTargetWords / length) * 100 : 100;
            if ((wordAlignerData.verseAlignments?.length < 1) || (percentUnalignedTarget > UNALIGNED_THRESHOLD)) {
                return VerseState.Unaligned;
            }
        }
        if( this.reservedForTesting ) return VerseState.AlignedTest;
        return VerseState.AlignedTrain;
    }


    /**
     * Adds a target USFM verse to the current verse and returns a new 
     * Verse object with the updated target verse.
     *
     * @param {TUsfmVerse} usfm_verse - The target USFM verse to be added.
     * @return {Verse} - A new Verse object with the updated target verse.
     */
    addTargetUsfm( usfm_verse: TUsfmVerse ): Verse{
        const newVerse: Verse = this.clone();
        newVerse.targetVerse = usfm_verse;

        newVerse.state = newVerse.computeState();

        return newVerse;
    }

    addSourceUsfm( usfm_verse: TUsfmVerse ):Verse{
        const newVerse: Verse = this.clone();
        newVerse.sourceVerse = usfm_verse;

        newVerse.state = newVerse.computeState();
        return newVerse;
    }

    setTestReservation( reservedForTesting: boolean ):Verse{
        const newVerse: Verse = this.clone();
        newVerse.reservedForTesting = reservedForTesting;

        newVerse.state = newVerse.computeState();
        return newVerse;
    }

    static getListHeaders():string[]{
        return ["Verse","Status","Ratio Correct"];
    }
    getListInfo( verse_num: number|string ):{ data:string[], keys:string[] }[]{
        return [{data:[ 
            "" + verse_num, 
            this.state, 
            (this.state === VerseState.AlignedTest) ? "" + this.alignmentResults?.ratio_correct : "" 
        ],keys:[""+verse_num]}];
    }

    getAlignmentState( chapter: number, verse: string ): TState | null{
        if( this.sourceVerse === null ) throw new Error( "No source text in verse" );
        if( this.targetVerse === null ) throw new Error( "No target text in verse" );

        //console.log( `potato: ${potato}`);


        const wordAlignerData = parseUsfmToWordAlignerData_JSON( this.targetVerse, this.sourceVerse );


        return {
            aligned: this.state !== VerseState.Unaligned,
            sourceLanguage: "sourceLang", //TODO: see if I can pull this information out of the usfm.
            targetLanguage: "targetLang", //TODO: ditto
            reference: {
                chapter, verse
            },
            alignerData:{
                wordBank:wordAlignerData.targetWords,
                alignments:wordAlignerData.verseAlignments,
            }
        };
    }

    updateAlignmentState( alignmentDialogResult: TWordAlignerAlignmentResult ): Verse{
        let result: Verse = this;

        if( this.targetVerse != null ){
            const newTargetVerse = mergeInAlignments( alignmentDialogResult.targetWords, alignmentDialogResult.verseAlignments, this.targetVerse );

            if( newTargetVerse != null ){
                result = this.addTargetUsfm({verseObjects: newTargetVerse} );
            }
        }

        return result;
    }


    /**
     * Returns the source verse as a string.
     *
     * @return {string|null} The source verse as a string, or null if the source verse is null.
     */
    getSourceVerseAsString():string|null{
        if( this.sourceVerse == null ) return null;
        return verseObjectsToTargetString( this.sourceVerse.verseObjects );
    }


    getSourceVerseAsTWords(): TWord[]{  
        if( this.sourceVerse == null ) return [];
        return verseObjectsToTWordTokens( this.sourceVerse.verseObjects );
    }

    getTargetVerseAsTWords(): TWord[]{
        if( this.targetVerse == null ) return [];
        return verseObjectsToTWordTokens( this.targetVerse.verseObjects );
    }

    /**
     * Returns the target verse as string.
     * 
     * @return {string|null} The target verse as a string, or null if the target verse is null.
     */
    getTargetVerseAsString():string|null{
        if( this.targetVerse == null ) return null;
        return verseObjectsToTargetString( this.targetVerse.verseObjects );
    }

    /**
     * Returns the verse alignment status.
     * 
     * @return {VerseState} The verse alignment status.
     */
    getVerseAlignmentStatus():VerseState{
        return this.state;
    }

    /**
     * Returns the verse alignments.
     * 
     * @return {TSourceTargetAlignment[]} The verse alignments.
     */
    getVerseAlignments():TSourceTargetAlignment[] | null{
        if( this.sourceVerse == null ) return null;
        if( this.targetVerse == null ) return null;
        return extractAlignmentsFromTargetVerse_JSON( this.targetVerse, this.sourceVerse).alignments;
    }

    addAlignmentTestResults( testResults: TWordAlignmentTestScore ): Verse{
        const newVerse = this.clone();
        newVerse.alignmentResults = testResults;
        return newVerse;
    }
    
}

