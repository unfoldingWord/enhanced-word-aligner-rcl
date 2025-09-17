import React from 'react';
import {
    TAlignmentMetaData,
    TAlignmentSuggestionsConfig,
} from '@/workers/WorkerComTypes';

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

// Add this component for the integer input
const IntegerInput: React.FC<{
    id: string,
    label: string,
    min: number,
    max: number,
    variable: string
    value: number | undefined,
    onChange: (variable: string, value: number) => void,
    description?: string
}> = ({ id, label, min, max, variable, value, onChange, description }) => {
    const [inputValue, setInputValue] = React.useState(value?.toString() || '');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);

        // Convert to number and validate
        const numValue = parseInt(newValue, 10);
        if (!isNaN(numValue) && numValue >= min && numValue <= max) {
            onChange(variable, numValue);
        }
    };

    const handleBlur = () => {
        // When blurring, ensure the displayed value is valid
        const numValue = parseInt(inputValue, 10);
        if (isNaN(numValue) || numValue < min || numValue > max) {
            // Reset to previous valid value or min
            setInputValue((value || min).toString());
        }
    };

    return (
        <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <label
                    htmlFor={id}
                    style={{
                        marginRight: '8px',
                        fontWeight: 500,
                        color: '#2c3e50',
                        width: '220px'
                    }}
                >
                    {label}
                </label>
                <input
                    id={id}
                    type="number"
                    min={min}
                    max={max}
                    value={inputValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    style={{
                        width: '60px',
                        padding: '4px 8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '14px'
                    }}
                />
            </div>
            {description && (
                <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '4px', paddingLeft: '4px' }}>
                    {description}
                </div>
            )}
        </div>
    );
};

const ToggleSwitch: React.FC<{
    id: string,
    label: string,
    variable: string,
    isChecked: boolean,
    onChange: (id: string, checked: boolean) => void,
    description?: string
}> = ({ id, label, variable, isChecked, onChange, description }) => {
    // Fixed toggle implementation
    const handleToggleClick = () => {
        onChange(variable, !isChecked);
    };
    
    return (
        <div style={{ marginBottom: '16px' }}>
            <div 
                style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    cursor: 'pointer'
                }}
                onClick={handleToggleClick}
            >
                <span 
                    style={{ 
                        marginRight: '8px', 
                        fontWeight: 500,
                        color: '#2c3e50' 
                    }}
                >
                    {label}
                </span>
                <div 
                    style={{ 
                        position: 'relative', 
                        width: '40px', 
                        height: '20px',
                    }}
                >
                    <span 
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: isChecked ? '#2196F3' : '#ccc',
                            transition: 'background-color 0.2s',
                            borderRadius: '10px'
                        }}
                    >
                        <span 
                            style={{
                                position: 'absolute',
                                content: '""',
                                height: '16px',
                                width: '16px',
                                left: isChecked ? '22px' : '2px',
                                bottom: '2px',
                                backgroundColor: 'white',
                                transition: 'left 0.2s',
                                borderRadius: '50%'
                            }}
                        />
                    </span>
                </div>
            </div>
            {description && (
                <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '4px', paddingLeft: '4px' }}>
                    {description}
                </div>
            )}
        </div>
    );
};

export const ModelInfoDialog: React.FC<{
    handleDeleteBook: (bookId: string) => void,
    info: TAlignmentMetaData,
    onClose: () => void,
    onConfigChange?: (config: TAlignmentSuggestionsConfig) => void

}> = ({handleDeleteBook, info, onClose, onConfigChange}) => {
    const {
        config,
        currentBookAlignmentInfo,
        globalAlignmentBookVerseCounts,
    } = info;

    console.log('ModelInfoDialog - config', config);
    
    const handleConfigTrainingToggle = (variable: string, checked: boolean) => {
        console.log(`${variable} toggled:`, checked);
        if (config && onConfigChange) {
            onConfigChange({
                ...config,
                [variable]: checked
            });
        }
    };

    const handleConfigTrainingChange = (variable: string, value: number) => {
        console.log(`${variable}  changed to ${value}`);
        if (config && onConfigChange) {
            onConfigChange({
                ...config,
                [variable]: value
            });
        }
    };
    
    const formatTrainingInfo = () => {
 
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

        if (content.length === 0 && !currentBookAlignmentInfo) {
            content.push(
                <div key="no-data" style={{color: '#e74c3c', fontStyle: 'italic'}}>
                    Alignment Data Not Loaded.
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

        if (content.length === 0 && !globalAlignmentBookVerseCounts) {
            content.push(
                <div key="no-global" style={{color: '#e74c3c', fontStyle: 'italic'}}>
                    Global Alignment Memory not loaded!
                </div>
            );
        }

        // Fix the parameter list for createToggleSwitch
        function createToggleSwitch(props: {
            id: string;
            label: string;
            variable: string;
            description: string;
        }) {
            const { id, label, variable, description } = props;
            
            return <ToggleSwitch
                id={id}
                label={label}
                variable={variable}
                isChecked={config?.[variable] ?? false}
                onChange={handleConfigTrainingToggle}
                description={description}
            />;
        }

        function createValueChange(props: {
            id: string;
            label: string;
            variable: string;
            description: string;
            min: number;
            max: number;
        }) {
            const { id, label, variable, description, min, max } = props;
            const description_ = `${description} (${min}-${max})`;
            return <IntegerInput
                id={id}
                label={label}
                variable={variable}
                min={min}
                max={max}
                value={config?.[variable]}
                onChange={handleConfigTrainingChange}
                description={description_}
            />;
        }

        function createConfigs() {
            return <div style={{
                marginBottom: '24px',
                padding: '16px',
                backgroundColor: '#f9f9f9',
                borderRadius: '6px',
                border: '1px solid #eee'
            }}>
                <h4 style={{color: '#2c3e50', marginTop: 0, marginBottom: '12px'}}>Alignment Settings</h4>

                {createToggleSwitch({
                    id: "autoTrainingToggle",
                    label: "Auto Training",
                    variable: "doAutoTraining",
                    description: "Automatically retrain alignment model when content changes"
                })}

                {createToggleSwitch({
                    id: "trainOnlyOnCurrentBookToggle",
                    label: "Train Only Current Book",
                    variable: "trainOnlyOnCurrentBook",
                    description: "Run training using only alignments in current book.  Will speed up training for small books by just training on alignment memory data for current book. This could improve suggestions if book is fully aligned, but will have no vocabulary from other books."
                })}

                {createToggleSwitch({
                    id: "keepAllAlignmentMemoryToggle",
                    label: "Keep All Alignment Memory",
                    variable: "keepAllAlignmentMemory",
                    description: "Keep All Alignment Memory even alignments not used for training.  This should improve alignment vocabulary, but may negatively impact accuracy in the case of fully aligned books."
                })}

                {createValueChange({
                    id: "targetNgramLength",
                    label: "Target N-gram Length",
                    variable: "targetNgramLength",
                    min: 3,
                    max: 10,
                    description: "Maximum number of target words used for alignment memory"
                })}

                {createValueChange({
                    id: "train_steps",
                    label: "Training Steps",
                    variable: "train_steps",
                    min: 100,
                    max: 1000,
                    description: "Number of training steps used for tweaking wordMap settings"
                })}

            </div>;
        }

        if (config) { /* Configuration Settings Section */
            content.push(
                createConfigs()
            )
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