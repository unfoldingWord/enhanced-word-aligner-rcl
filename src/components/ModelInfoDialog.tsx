
import React from 'react';
import { TAlignmentMetaData } from '@/workers/WorkerComTypes';

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

export const ModelInfoDialog: React.FC<{
    handleDeleteBook: (bookId: string) => void,
    info: TAlignmentMetaData,
    onClose: () => void,
}> = ({handleDeleteBook, info, onClose}) => {
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
            <div style={{maxWidth: '100%', margin: '0 auto'}}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px'
                }}>
                    <h3 style={{margin: 0, color: '#2c3e50', fontSize: '20px'}}>Alignment Model Information</h3>
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
                        ✕
                    </button>
                </div>
                <div style={{fontSize: '14px', lineHeight: '1.5'}}>
                    {formatTrainingInfo()}
                </div>
            </div>
        </DialogOverlay>
    );
};

export default ModelInfoDialog;