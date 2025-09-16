
import { useState, useCallback } from 'react';
import {THandleTrainingStateChange, TTrainingStateChange} from '@/common/classes';

interface TUseTrainingStateProps {
    translate: (key:string) => string;
    passThroughStateChange?: THandleTrainingStateChange;
}

interface TrainingState {
    checksumGenerated: boolean;
    percentComplete: number;
    training: boolean;
    trainingButtonStr: string;
    trainingButtonHintStr: string;
    trainingComplete: boolean;
    trainingError: string;
    trainingStatusStr: string;
    translationMemoryLoaded: boolean;
}

interface TUseTrainingStateReturn {
    actions: {
        handleTrainingStateChange: THandleTrainingStateChange
    },
    state: TrainingState
}

export const useTrainingState = ({
     passThroughStateChange,
     translate,
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
     * Handles setting training state based on provided props
     */
    const handleTrainingStateChange:THandleTrainingStateChange = useCallback((props: TTrainingStateChange) => {
        if (!props) {
            console.log('useTrainingStateManagement.handleTrainingStateChange - no props');
            return;
        }

        passThroughStateChange?.(props);

        setTrainingState(prev => {
            let {
                checksumGenerated: _checksumGenerated,
                percentComplete,
                training: _training,
                trainingComplete: _trainingComplete,
                trainingFailed,
                translationMemoryLoaded: _translationMemoryLoaded
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

            console.log(`useTrainingStateManagement.handleTrainingStateChange new state: training ${_training}, trainingComplete ${_trainingComplete}, trainingStatusStr ${_trainingStatusStr}`);

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
    }, []);

    const state = trainingState;

    return {
        actions: {
            handleTrainingStateChange
        },
        state
    };
};