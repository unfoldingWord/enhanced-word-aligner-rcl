
# enhanced-word-aligner-rcl

Wraps the `SuggestingWordAligner` from `word-aligner-rcl` with WordMap training and suggesting logic from `alignment-transferer` to make `EnhancedWordAligner` - an RCL component that can make alignment suggestions.


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

- look at [EnhancedWordAligner.md](./src/components/EnhancedWordAligner.md) as an example of how to use it 
- for more detailed information see the document header in [EnhancedWordAligner.tsx](./src/components/EnhancedWordAligner.tsx)
- to keep track of training state information within a parent component, look at the document header in [useTrainingState.ts](./src/hooks/useTrainingState.ts)