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
  components: 'src/**/*.tsx',
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
  webpackConfig: {
    devServer: { 
      port: 6003, 
      transportMode: 'ws',
      hot: true 
    },
    devtool: 'eval-source-map', // Better for development
    resolve: { 
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    },
    output: {
      publicPath: '/',
      globalObject: 'self',
    },
    module: {
      rules: [
        // Add this rule for workers
        {
          test: /\.worker\.(ts|js)$/,
          use: {
            loader: 'worker-loader',
            options: {
              publicPath: '/build/',
            },
          },
        },
        {
          test: /\.(ts|tsx)$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true, // Faster builds
                compilerOptions: {
                  module: 'esnext',
                  moduleResolution: 'node'
                }
              }
            }
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpg|gif|svg|woff|woff2|eot|ttf)$/,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: '[name].[ext]',
                outputPath: 'assets/',
              },
            },
          ],
        },
        {
          enforce: 'pre',
          test: /\.js$/,
          loader: 'source-map-loader',
          exclude: /node_modules/,
        },
      ],
    },
    optimization: {
      moduleIds: 'named',
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          worker: {
            test: /[\\/]workers[\\/]/,
            name: 'worker',
            chunks: 'all',
          },
        },
      },
    },
    performance: {
      hints: false,
    },
  },
};