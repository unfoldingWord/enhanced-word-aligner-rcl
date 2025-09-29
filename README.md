
# enhanced-word-aligner-rcl

Wraps the `SuggestingWordAligner` from the `word-aligner-rcl` module to make an `EnhancedWordAligner` - an RCL component that can show alignment suggestions. Also provides `useAlignmentSuggestions` hook which wraps WordMap the training and suggesting logic from the `alignment-transferer` app and the `uw-wordmapbooster` module to provide background word alignment training and alignment suggestions.


## Installation

### npm
```bash
npm add enhanced-word-aligner-rcl
```

### yarn
```bash
yarn add enhanced-word-aligner-rcl
```

## UI Testing in Styleguidist

### yarn

Start styleguidist

```bash
yarn && yarn start
```

Then open browser to `http://localhost:6003/
`
## Using Alignment Training Worker on Other Platforms

This example shows how to use the suggesing word aligner on styleguidist.  Other platforms may need some modifications:
- info on using training web worker on NextJS platform, look at this file: [README_NEXTJS.md](README_NEXTJS.md)

## Making Use of `enhanced-word-aligner-rcl` in Your Own Program.

### Displaying the EnhancedWordAligner
- look at [EnhancedWordAligner.md](./src/components/EnhancedWordAligner.md) as an example of how to use it

#### for detailed information about the EnhancedWordAligner Component
- see the document header in [EnhancedWordAligner.tsx](./src/components/EnhancedWordAligner.tsx)

#### for detailed information about the useAlignmentSuggestions Hook
- see the document header in [useAlignmentSuggestions.ts](./src/components/useAlignmentSuggestions.ts)
- note that for the alignment training to run in the background, the `useAlignmentSuggestions` hook must be used in a component that stays mounted.
- example usage:

```tsx
// Basic usage with required props
const alignmentSuggestionsManager = useAlignmentSuggestions({
    contextId: currentContextId,
    shown: isDialogVisible,
    sourceLanguageId: 'el-x-koine',
    targetLanguageId: 'en',
    createAlignmentTrainingWorker,
    handleTrainingStateChange: updateTrainingStatus
});

// Access suggestion function
const { suggester } = alignmentSuggestionsManager.actions;
```

### Keeping track of training state of alignment model in components with TrainingStateProvider
- for detailed information on how the `TrainingStateProvider` keeps track of current training state and exposes state information to components, see the document header in [TrainingStateProvider.tsx](./src/hooks/TrainingStateProvider.tsx)
- example usage:

```tsx
// Wrap components that need access to training state
<TrainingStateProvider translate={translate} verbose={true}>
<YourComponent />
</TrainingStateProvider>

// In child components, access the context
const { state, actions } = useTrainingStateContext();
const { handleTrainingStateChange } = actions;
const { trainingComplete, trainingStatusStr } = state;
```
