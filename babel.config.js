module.exports = {
  'plugins': [
    '@babel/plugin-proposal-class-properties',
    [
      'module-resolver',
      {
        'root': ['./src'],
        'alias': {
          '@': './src'
        }
      }
    ]
  ],
  'presets': [
    [
      '@babel/preset-env',
      {
        'modules': false,
        'useBuiltIns': 'usage',
        'corejs': 3,
      }
    ],
    '@babel/preset-react',
    '@babel/preset-typescript',
    '@babel/preset-flow'
  ]
}