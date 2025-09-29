
# EnhancedWordAligner

A React component library for advanced word alignment between source and target languages with AI-powered suggestions.

## 📋 Overview

The Enhanced Word Aligner provides a powerful interface for creating and managing alignments between source and target language texts. It builds upon the `SuggestingWordAligner` from the `word-aligner-rcl` module, adding intelligent alignment suggestions through `WordMap` technology.  The `WordMap` technology is enhanced by the `uw-wordmapbooster` module (forked from `wordmapbooster`) and the background wordMap training logic comes from the `alignment-transferer` app.


**Key Features:**
- Interactive word alignment interface
- AI-powered alignment suggestions
- Background training for improved suggestions
- Cross-platform compatibility (including NextJS support)

## 🚀 Installation

```shell script
# npm
npm install enhanced-word-aligner-rcl

# yarn
yarn add enhanced-word-aligner-rcl
```

## 🎨 UI Demo in Styleguidist

Start styleguidist:

```bash
yarn && yarn start
```

Then open browser to `http://localhost:6003/
`

## 🧩 Components

### EnhancedWordAligner

The main component that provides an interactive interface for aligning words with suggestions.

- see Example implementation: [EnhancedWordAligner.md](./src/components/EnhancedWordAligner.md)

### useAlignmentSuggestions Hook

A custom hook that provides background word alignment training and suggestions.

```js
import { useAlignmentSuggestions, createAlignmentTrainingWorker } from 'enhanced-word-aligner-rcl';

const alignmentSuggestionsManager = useAlignmentSuggestions({
  contextId,
  shown: isVisible,
  sourceLanguageId: 'el-x-koine',
  targetLanguageId: 'en',
  createAlignmentTrainingWorker,
  handleTrainingStateChange: updateTrainingStatus
});

// Access the suggestion function
const { suggester } = alignmentSuggestionsManager.actions;
```


> **Important**: For alignment training to run in the background, the component using this hook must remain mounted.

### TrainingStateProvider

Manages and provides access to the current training state of the alignment model.

```js
import { TrainingStateProvider, useTrainingStateContext } from 'enhanced-word-aligner-rcl';

// Wrap components that need access to training state
<TrainingStateProvider translate={translate} verbose={true}>
  <YourComponent />
</TrainingStateProvider>

// In child components:
const { state, actions } = useTrainingStateContext();
const { trainingComplete, trainingStatusStr } = state;
const { handleTrainingStateChange } = actions;
```


## 💻 Development

```shell script
# Install dependencies
yarn

# Start Styleguidist server
yarn start
```


Then open your browser to `http://localhost:6003/`

## 🔄 Platform-Specific Information

- the `EnhancedWordAligner.md` example shows how to run in StyleGuidist.
- For NextJS integration, please refer to [README_NEXTJS.md](README_NEXTJS.md) which describes how to run the Model training background worker.

## 📚 Documentation

For detailed information:
- EnhancedWordAligner: [EnhancedWordAligner.tsx](./src/components/EnhancedWordAligner.tsx)
- useAlignmentSuggestions: [useAlignmentSuggestions.ts](./src/components/useAlignmentSuggestions.ts)
- TrainingStateProvider: [TrainingStateProvider.tsx](./src/hooks/TrainingStateProvider.tsx)

Example implementation: [EnhancedWordAligner.md](./src/components/EnhancedWordAligner.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the terms of the MIT license.
