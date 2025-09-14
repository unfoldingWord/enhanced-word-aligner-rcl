
import { useState, useCallback } from 'react';
import {THandleTrainingStateChange, TTrainingStateChange} from '@/common/classes';

interface TUseTrainingStateProps {
    translate: (key:string) => string;
}

interface TrainingState {
    percentComplete?: number;
    trained: boolean;
    training: boolean;
    trainingButtonStr: string;
    trainingButtonHintStr: string;
    trainingError: string;
    trainingStatusStr: string;
}

interface TUseTrainingStateReturn {
    actions: {
        handleTrainingStateChange: THandleTrainingStateChange
    },
    state: TrainingState
}

export const useTrainingState = ({
    translate,
}: TUseTrainingStateProps): TUseTrainingStateReturn => {
    // Training States
    const [trainingState, setTrainingState] = useState<TrainingState>({
        training: false,
        trained: false,
        trainingError: '',
        trainingStatusStr: '',
        trainingButtonStr: translate('suggestions.train_button'),
        trainingButtonHintStr: translate('suggestions.train_button_hint'),
        percentComplete: 0,
    });

    /**
     * Handles setting training state based on provided props
     */
    const handleTrainingStateChange:THandleTrainingStateChange = useCallback((props: TTrainingStateChange) => {
        if (!props) {
            console.log('useTrainingStateManagement.handleTrainingStateChange - no props');
            return;
        }

        setTrainingState(prev => {
            let {
                percentComplete,
                training: _training,
                trainingComplete,
                trainingFailed,
            } = props;

            // Use current state if new value is undefined
            if (_training === undefined) {
                _training = prev.training;
            }
            if (trainingComplete === undefined) {
                trainingComplete = prev.trained;
            }

            let trainingErrorStr = '';
            let currentTrainingError = prev.trainingError;

            if (typeof trainingFailed === 'string') {
                currentTrainingError = trainingFailed;
            }

            if (currentTrainingError) {
                trainingErrorStr = ' - ' + currentTrainingError;
            }

            const trainingButtonStr = _training ? translate('suggestions.stop_training_button') : trainingComplete ? translate('suggestions.retrain_button') : translate('suggestions.train_button');
            const trainingButtonHintStr = _training ? '' : trainingComplete ? translate('suggestions.retrain_button_hint') : translate('suggestions.train_button_hint');
            
            let trainingStatusStr_ = (_training ? translate('suggestions.status_training') : trainingComplete ? translate('suggestions.status_trained') : translate('suggestions.status_not_trained')) + trainingErrorStr;

            if (percentComplete !== undefined) {
                trainingStatusStr_ += ` ${percentComplete}${translate('suggestions.percent_complete')}`;
            }

            console.log(`useTrainingStateManagement.handleTrainingStateChange new state: training ${_training}, trainingComplete ${trainingComplete}, trainingStatusStr ${trainingStatusStr_}`);

            return {
                percentComplete,
                trained: trainingComplete,
                training: _training,
                trainingButtonStr,
                trainingButtonHintStr,
                trainingError: currentTrainingError,
                trainingStatusStr: trainingStatusStr_,
            };
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