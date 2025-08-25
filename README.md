
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

This example shows how to use the suggesing word aligner on styleguidist.  Other platforms need so modifications:
- using on NextJS: [README_NEXTJS.md](README_NEXTJS.md)