module.exports = {
  components: 'src/**/*.tsx',
  propsParser: require('react-docgen-typescript').withCustomConfig('./tsconfig.json').parse,
  title: 'SuggestingWordAligner Component Library',
};