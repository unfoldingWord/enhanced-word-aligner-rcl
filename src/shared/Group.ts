import { is_number, parseUsfmHeaders } from "@/utils/usfm_misc";
import Book, { TBookTestResults } from "./Book";
import Verse from "./Verse";
import { TSourceTargetAlignment, TUsfmBook, TUsfmChapter, TWord } from "word-aligner-rcl";
import JSZip from "jszip";
import { TTrainingAndTestingData } from "@/workers/WorkerComTypes";
import {TState, TWordAlignerAlignmentResult} from "@/common/classes";
import { bibleHelpers } from 'word-aligner-rcl';

export interface TGroupTestResults{
    [key:string]: TBookTestResults
}

export default class Group {
    books: { [key: string]: Book };

    constructor( newBooks?: {[key:string]: Book}) {
        this.books = newBooks || {};
    }

    /**
     * Loads a Group object from a serialized representation.
     *
     * @param {Object} group - The serialized representation of a Group object.
     * @return {Group} A new Group object.
     */
    static load( group_name_string: string, group: {[key:string]: any} ): Group {
        const newBooks : {[key:string]: Book} = {};
        if( !group ) return new Group(newBooks);
        if( !group.books ) return new Group(newBooks);
        if( !(group.books instanceof Object) ) return new Group(newBooks);
        Object.entries(group.books as any).forEach( ([book_name,book]: [string,any]) => {
            newBooks[book_name] = Book.load(book_name, book);
        })
        return new Group(newBooks);
    }

    hasBook( usfmBookName: string ): boolean{
        return usfmBookName in this.books;
    }

    /**
     * This adds usfm to this group collection, but does so without
     * changing the original group collection in order to make it react compatible.
     */
    addTargetUsfm( usfm_json: {[key:string]:TUsfmBook} ): Group {
        const newBooks: {[key:string]:Book} = {};

        Object.entries(usfm_json).forEach(([filename,usfm_book])=>{
            const usfmHeaders = parseUsfmHeaders(usfm_book.headers);
            const newBook = this.books[usfmHeaders.h] || new Book( {chapters:{},filename:"",toc3Name:"",targetUsfmBook:null,sourceUsfmBook:null} );
            newBooks[usfmHeaders.h] = newBook.addTargetUsfm({filename,usfm_book,toc3Name:usfmHeaders.toc3});
        });

        return new Group({...this.books, ...newBooks});
    }

    addSourceUsfm( {usfm_json: usfm_json,isResourceSelected,group_name}:{usfm_json:{[key:string]:TUsfmBook},isResourceSelected:( resourceKey: string[] )=>boolean,group_name:string} ): {addedVerseCount:number,droppedVerseCount:number,newGroup:Group }{
        const modifiedBooks: {[key:string]:Book} = {};

        //rehash our books by their toc3.
        const toc3_books: {[key:string]:[bookName:string,book:Book]} = Object.fromEntries( Object.entries(this.books ).map( ([bookName,book]:[string,Book]) => {
            return [book.toc3Name,[bookName,book]];
        }));


        let totalAddedVerseCount:number = 0;
        let totalDroppedVerseCount:number = 0;
        //Now run through each of the imported books and match them up.
        Object.entries(usfm_json).forEach( ([filename,usfm_book]:[book_name:string,book_json:TUsfmBook]) => {
            const parsedUsfmHeaders = parseUsfmHeaders(usfm_book.headers);
            
            if( parsedUsfmHeaders.toc3 in toc3_books ){
                const [bookName,book]:[string,Book] = toc3_books[parsedUsfmHeaders.toc3];
                const{ addedVerseCount, droppedVerseCount, modifiedBook } = book.addSourceUsfm( {usfm_book, isResourceSelected, group_name, book_name:bookName} )
                totalAddedVerseCount += addedVerseCount;
                totalDroppedVerseCount += droppedVerseCount;
                modifiedBooks[bookName] = modifiedBook;
            }else{
                //count the verses in the book
                let nonMatchedVerseCount = 0;
                Object.entries(usfm_book.chapters).forEach(([chapter_num,chapter_json]:[string,TUsfmChapter]) => {
                    if( is_number(chapter_num) ){
                        Object.entries(chapter_json).forEach(([verse_num,verse_json]) => {
                            if( is_number( verse_num ) ){
                                nonMatchedVerseCount += 1;
                            }
                        });
                    }
                });
                totalDroppedVerseCount += nonMatchedVerseCount;
            }
        })
        return {addedVerseCount:totalAddedVerseCount,
            droppedVerseCount:totalDroppedVerseCount,
            newGroup:new Group({ ...this.books, ...modifiedBooks}) };
    }

    setTestReservation( {reservedForTesting, isResourcePartiallySelected, group_name }: {reservedForTesting:boolean, isResourcePartiallySelected:( resourceKey: string[] )=>boolean,group_name:string }):Group{
        //Map through our books and modify them accordingly.
        const newBooks : {[key:string]: Book} = Object.fromEntries(Object.entries(this.books).map( ([book_name,book])=>{
            return [book_name, isResourcePartiallySelected( [ group_name, book_name] ) ? 
                book.setTestReservation( {reservedForTesting, isResourcePartiallySelected, group_name, book_name } ) :
                book];
        }));
        return new Group( newBooks );
    }

    static getListHeaders( scope:string ):string[]{
        if( scope == "Group" ) return ["Group", "Books" ];
        return ["Group"].concat( Book.getListHeaders(scope) );
    }

    getListInfo( group_name: string, scope:string ):{ data:string[], keys:string[] }[]{
        const result: { data:string[], keys:string[] }[] = [];
        if( scope == "Group" ){
            result.push({
                data:[group_name,""+Object.values(this.books).length],
                keys:[group_name],
            });
        }else{
            Object.entries(this.books).forEach(([book_name,book])=>{
                book.getListInfo(book_name,scope).forEach((subResult) => {
                    result.push( {
                        data: [group_name].concat(subResult.data),
                        keys: [group_name].concat(subResult.keys),
                    })
                });
            });
        }
        return result;
    }

    getVerseBySelector(selector: string[]): Verse | null {
        if( selector.length < 1 ) return null;
        if( !(selector[0] in this.books ) ) return null;
        return this.books[selector[0]].getVerseBySelector( selector.slice(1) );
    }

    getVerseAlignmentStateBySelector(selector: string[]): TState | null {
        if( selector.length < 1 ) return null;
        if( !(selector[0] in this.books ) ) return null;
        return this.books[selector[0]].getVerseAlignmentStateBySelector( selector.slice(1) );
    }

    updateAlignmentState( alignmentDialogResult: TWordAlignerAlignmentResult, selector: string[] ): Group{

        if( selector.length < 1 ) throw new Error( "Book not selected." );
        if( !(selector[0] in this.books ) ) throw new Error( "Book not found." );;

        const newBook = this.books[selector[0]].updateAlignmentState( alignmentDialogResult, selector.slice(1) );

        const newBooks = { ...this.books, [selector[0]]: newBook };
        return new Group( newBooks );
    }

     /**
     * This function saves the loaded USFM to the zip archive which is passed in.
     * The resources saved are filtered by the isResourcePartiallySelected function.
     * @param folder the zip folder to save to
     * @param groupKey the key for this group
     * @param isResourcePartiallySelected function to test if resource is partially selected
     */
    saveSelectedResourcesToUsfmZip( folder: JSZip, groupKey: string[], isResourcePartiallySelected: ( resourceKey: string[] ) => boolean ): void {
        //now need to iterate through the books which are partially selected and recurse.
        Object.entries(this.books).forEach(([book_name,book])=>{
            const bookKey = groupKey.concat([book_name]);
            if( isResourcePartiallySelected( bookKey ) ){
                //we don't have to create a sub folder for each book, because each book
                //creates a new file.
                book.saveSelectedResourcesToUsfmZip(folder,bookKey,isResourcePartiallySelected);
            }
        })
    }

     /**
     * This function will remove resources which are
     * selected or partially remove partially selected resources.
     * @param groupKey the key for this group
     * @param isResourcePartiallySelected function to test if resource is partially selected
     * @param isResourceSelected function to test if resource is selected
     * @returns the new group.
     */
    removeSelectedResources( groupKey: string[], { isResourcePartiallySelected, isResourceSelected }: { isResourcePartiallySelected: (resourceKey: string[]) => boolean, isResourceSelected: (resourceKey: string[]) => boolean } ): Group {
        const newBooks = Object.fromEntries(Object.entries(this.books).map(([book_name,book]:[string,Book]):[string,Book]=>{
            const bookKey = groupKey.concat([book_name]);
            if( isResourcePartiallySelected( bookKey ) ){
                //process the partially selected books.
                return [book_name,book.removeSelectedResources( bookKey, {isResourceSelected, isResourcePartiallySelected})];
            }else{
                return [book_name,book];
            }
        }).filter(([book_name,book]:[string,Book])=>{
            return Object.keys(book.chapters).length > 0;
        }));
    
        return new Group( newBooks );
    }

    /**
     * This function merges this group with the group passed in.
     * @param group the group to merge with
     * @returns the new group
     */
    mergeWith( group: Group ): Group {
        const newBooks = { ...this.books };
        Object.entries(group.books).forEach(([book_name,book]:[string,Book])=>{
            if( book_name in newBooks ){
                newBooks[book_name] = newBooks[book_name].mergeWith( book );
            }else{
                newBooks[book_name] = book;
            }
        });
        return new Group( newBooks );
    }

    /**
     * This function gets the alignment training data from this group.
     */
    getAlignmentDataAndCorpusForTrainingOrTesting( { forTesting, getCorpus, isNT }: { forTesting:boolean, getCorpus: boolean, isNT: boolean } ): TTrainingAndTestingData {
        const alignments: { [key: string]: { targetVerse: TWord[], sourceVerse: TWord[], alignments:TSourceTargetAlignment[] }} = {};
        const corpus: { [key: string]: { sourceTokens: TWord[], targetTokens: TWord[] }} = {};
        Object.entries(this.books).forEach( ([book_name,book]: [string,Book])=>{
            const isNT_ = bibleHelpers.isNewTestament(book_name)
            if ( isNT_ != isNT ) {
                return // skip this book when it's not the right testament
            };
            const subResults = book.getAlignmentDataAndCorpusForTrainingOrTesting( {forTesting,getCorpus} );
            Object.entries(subResults.alignments).forEach(([reference,alignment])=>{
                alignments[`${book_name} ${reference}`] = alignment;
            });
            Object.entries(subResults.corpus).forEach(([reference,subCorpus])=>{
                corpus[`${book_name} ${reference}`] = subCorpus;
            })          
        });
        return {
            alignments,
            corpus,
        };
    }


    addRestructuredAlignmentTestResults( testResults:  TGroupTestResults ): Group {
        const newBooks = Object.fromEntries(Object.entries(this.books).map(([book_name,book]:[string,Book])=>{
            if( !(book_name in testResults) ) return [book_name,book];
            return [book_name,book.addRestructuredAlignmentTestResults( testResults[book_name] )];
        }));
        return new Group( newBooks );
    }
}