const path = require('path');
const upperFirst = require('lodash/upperFirst');
const camelCase = require('lodash/camelCase');
const {
  name, version, repository,
} = require('./package.json');
const parserOptions = { savePropValueAsString: true };

// let sections = [
//   {
//     name: 'README',
//     content: 'README.md',
//   },
//   {
//     name: 'ScriptureCard ',
//     content: 'src/components/ScriptureCard/README.md',
//     components: () => {
//       const componentNames = ['Resource.context'];
//       return componentNames.map((componentName) => {
//         return path.resolve(
//           __dirname,
//           `src/components/resources`,
//           `${componentName}.js`,
//         );
//       });
//     },
//   },
//   {
//     name: 'ScripturePane ',
//     content: 'src/components/ScripturePane/README.md',
//     components: () => {
//       const componentNames = ['Resource.context'];
//       return componentNames.map((componentName) => {
//         return path.resolve(
//           __dirname,
//           `src/components/resources`,
//           `${componentName}.js`,
//         );
//       });
//     },
//   },
//   {
//     name: 'ScriptureSelector ',
//     content: 'src/components/ScriptureSelector/README.md',
//     components: () => {
//       const componentNames = ['Resource.context'];
//       return componentNames.map((componentName) => {
//         return path.resolve(
//           __dirname,
//           `src/components/resources`,
//           `${componentName}.js`,
//         );
//       });
//     },
//   },
//   {
//     name: 'ComboBox ',
//     content: 'src/components/ComboBox/README.md',
//     components: () => {
//       const componentNames = ['Resource.context'];
//       return componentNames.map((componentName) => {
//         return path.resolve(
//           __dirname,
//           `src/components/resources`,
//           `${componentName}.js`,
//         );
//       });
//     },
//   },
// ];

module.exports = {
  components: 'src/*.tsx',
  propsParser: require('react-docgen-typescript').withCustomConfig(
    './tsconfig.json',
    [parserOptions],
  ).parse,
  title: `${upperFirst(camelCase(name))} v${version}`,
  ribbon: {
    url: repository.url,
    text: 'View on GitHub',
  },
  // sections,
  moduleAliases: { 'single-scripture-rcl': path.resolve(__dirname, 'src') },
  skipComponentsWithoutExample: true,
  ignore: ['**/types**', '**/helpers**', '**/styled**', '**/__tests__/**', '**/*.test.{js,jsx,ts,tsx}', '**/*.spec.{js,jsx,ts,tsx}', '**/*.d.ts'],
  serverPort: 6003,
  exampleMode: 'expand',
  usageMode: 'expand',
  // getComponentPathLine(componentPath) {
  //   console.log('componentPath', componentPath);
  //   const componentName = componentPath.match(/(\w+)\/index.(t|j)sx?/)[1];
  //   console.log('componentName', componentName);
  //   return `import { ${componentName} } from '${name}';`;
  // },
  webpackConfig: {
    //https://github.com/facebook/create-react-app/pull/8079#issuecomment-562373869
    devServer: { port: 6003, transportMode: 'ws' },
    devtool: 'source-map',
    resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
    module: {
      rules: [
        {
          enforce: 'pre', test: /\.js$/, loader: 'source-map-loader',
        },
        {
          test: /\.(t|j)sx?$/, use: { loader: 'ts-loader' }, exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            { loader: 'css-loader' },
          ],
        },
      ],
    },
  },
};