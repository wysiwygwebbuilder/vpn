module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
        },
      ],
      'nativewind/babel',
    ],
    plugins: [
      [
        'react-native-reanimated/plugin',
        {
          globals: ['__scanCodes', '__scanOCR'],
          processNestedTransforms: true,
          disableProcessTransforms: false,
        },
      ],
    ],
  };
};
