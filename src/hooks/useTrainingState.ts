
/**
 * useTrainingState Hook
 * =====================
 *
 * @synopsis
 * A React hook that manages the state of alignment training processes, including progress
 * tracking, status messages, and UI labels.
 *
 * @description
 * This hook encapsulates the complexity of tracking and displaying the state of word alignment
 * training processes. It provides a consistent interface for updating and accessing the
 * current training state, including loading status, progress percentage, and user-facing
 * status messages. The hook handles internationalization of status messages and maintains
 * state continuity during training state transitions.
 *
 * Key features:
 * - Tracks multiple aspects of training state (loading, progress, completion)
 * - Manages UI text for buttons and status messages
 * - Handles error states and messages
 * - Supports internationalization through translation function
 * - Provides a clean API for state updates
 *
 * @properties
 * The hook accepts configuration options and returns state and actions
 *
 * @requirements
 * - React 16.8+ (uses hooks)
 * - Translation function for internationalization
 */

import { useState, useCallback } from 'react';
import {TTrainingStateChangeHandler, TTrainingStateChange} from '@/common/classes';

interface TUseTrainingStateProps {
    /** Optional handler to receive training state changes (for parent components).  Typically you
     * would pass the handleTrainingStateChange from parent component.
     *  */
    passThroughStateChange?: TTrainingStateChangeHandler;
    /** Function that translates UI strings using provided keys */
    translate: (key:string) => string;
    verbose?: boolean; // if true then log progress
}

interface TrainingState {
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
    /** Localized status message describing current training state */
    trainingStatusStr: string;
    /** Indicates if translation memory has been loaded for training */
    translationMemoryLoaded: boolean;
}

interface TUseTrainingStateReturn {
    /** Actions available to manipulate the training state */
    actions: {
        /** Function to update the training state with new values.  This would either be
         *      passed as property into useAlignmentSuggestions, or as property passThroughStateChange
         *      of useTrainingState() of a child component */
        handleTrainingStateChange: TTrainingStateChangeHandler
    },
    /** Current training state values */
    state: TrainingState
}

export const useTrainingState = ({
     passThroughStateChange,
     translate,
     verbose,
}: TUseTrainingStateProps): TUseTrainingStateReturn => {
    // Training States
    const [trainingState, setTrainingState] = useState<TrainingState>({
        checksumGenerated: false,
        percentComplete: 0,
        training: false,
        trainingButtonStr: translate('suggestions.train_button'),
        trainingButtonHintStr: translate('suggestions.train_button_hint'),
        trainingComplete: false,
        trainingError: '',
        trainingStatusStr: '',
        translationMemoryLoaded: false,
    });

    /**
     * Updates the training state based on the provided properties.
     * This function handles changes in the training state by computing the new state,
     * including properties like the training status, error messages, button labels,
     * and percentage completion of the training progress. The updated state is then
     * applied to the training state management system.
     *
     * If certain properties in the update are undefined, the current state values for those
     * properties will be retained. Additionally, the function computes meaningful status
     * strings and button hints based on the training progress or errors during training.
     *
     * Logs a message to the console if no `props` are provided or to display the new state
     * upon updates.
     *
     * Dependencies:
     * - `passThroughStateChange` (optional): A function that can process the incoming
     *   training state change before the state update.
     * - `setTrainingState`: State update function for managing the training-related state.
     * - `translate`: Function utilized for obtaining localized strings for training status
     *   descriptions and button labels.
     *
     * @param {TTrainingStateChange} props - Contains the properties that describe the new
     * training state. Includes fields such as:
     *   - `training` (boolean): Whether training is currently in progress.
     *   - `trainingComplete` (boolean): Whether the training has completed.
     *   - `checksumGenerated` (boolean): Indicates if the checksum has been generated.
     *   - `percentComplete` (number): The percentage of the training process that is complete.
     *   - `trainingFailed` (string|null): Details of any training failure, if applicable.
     *   - `translationMemoryLoaded` (boolean): Indicates if the translation memory is loaded.
     */
    const handleTrainingStateChange:TTrainingStateChangeHandler = useCallback((props: TTrainingStateChange) => {
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
                translationMemoryLoaded: _translationMemoryLoaded,
            } = props;

            // Use current state if new value is undefined
            if (_training === undefined) {
                _training = prev.training;
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
                } else {
                    _trainingStatusStr = translate('suggestions.status_not_trained');
                }
            }

            _trainingStatusStr += trainingErrorStr;
            if (percentComplete !== undefined) {
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

        passThroughStateChange?.(props);
    }, []);

    const state = trainingState;

    return {
        actions: {
            handleTrainingStateChange
        },
        state
    };
};