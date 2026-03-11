/**
 * TrainingStateProvider
 * =====================
 *
 * @synopsis
 * A React context provider that manages the state of word alignment training processes, including progress
 * tracking, status messages, and UI labels.
 *
 * @description
 * This context provider encapsulates the complexity of tracking and displaying the state of word alignment
 * training processes. It provides a consistent interface for updating and accessing the
 * current training state, including loading status, progress percentage, and user-facing
 * status messages. The context handles internationalization of status messages and maintains
 * state continuity during training state transitions.
 *
 * The TrainingStateProvider creates and provides access to a context that manages:
 * - Training progress indicators (percentage complete, status messages)
 * - UI element text (button labels, tooltips)
 * - Training process state (active, completed, error conditions)
 * - Translation memory and checksum generation status
 *
 * Components can consume this context using the useTrainingStateContext hook to access
 * both the current state values and actions to update the training state.
 *
 * Key features:
 * - Tracks multiple aspects of training state (loading, progress, completion)
 * - Manages UI text for buttons and status messages
 * - Handles error states and messages
 * - Supports internationalization through translation function
 * - Provides a clean API for state updates
 *
 * @example
 * ```tsx
 * // Wrap components that need access to training state
 * <TrainingStateProvider translate={translate} verbose={true}>
 *   <YourComponent />
 * </TrainingStateProvider>
 * 
 * // In child components, access the context
 * const { state, actions } = useTrainingStateContext();
 * const { handleTrainingStateChange } = actions;
 * const { trainingComplete, trainingStatusStr } = state;
 * ```
 *
 * @requirements
 * - React 16.8+ (uses hooks and context)
 * - Translation function for internationalization
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TTrainingStateChangeHandler, TTrainingStateChange } from '@/common/classes';

/**
 * Props for the TrainingStateProvider component
 */
export interface TTrainingStateContextProps {
    /** 
     * Function to translate UI strings for internationalization.
     * Required to provide localized status messages and button labels.
     */
    translate: (key:string) => string;
    
    /** 
     * When true, outputs detailed state change information to the console.
     * Useful for debugging training state transitions.
     */
    verbose?: boolean;
    
    /**
     * Child components that will have access to the training state context.
     */
    children: ReactNode;
}

/**
 * Shape of the training state managed by the context
 */
export interface TrainingState {
    /** Indicates if checksum generation for current target book USFM is complete */
    checksumGenerated: boolean;
    /** Current progress percentage of the training process (0-100) */
    percentComplete: number;
    /** Flag indicating if training is currently in progress */
    training: boolean;
    /** Localized text for the training button */
    trainingButtonStr: string;
    /** Localized tooltip text for the training button */
    trainingButtonHintStr: string;
    /** Flag indicating if training has been completed at least once for current book */
    trainingComplete: boolean;
    /** Error message if training encountered an error */
    trainingError: string;
    /** Flag indicating if training is currently loading */
    trainingLoading: boolean;
    /** Localized status message describing current training state */
    trainingStatusStr: string;
    /** Indicates if translation memory has been loaded for training */
    translationMemoryLoaded: boolean;
}

/**
 * Value provided by the TrainingStateContext
 */
export interface TTrainingStateContextValue {
    /** Actions available to manipulate the training state */
    actions: {
        /** 
         * Function to update the training state with new values.
         * This would typically be passed to useAlignmentSuggestions or 
         * as the passThroughStateChange property of useTrainingState() in child components.
         */
        handleTrainingStateChange: TTrainingStateChangeHandler,
    },
    /** Current training state values */
    state: TrainingState
}

// Create the context with a default undefined value
export const TrainingStateContext = createContext<TTrainingStateContextValue | undefined>(undefined);

/**
 * Provider component that creates and manages training state
 * 
 * Initializes the training state, provides a handler for state changes,
 * and makes both available through React Context.
 * 
 * @param {TTrainingStateContextProps} props - Configuration props
 * @returns {JSX.Element} Context provider with current value
 */
export const TrainingStateProvider: React.FC<TTrainingStateContextProps> = (props: TTrainingStateContextProps) => {
    const {
        translate,
        verbose,
        children,
    } = props;

    // Training States
    const [trainingState, setTrainingState] = useState<TrainingState>({
        checksumGenerated: false,
        percentComplete: 0,
        training: false,
        trainingButtonStr: translate('suggestions.train_button'),
        trainingButtonHintStr: translate('suggestions.train_button_hint'),
        trainingComplete: false,
        trainingError: '',
        trainingLoading: false,
        trainingStatusStr: '',
        translationMemoryLoaded: false,
    });

    /**
     * Updates the training state based on the provided properties.
     * 
     * This function processes changes to the training state by computing new values
     * for status messages, button labels, and other derived state properties based
     * on the incoming state change. It preserves existing state values when specific
     * properties are not included in the update.
     *
     * The function handles:
     * - Status message generation based on training state
     * - Button text and tooltips that reflect current training state
     * - Error message formatting and display
     * - Progress percentage tracking and formatting
     *
     * @param {TTrainingStateChange} props - State change properties including:
     *   - training: Whether training is active
     *   - trainingComplete: Whether training has finished
     *   - checksumGenerated: Whether content checksums are available
     *   - percentComplete: Current training progress (0-100)
     *   - trainingFailed: Error message if training failed
     *   - translationMemoryLoaded: Whether translation data is ready
     */
    const handleTrainingStateChange:TTrainingStateChangeHandler = (props: TTrainingStateChange) => {
        if (!props) {
            console.log('useTrainingStateManagement.handleTrainingStateChange - no props');
            return;
        }

        setTrainingState(prev => {
            let {
                checksumGenerated: _checksumGenerated,
                percentComplete,
                training: _training,
                trainingComplete: _trainingComplete,
                trainingFailed,
                trainingLoading: _trainingLoading,
                translationMemoryLoaded: _translationMemoryLoaded,
            } = props;

            // Use current state if new value is undefined
            if (_training === undefined) {
                _training = prev.training;
            }
            if (_trainingLoading === undefined) {
                _trainingLoading = prev.trainingLoading;
            }
            if (_trainingComplete === undefined) {
                _trainingComplete = prev.trainingComplete;
            }
            if (_checksumGenerated === undefined) {
                _checksumGenerated = prev.checksumGenerated;
            }
            if (_translationMemoryLoaded === undefined) {
                _translationMemoryLoaded = prev.translationMemoryLoaded;
            }

            let trainingErrorStr = '';
            let currentTrainingError = prev.trainingError;

            if (typeof trainingFailed === 'string') {
                currentTrainingError = trainingFailed;
            }

            if (currentTrainingError) {
                trainingErrorStr = ' - ' + currentTrainingError;
            }

            const trainingButtonStr = _training ? translate('suggestions.stop_training_button') : _trainingComplete ? translate('suggestions.retrain_button') : translate('suggestions.train_button');
            const trainingButtonHintStr = _training ? '' : _trainingComplete ? translate('suggestions.retrain_button_hint') : translate('suggestions.train_button_hint');

            let _trainingStatusStr = '';
            if (_training) {
                if (_trainingComplete) {
                    _trainingStatusStr = translate('suggestions.status_retraining');
                } else {
                    _trainingStatusStr = translate('suggestions.status_training');
                }
            } else {
                if (_trainingComplete) {
                    _trainingStatusStr = translate('suggestions.status_trained');
                } else if (_trainingLoading) {
                    _trainingStatusStr = translate('suggestions.status_loading_training');
                } else {
                    _trainingStatusStr = translate('suggestions.status_not_trained');
                }
            }

            _trainingStatusStr += trainingErrorStr;
            if (_training && percentComplete !== undefined) {
                _trainingStatusStr += ` ${percentComplete}${translate('suggestions.percent_complete')}`;
            }

            if (verbose) {
                console.log(`useTrainingStateManagement.handleTrainingStateChange new state: training ${_training}, trainingComplete ${_trainingComplete}, trainingStatusStr ${_trainingStatusStr}`);
            }

            const newState = {
                checksumGenerated: _checksumGenerated,
                percentComplete,
                trainingComplete: _trainingComplete,
                training: _training,
                trainingButtonStr,
                trainingButtonHintStr,
                trainingError: currentTrainingError,
                trainingStatusStr: _trainingStatusStr,
                translationMemoryLoaded: _translationMemoryLoaded,
            };
            return newState;
        });
    };
    
     const value: TTrainingStateContextValue = {
        actions: {
            handleTrainingStateChange,
        },
        state: trainingState
    };
     
    return (
        <TrainingStateContext.Provider value={value}>
            {children}
        </TrainingStateContext.Provider>
    );
};


/**
 * Custom hook to access the training state context
 * 
 * Provides type-safe access to the training state and associated actions.
 * Throws an error if used outside of a TrainingStateProvider.
 * 
 * @returns {TTrainingStateContextValue} The current training state context value
 * @throws {Error} When used outside of a TrainingStateProvider
 */
export const useTrainingStateContext = () => {
    const context = useContext(TrainingStateContext);

    if (context === undefined) {
        throw new Error('TrainingStateContext must be used within a TrainingStateProvider');
    }

    return context;
};