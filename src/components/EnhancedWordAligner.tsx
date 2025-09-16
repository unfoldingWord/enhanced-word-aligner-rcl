import React, {useEffect, useState} from 'react'
import {SuggestingWordAligner} from 'word-aligner-rcl'
import {
    ContextId,
    SourceWord,
    TargetWordBank,
    THandleTrainingStateChange,
    TTranslationMemoryType,
} from '@/common/classes';
import {Alignment, Suggestion} from 'wordmap';
import {Token} from 'wordmap-lexer'

import {TBookShaState, useAlignmentSuggestions} from '@/hooks/useAlignmentSuggestions';
import {createAlignmentTrainingWorker as createAlignmentTrainingWorker_} from '@/workers/utils/startAlignmentTrainer';
import {TAlignmentCompletedInfo, TAlignmentSuggestionsConfig, TAlignmentMetaData} from '@/workers/WorkerComTypes';
import {useTrainingState} from '@/hooks/useTrainingState';

// Dialog styles component
const DialogOverlay: React.FC<{children: React.ReactNode, onClose: () => void}> = ({children, onClose}) => (
    <div
        style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}
        onClick={onClose}
    >
        <div
            style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '600px',
                maxHeight: '80vh',
                overflow: 'auto',
                minWidth: '400px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                border: '1px solid #e0e0e0'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    </div>
);

const ModelInfoDialog: React.FC<{info: TAlignmentMetaData, onClose: () => void}> = ({info, onClose}) => {
    const handleDeleteBook = (bookId: string) => {
        // TODO: Implement delete functionality
        console.log(`Delete alignment data for book: ${bookId}`);
        // You can add the actual delete logic here
    };

    const formatTrainingInfo = () => {
        const {currentBookAlignmentInfo, globalAlignmentBookVerseCounts} = info;

        let content: React.ReactNode[] = [];

        if (currentBookAlignmentInfo?.contextId?.reference?.bookId) {
            content.push(
                <div key="current-book" style={{marginBottom: '20px'}}>
                    <h3 style={{color: '#2c3e50', marginBottom: '10px', fontSize: '16px'}}>
                        Current Book: {currentBookAlignmentInfo.contextId.reference.bookId}
                    </h3>
                </div>
            );
        }

        if (currentBookAlignmentInfo?.trainingInfo?.alignmentMemoryVerseCounts?.trained) {
            const trained = currentBookAlignmentInfo.trainingInfo.alignmentMemoryVerseCounts.trained;
            content.push(
                <div key="trained" style={{marginBottom: '20px'}}>
                    <h4 style={{color: '#34495e', marginBottom: '8px'}}>Trained with aligned verses from Books:</h4>
                    <div style={{paddingLeft: '16px'}}>
                        {Object.entries(trained.booksCount).map(([bookId, verseCount]) => (
                            <div key={bookId} style={{marginBottom: '4px', fontFamily: 'monospace'}}>
                                {bookId} has {verseCount} aligned verses
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (currentBookAlignmentInfo?.trainingInfo?.alignmentMemoryVerseCounts?.untrained) {
            const untrained = currentBookAlignmentInfo.trainingInfo.alignmentMemoryVerseCounts.untrained;
            content.push(
                <div key="untrained" style={{marginBottom: '20px'}}>
                    <h4 style={{color: '#34495e', marginBottom: '8px'}}>Untrained Alignment Memory verses from Books:</h4>
                    <div style={{paddingLeft: '16px'}}>
                        {Object.entries(untrained.booksCount).map(([bookId, verseCount]) => (
                            <div key={bookId} style={{marginBottom: '4px', fontFamily: 'monospace'}}>
                                {bookId} has {verseCount} aligned verses
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (globalAlignmentBookVerseCounts) {
            content.push(
                <div key="global" style={{marginBottom: '20px'}}>
                    <h4 style={{color: '#34495e', marginBottom: '8px'}}>Global Alignment Memory for Books:</h4>
                    <div style={{paddingLeft: '16px'}}>
                        {Object.entries(globalAlignmentBookVerseCounts).map(([bookId, verseCount]) => {
                            const totalVerseCounts = Math.max(verseCount.sourceVerseCount, verseCount.targetVerseCount);
                            const percentAligned = verseCount.percentAligned;
                            return (
                                <div key={bookId} style={{
                                    marginBottom: '4px', 
                                    fontFamily: 'monospace',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    paddingRight: '8px'
                                }}>
                                    <span>
                                        {bookId} has {totalVerseCounts} verses and is {percentAligned.toFixed(0)}% aligned
                                    </span>
                                    <button
                                        onClick={() => handleDeleteBook(bookId)}
                                        style={{
                                            backgroundColor: '#e74c3c',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            marginLeft: '8px',
                                            minWidth: '60px'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c0392b'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e74c3c'}
                                        title={`Delete alignment data for ${bookId}`}
                                    >
                                        Delete
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        if (content.length === 0 && !currentBookAlignmentInfo) {
            content.push(
                <div key="no-data" style={{color: '#e74c3c', fontStyle: 'italic'}}>
                    Alignment Data Not Loaded.
                </div>
            );
        }

        if (content.length === 0 && !globalAlignmentBookVerseCounts) {
            content.push(
                <div key="no-global" style={{color: '#e74c3c', fontStyle: 'italic'}}>
                    Global Alignment Memory not loaded!
                </div>
            );
        }

        return content;
    };

    return (
        <DialogOverlay onClose={onClose}>
            <div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                    <h3 style={{margin: 0, color: '#2c3e50', fontSize: '20px'}}>Model Information</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            color: '#7f8c8d',
                            padding: '4px 8px'
                        }}
                        title="Close"
                    >
                        ×
                    </button>
                </div>
                <div style={{fontSize: '14px', lineHeight: '1.5'}}>
                    {formatTrainingInfo()}
                </div>
            </div>
        </DialogOverlay>
    );
};


interface EnhancedWordAlignerProps {
    asyncSuggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Promise<Suggestion[]>;
    addTranslationMemory?: TTranslationMemoryType;
    contextId: ContextId;
    createAlignmentTrainingWorker: () => Promise<Worker>;
    doTraining: boolean;
    handleTrainingStateChange?: THandleTrainingStateChange;
    hasRenderedSuggestions?: boolean;
    lexiconCache?: Record<string, any>;
    loadLexiconEntry: (lexiconId: string, entryId: string) => void;
    onChange?: (details: {
        type: 'MERGE_ALIGNMENT_CARDS' | 'CREATE_NEW_ALIGNMENT_CARD' | 'UNALIGN_TARGET_WORD' | 'ALIGN_TARGET_WORD' | 'ALIGN_SOURCE_WORD';
        source: 'TARGET_WORD_BANK' | 'GRID';
        destination: 'TARGET_WORD_BANK' | 'GRID';
        verseAlignments: Alignment[];
        targetWords: TargetWordBank[];
        contextId: ContextId;
    }) => void;
    suggestionsOnly?: boolean;
    showPopover: (
        PopoverTitle: React.ReactNode,
        wordDetails: React.ReactNode,
        positionCoord: any,
        rawData: {
            token: SourceWord;
            lexiconData: any;
        }
    ) => void;
    sourceLanguageId: string;
    sourceLanguageFont?: string;
    sourceFontSizePercent?: number;
    styles?: React.CSSProperties;
    suggester?: (
        sourceSentence: string | Token[],
        targetSentence: string | Token[],
        maxSuggestions?: number,
        manuallyAligned?: Alignment[]
    ) => Suggestion[];
    targetLanguageId: string;
    targetLanguageFont?: string;
    targetFontSizePercent?: number;
    targetWords: TargetWordBank[];
    translate: (key: string) => string;
    translationMemory?: TTranslationMemoryType;
    verseAlignments: Alignment[];
    config?: TAlignmentSuggestionsConfig;
}

export const EnhancedWordAligner: React.FC<EnhancedWordAlignerProps> = (
{
    addTranslationMemory,
    contextId,
    config,
    createAlignmentTrainingWorker = createAlignmentTrainingWorker_, // TRICKY - the steps to create the training Worker are dependent on the platform, so this allows it to be overridden
    doTraining,
    lexiconCache,
    loadLexiconEntry,
    handleTrainingStateChange: handleTrainingStateChange_,
    hasRenderedSuggestions,
    onChange,
    suggestionsOnly,
    showPopover,
    sourceLanguageId,
    sourceLanguageFont,
    sourceFontSizePercent,
    styles,
    targetLanguageId,
    targetLanguageFont,
    targetFontSizePercent,
    targetWords,
    translate,
    translationMemory,
    verseAlignments,
}) => {
    const [showModelDialog, setShowModelDialog] = useState(false);
    const [modelInfo, setModelInfo] = useState<TAlignmentMetaData | null>(null);

    const handleTrainingCompleted = (info: TAlignmentCompletedInfo) => {
        console.log('handleTrainingCompleted', info);
    }

    const {
        actions: {
            handleTrainingStateChange
        },
        state: {
            checksumGenerated,
            trainingComplete,
            translationMemoryLoaded,
        }
    } = useTrainingState({
        passThroughStateChange: handleTrainingStateChange_,
        translate
    })

    const {
        actions: {
            cleanupWorker,
            getCurrentBookShaState,
            getModelMetaData,
            isTraining,
            loadTranslationMemory,
            suggester,
            startTraining,
            stopTraining,
        }
    } = useAlignmentSuggestions({
        config,
        contextId,
        createAlignmentTrainingWorker,
        handleTrainingStateChange,
        handleTrainingCompleted,
        shown: true,
        sourceLanguageId,
        targetLanguageId,
        translationMemory,
    });

    useEffect(() => {
        console.log(`checksumGenerated = ${checksumGenerated}, translationMemoryLoaded = ${translationMemoryLoaded}`);
        if (checksumGenerated && translationMemoryLoaded && trainingComplete && config?.doAutoTraining) {
            const shaState: TBookShaState = getCurrentBookShaState()
            console.log(`Training complete: ${shaState?.bookShaChanged} trained sha ${shaState?.trainedSha} and current book sha ${shaState?.currentBookSha}`);
            if (shaState?.bookShaChanged) {
                console.log(`Training complete: book changed, retraining`);
                startTraining();
            }
        }
    },[checksumGenerated, translationMemoryLoaded, trainingComplete]);
    
    function handleInfoClick_() {
        // console.log('handleInfoClick');
        const info = getModelMetaData()
        setModelInfo(info);
        setShowModelDialog(true);

        // handleInfoClick?.(info)
    }
    
    // Effect to load translation memory when it changes
    useEffect(() => {
        if (addTranslationMemory && Object.keys(addTranslationMemory).length > 0) {
            loadTranslationMemory(addTranslationMemory);
        }
    }, [addTranslationMemory]);
    
    //here we cleanup on close of the component.  This is needed because the worker is not terminated when the component is unmounted..
    // TODO: this may not be desired
    useEffect(() => {
        return () => {
            cleanupWorker();
        };
    },[]);

    useEffect(() => {
        const training = isTraining()
        console.log(`doTraining changed state to ${doTraining} but training is now ${training}`)
        if(doTraining) {
            startTraining()
        } else {
            stopTraining()
        }
    },[doTraining]);

    return (
        <>
            <SuggestingWordAligner
                contextId={contextId}
                handleInfoClick={handleInfoClick_}
                hasRenderedSuggestions={hasRenderedSuggestions}
                lexiconCache={lexiconCache}
                loadLexiconEntry={loadLexiconEntry}
                onChange={onChange}
                showPopover={showPopover}
                sourceLanguage={sourceLanguageId}
                sourceLanguageFont={sourceLanguageFont}
                sourceFontSizePercent={sourceFontSizePercent}
                suggestionsOnly={suggestionsOnly}
                style={styles}
                suggester={suggester}
                targetWords={targetWords}
                translate={translate}
                targetLanguageFont={targetLanguageFont}
                targetFontSizePercent={targetFontSizePercent}
                translationMemory={translationMemory}
                verseAlignments={verseAlignments}
            />
            {showModelDialog && modelInfo && (
                <ModelInfoDialog 
                    info={modelInfo} 
                    onClose={() => setShowModelDialog(false)} 
                />
            )}
        </>
    )
}